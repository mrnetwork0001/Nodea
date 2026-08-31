/**
 * The GPU node daemon.
 *
 * Watches the encrypted prompt channel for work addressed to this operator, decrypts each prompt
 * with the operator's own AES key, runs inference, and submits sealed proof of execution to the
 * escrow. It never sees a price it did not set, never learns the agent's budget, and finds out
 * what it earned only by decrypting its own copy of the payout afterwards.
 *
 *   npm run node-daemon             serve honestly
 *   npm run node-daemon -- --degrade   under-deliver, to show in-circuit slashing
 */
import { ethers } from "@coti-io/coti-ethers"
import { loadDeployment } from "../src/lib/nodea/deployments"
import { formatCredits } from "../src/lib/nodea/config"
import * as compute from "../src/lib/nodea/compute"
import * as credits from "../src/lib/nodea/credits"
import * as messaging from "../src/lib/nodea/messaging"
import { buildManifest } from "../src/lib/nodea/sla"
import type { JobRecord } from "../src/lib/nodea/types"
import { header, networkKey, prepare, explorer } from "../scripts/_identities"
import { runInference } from "./inference"

const POLL_INTERVAL_MS = 6_000

/**
 * How many times to retry one job before abandoning it.
 *
 * A job can fail for reasons that will never resolve - a model the Router has dropped, a prompt
 * that will not decrypt - and retrying those forever means never reaching the jobs behind them.
 * After this many attempts the daemon gives up on that job and moves on. The escrow is not lost:
 * the agent reclaims it once the deadline passes.
 */
const MAX_ATTEMPTS = 3

/** Backoff after a failed poll, so a chain outage does not become a request flood. */
const ERROR_BACKOFF_MS = 30_000

const degrade = process.argv.includes("--degrade")
const once = process.argv.includes("--once")

/**
 * Set by SIGTERM/SIGINT. Checked between jobs, never inside one.
 *
 * A job in flight is the worst possible moment to die. Between decrypting the prompt and landing
 * `submitProof` the escrow is already held, so a process killed there leaves the job stranded until
 * the agent reclaims it - and that expiry is a permanent, public SLA breach against the node. So a
 * stop request lets the current job finish and takes effect before the next one starts.
 *
 * `systemctl restart` and `stop` both send SIGTERM and then wait TimeoutStopSec, which the unit
 * sets generously enough for a settlement to complete.
 */
let stopping = false

function requestStop(signal: string) {
  if (stopping) return // a second Ctrl-C should not be read as "try harder"
  stopping = true
  console.log(`\n  ${signal} received. Finishing any job in flight, then stopping.`)
}

async function main() {
  const deployment = loadDeployment(networkKey())

  header(`Nodea node daemon${degrade ? "  (degraded mode — will breach SLA)" : ""}`)
  const operator = await prepare("operator")

  const owned = await compute.nodesOf(operator, deployment.compute, operator.address)
  if (owned.length === 0) {
    throw new Error(`${operator.address} has no registered nodes — run \`npm run seed\` first`)
  }
  console.log(`\n  serving node ids ${owned.join(", ")}`)
  console.log(`  watching the encrypted prompt channel at ${deployment.promptChannel}\n`)

  process.on("SIGTERM", () => requestStop("SIGTERM"))
  process.on("SIGINT", () => requestStop("SIGINT"))

  const handled = new Set<number>()
  const attempts = new Map<number, number>()

  // Jobs already settled before this daemon started are not ours to redo.
  for (const nodeId of owned) {
    for (const jobId of await compute.jobsOfNode(operator, deployment.compute, nodeId)) {
      const job = await compute.getJob(operator, deployment.compute, jobId)
      if (job.state !== "Escrowed") handled.add(jobId)
    }
  }

  for (;;) {
    if (stopping) return

    // The whole sweep is guarded. An RPC blip while listing jobs is transient and must not take
    // the process down - a node that stops answering while still advertising `active` accrues
    // breaches, and every one of those is permanent in a public record.
    try {
      for (const nodeId of owned) {
        for (const jobId of await compute.jobsOfNode(operator, deployment.compute, nodeId)) {
          if (handled.has(jobId)) continue

          const job = await compute.getJob(operator, deployment.compute, jobId)
          if (job.state !== "Escrowed") {
            handled.add(jobId)
            continue
          }

          // Checked before starting work, not during it.
          if (stopping) return

          try {
            await serve(deployment, operator, job)
            handled.add(jobId)
            attempts.delete(jobId)

            if (once) return
          } catch (cause) {
            const tries = (attempts.get(jobId) ?? 0) + 1
            attempts.set(jobId, tries)

            const reason = cause instanceof Error ? cause.message : String(cause)
            console.error(`  job #${jobId} failed (${tries}/${MAX_ATTEMPTS}): ${reason.slice(0, 200)}`)

            if (tries >= MAX_ATTEMPTS) {
              handled.add(jobId)
              console.error(
                `  giving up on job #${jobId}. Its escrow is not lost - the agent reclaims it ` +
                  `after the deadline, and this node takes the breach.`,
              )
            }
            if (once) return
          }
        }
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      console.error(`  sweep failed: ${reason.slice(0, 200)} - retrying in ${ERROR_BACKOFF_MS / 1000}s`)
      await sleep(ERROR_BACKOFF_MS)
      continue
    }

    // `--once` means one sweep, not "wait indefinitely for a first job". Previously it polled
    // forever in silence when the queue was empty, which reads as a hang rather than as nothing
    // to do - and it is the flag a smoke test reaches for.
    if (once) {
      console.log(`  no escrowed jobs on ${owned.length} node${owned.length === 1 ? "" : "s"}. Nothing to serve.\n`)
      return
    }

    if (stopping) return

    await sleep(POLL_INTERVAL_MS)
  }
}

async function serve(
  deployment: ReturnType<typeof loadDeployment>,
  operator: Awaited<ReturnType<typeof prepare>>,
  job: JobRecord,
): Promise<void> {
  const node = await compute.getNode(operator, deployment.compute, job.nodeId)

  console.log(`  job #${job.id}  node #${job.nodeId}  from ${short(job.client)}`)

  // 1. Decrypt the prompt. This is the only place the plaintext exists.
  const prompt = await messaging.readPrompt(operator, deployment.promptChannel, job.promptMessageId)
  console.log(`     prompt   ${prompt.length} chars decrypted from message #${job.promptMessageId}`)

  // 2. Learn how much work was paid for — sealed for us, unreadable to anyone else.
  const amounts = await compute.readJobAmounts(operator, deployment.compute, job.id)
  const orderedTokens = amounts.workload ?? 0n
  console.log(`     ordered  ${orderedTokens} tokens minimum  (decrypted with the operator's AES key)`)

  // 3. Run it.
  const result = await runInference(prompt, {
    model: node.modelId,
    orderedTokens,
    degrade,
  })
  if (result.zeroG) {
    console.log(`     0G       ${result.zeroG.model} via ${short(result.zeroG.provider)}`)
    console.log(
      `              ${result.zeroG.completionTokens} tokens billed, signature ` +
        `${result.zeroG.verified === null ? "n/a (not a verifiable service)" : result.zeroG.verified ? "valid" : "INVALID"}`,
    )
  }
  console.log(
    `     served   ${result.deliveredTokens} tokens, ${result.latencyMs}ms TTFT, ` +
      `${result.uptimeBps / 100}% uptime  [${result.backend}]`,
  )

  // Delivered volume is compared in-circuit against what the agent ordered, and a real model stops
  // when it is done rather than filling the budget. Say so plainly here: a shortfall is a genuine
  // breach under the contract's rules, not a bug, and the operator should see it coming rather
  // than discover it in the settlement.
  if (result.deliveredTokens < orderedTokens) {
    console.log(
      `     ! short   delivered ${result.deliveredTokens} against ${orderedTokens} ordered - ` +
        `the circuit will record an SLA breach and slash this payout.`,
    )
  }

  // 4. Return the answer, sealed for the agent alone.
  //
  //    This is the product. Everything else - the escrow, the SLA, the certificate - exists to
  //    make paying for this safe. It travels back down the same E2EE channel the prompt came in
  //    on, so the request and the answer get identical protection.
  const returned = await messaging.sendResult(
    operator,
    deployment.promptChannel,
    job.client,
    job.id,
    result.completion,
    // What actually served it. A fact about this answer, sealed with it - not a marketplace claim.
    { backend: result.backend, model: result.zeroG?.model ?? node.modelId },
  )
  console.log(
    `     returned ${result.completion.length} chars in ${returned.parts} sealed ` +
      `message${returned.parts === 1 ? "" : "s"} (#${returned.messageIds.join(", #")})`,
  )

  // 5. Attest and settle. The digest binds the receipt to this exact completion, so the
  //    certificate is evidence of *this* run rather than a generic claim of uptime.
  const attestationDigest = ethers.keccak256(
    ethers.toUtf8Bytes(`nodea:${job.id}:${node.modelId}:${result.completion}`),
  )

  const proof = await compute.submitProof(operator, deployment.compute, {
    jobId: job.id,
    deliveredTokens: result.deliveredTokens,
    uptimeBps: result.uptimeBps,
    latencyMs: result.latencyMs,
    attestationDigest,
    manifest: buildManifest({
      job: job.id,
      model: node.modelId,
      tokens: Number(result.deliveredTokens),
      uptimeBps: result.uptimeBps,
      latencyMs: result.latencyMs,
      attestation: attestationDigest.slice(0, 18),
    }),
  })

  const settled = await compute.readJobAmounts(operator, deployment.compute, job.id)
  console.log(`     verdict  SLA ${proof.slaMet ? "MET" : "BREACHED"} — decided inside the circuit`)
  console.log(`     earned   ${formatCredits(settled.payout ?? 0n)} NDC  (decrypted locally)`)
  console.log(`     receipt  SLA certificate #${proof.certificateId}`)
  console.log(`     tx       ${explorer(proof.txHash)}`)

  const balance = await credits.balanceOf(operator, deployment.credits)
  console.log(`     balance  ${formatCredits(balance)} NDC\n`)
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
