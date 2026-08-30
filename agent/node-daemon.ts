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

const degrade = process.argv.includes("--degrade")
const once = process.argv.includes("--once")

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

  const handled = new Set<number>()

  // Jobs already settled before this daemon started are not ours to redo.
  for (const nodeId of owned) {
    for (const jobId of await compute.jobsOfNode(operator, deployment.compute, nodeId)) {
      const job = await compute.getJob(operator, deployment.compute, jobId)
      if (job.state !== "Escrowed") handled.add(jobId)
    }
  }

  for (;;) {
    for (const nodeId of owned) {
      for (const jobId of await compute.jobsOfNode(operator, deployment.compute, nodeId)) {
        if (handled.has(jobId)) continue

        const job = await compute.getJob(operator, deployment.compute, jobId)
        if (job.state !== "Escrowed") {
          handled.add(jobId)
          continue
        }

        await serve(deployment, operator, job)
        handled.add(jobId)

        if (once) return
      }
    }
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
  const orderedKTokens = amounts.workload ?? 0n
  console.log(`     ordered  ${orderedKTokens}k tokens  (decrypted with the operator's AES key)`)

  // 3. Run it.
  const result = await runInference(prompt, {
    model: node.modelId,
    orderedKTokens,
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
    `     served   ${result.deliveredKTokens}k tokens, ${result.latencyMs}ms TTFT, ` +
      `${result.uptimeBps / 100}% uptime  [${result.backend}]`,
  )

  // Delivered volume is compared in-circuit against what the agent ordered, and a real model stops
  // when it is done rather than filling the budget. Say so plainly here: a shortfall is a genuine
  // breach under the contract's rules, not a bug, and the operator should see it coming rather
  // than discover it in the settlement.
  if (result.deliveredKTokens < orderedKTokens) {
    console.log(
      `     ! short   delivered ${result.deliveredKTokens}k against ${orderedKTokens}k ordered — ` +
        `the circuit will record an SLA breach and slash this payout.`,
    )
  }

  // 4. Attest and settle. The digest binds the receipt to this exact completion, so the
  //    certificate is evidence of *this* run rather than a generic claim of uptime.
  const attestationDigest = ethers.keccak256(
    ethers.toUtf8Bytes(`nodea:${job.id}:${node.modelId}:${result.completion}`),
  )

  const proof = await compute.submitProof(operator, deployment.compute, {
    jobId: job.id,
    deliveredKTokens: result.deliveredKTokens,
    uptimeBps: result.uptimeBps,
    latencyMs: result.latencyMs,
    attestationDigest,
    manifest: buildManifest({
      job: job.id,
      model: node.modelId,
      tokens: Number(result.deliveredKTokens) * 1000,
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
