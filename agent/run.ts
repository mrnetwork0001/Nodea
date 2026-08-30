/**
 * The autonomous hiring agent.
 *
 * Given a task, it surveys the public fleet, picks a node on reliability evidence alone, seals
 * its prompt for that node, escrows an encrypted fee, and waits for the circuit to settle. It
 * never learns the price it paid until it decrypts its own copy of the receipt.
 *
 *   npm run agent                          run the built-in demo task
 *   npm run agent -- "your prompt here"    run your own
 *   npm run agent -- --budget 40 --tokens 20k
 */
import { loadDeployment } from "../src/lib/nodea/deployments"
import { formatCredits, parseCredits } from "../src/lib/nodea/config"
import * as compute from "../src/lib/nodea/compute"
import * as credits from "../src/lib/nodea/credits"
import * as messaging from "../src/lib/nodea/messaging"
import * as sla from "../src/lib/nodea/sla"
import { header, networkKey, prepare, explorer } from "../scripts/_identities"
import { rankNodes } from "./policy"

const DEFAULT_PROMPT =
  "SYSTEM: You are a private research agent. Summarise the counterparty risk in " +
  "the attached lending position and propose a hedge. Do not disclose the position."

const SETTLEMENT_TIMEOUT_MS = 240_000
const POLL_INTERVAL_MS = 6_000

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const deployment = loadDeployment(networkKey())

  header("Nodea agent — hiring encrypted compute")
  const agent = await prepare("agent")

  // -------------------------------------------------------------------------
  header("Surveying the fleet")
  // -------------------------------------------------------------------------
  const ranked = rankNodes(await compute.listNodes(agent, deployment.compute), {
    model: options.model,
    minUptimeBps: options.minUptimeBps,
  })
  if (ranked.length === 0) {
    throw new Error("no node matches the criteria — run `npm run seed`, or relax --model/--uptime")
  }

  for (const { node, score, reliability, jobs } of ranked) {
    console.log(
      `  node #${node.id}  ${node.modelId.padEnd(24)} ${node.gpuClass.padEnd(15)} ` +
        `${node.promisedUptimeBps / 100}% / ${node.promisedLatencyMs}ms  ` +
        `rel ${(reliability * 100).toFixed(0)}% over ${jobs} jobs  score ${score.toFixed(3)}`,
    )
  }

  const chosen = ranked[0].node
  console.log(`\n  chosen: node #${chosen.id} (${chosen.modelId})`)
  console.log(`  note:   no price appears above, because prices are not public on Nodea.`)
  console.log(`          the agent commits a sealed ceiling and lets the circuit enforce it.\n`)

  // -------------------------------------------------------------------------
  header("Sealing the prompt for that node  (coti-private-messaging)")
  // -------------------------------------------------------------------------
  const bytes = messaging.promptByteLength(options.prompt)
  const prompt = await messaging.sendPrompt(
    agent,
    deployment.promptChannel,
    chosen.operator,
    options.prompt,
  )
  console.log(`  ${bytes} bytes -> message #${prompt.messageId} in ${prompt.chunks} encrypted chunks`)
  console.log(`  tx ${explorer(prompt.txHash)}`)

  // -------------------------------------------------------------------------
  header("Escrowing an encrypted fee  (coti-private-erc20 + garbled circuits)")
  // -------------------------------------------------------------------------
  const before = await credits.balanceOf(agent, deployment.credits)
  console.log(`  balance ${formatCredits(before)} NDC (decrypted locally)`)
  if (before < options.budget) {
    throw new Error(
      `balance ${formatCredits(before)} NDC is below the ${formatCredits(options.budget)} NDC ` +
        `ceiling — claim the faucet with \`npm run seed\``,
    )
  }

  await credits.approveSpender(agent, deployment.credits, deployment.compute, options.budget)
  console.log(`  approved a sealed ceiling of ${formatCredits(options.budget)} NDC`)

  const job = await compute.openJob(agent, deployment.compute, {
    nodeId: chosen.id,
    kTokens: options.kTokens,
    maxBudget: options.budget,
    promptMessageId: prompt.messageId,
    deadline: Math.floor(Date.now() / 1000) + options.deadlineSeconds,
  })
  console.log(`\n  job #${job.jobId} opened for ${options.kTokens}k tokens`)
  console.log(`  tx ${explorer(job.txHash)}`)

  const opened = await compute.readJobAmounts(agent, deployment.compute, job.jobId)
  console.log(`  escrowed ${formatCredits(opened.cost ?? 0n)} NDC — computed in-circuit from a`)
  console.log(`  price the agent never saw, and decrypted here with the agent's own AES key`)

  // -------------------------------------------------------------------------
  header("Waiting for the node to prove execution")
  // -------------------------------------------------------------------------
  const settled = await waitForSettlement(agent, deployment, job.jobId)
  if (!settled) {
    console.log(`\n  no proof before the timeout. The escrow is safe: after the deadline the`)
    console.log(`  agent can call reclaimExpiredJob and take the sealed refund back.\n`)
    return
  }

  const amounts = await compute.readJobAmounts(agent, deployment.compute, job.jobId)
  const after = await credits.balanceOf(agent, deployment.credits)

  console.log(`\n  settled: SLA ${settled.slaMet ? "MET" : "BREACHED"} (the one public bit)`)
  console.log(`  paid to node   ${formatCredits(amounts.payout ?? 0n)} NDC`)
  console.log(`  returned       ${formatCredits(amounts.refund ?? 0n)} NDC`)
  console.log(`  delivered      ${amounts.delivered ?? 0n}k tokens vs ${amounts.workload ?? 0n}k ordered`)
  console.log(`  balance        ${formatCredits(before)} -> ${formatCredits(after)} NDC`)

  if (settled.certificateId > 0) {
    const certificate = await sla.getCertificate(agent, deployment.sla, settled.certificateId)
    console.log(`\n  SLA certificate #${certificate.tokenId} minted to the node`)
    console.log(`  its manifest is encrypted under the node's key — even the agent that paid`)
    console.log(`  for the job cannot read the operator's copy of the telemetry`)
  }

  console.log(`\n  every number above was decrypted on this machine.`)
  console.log(`  on chain they are ctUint256 ciphertexts, and stay that way.\n`)
}

async function waitForSettlement(
  agent: Awaited<ReturnType<typeof prepare>>,
  deployment: ReturnType<typeof loadDeployment>,
  jobId: number,
) {
  const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS
  process.stdout.write("  ")

  while (Date.now() < deadline) {
    const job = await compute.getJob(agent, deployment.compute, jobId)
    if (job.state === "Settled") {
      process.stdout.write("\n")
      return job
    }
    if (job.state === "Refunded") {
      process.stdout.write("\n  job was refunded before settlement\n")
      return null
    }
    process.stdout.write(".")
    await sleep(POLL_INTERVAL_MS)
  }

  process.stdout.write("\n")
  return null
}

interface AgentOptions {
  prompt: string
  kTokens: bigint
  budget: bigint
  model?: string
  minUptimeBps?: number
  deadlineSeconds: number
}

function parseArgs(argv: string[]): AgentOptions {
  const options: AgentOptions = {
    prompt: DEFAULT_PROMPT,
    kTokens: 12n,
    budget: parseCredits("25"),
    deadlineSeconds: 3_600,
  }
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case "--tokens":
        options.kTokens = BigInt(argv[++i].replace(/k$/i, ""))
        break
      case "--budget":
        options.budget = parseCredits(argv[++i])
        break
      case "--model":
        options.model = argv[++i]
        break
      case "--uptime":
        options.minUptimeBps = Math.round(Number(argv[++i]) * 100)
        break
      case "--deadline":
        options.deadlineSeconds = Number(argv[++i])
        break
      default:
        if (!arg.startsWith("--")) positional.push(arg)
    }
  }

  if (positional.length > 0) options.prompt = positional.join(" ")
  return options
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
