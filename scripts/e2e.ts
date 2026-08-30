/**
 * The full Nodea lifecycle against live COTI, narrated.
 *
 * This is the script the demo video follows. It runs one real inference job end to end and, at
 * every step, prints both what an observer can read off the chain and what the two counterparties
 * can decrypt locally — because the gap between those two columns is the entire product.
 */
import { ethers } from "@coti-io/coti-ethers"
import { loadDeployment } from "../src/lib/nodea/deployments"
import { formatCredits, parseCredits, SLA_SLASH_BPS, BPS_DENOMINATOR } from "../src/lib/nodea/config"
import * as compute from "../src/lib/nodea/compute"
import * as credits from "../src/lib/nodea/credits"
import * as messaging from "../src/lib/nodea/messaging"
import * as sla from "../src/lib/nodea/sla"
import { buildManifest } from "../src/lib/nodea/sla"
import { header, networkKey, prepare, explorer } from "./_identities"

/** The agent's proprietary instruction — the thing a transparent chain would publish. */
const PROMPT =
  "SYSTEM: You are an arbitrage scout. Rank ETH/USDC pools by 24h fee yield " +
  "net of gas, and flag any pool whose depth fell >30% this hour."

const WORKLOAD_TOKENS = 12n // 12,000 generated tokens
const MAX_BUDGET = parseCredits("25")

async function main() {
  const deployment = loadDeployment(networkKey())

  header("Nodea — encrypted compute lifecycle on COTI")
  const agent = await prepare("agent")
  const operator = await prepare("operator")

  const nodes = await compute.listNodes(agent, deployment.compute)
  const node = nodes.find((candidate) => candidate.active && candidate.operator === operator.address)
  if (!node) throw new Error("no active node registered by the operator — run `npm run seed` first")

  console.log(`\n  hiring node #${node.id}: ${node.modelId} on ${node.gpuClass} (${node.region})`)
  console.log(`  public commitment: ${node.promisedUptimeBps / 100}% uptime, <${node.promisedLatencyMs}ms TTFT`)
  console.log(`  price: not public — the agent will pay it without ever learning it`)

  // -------------------------------------------------------------------------
  header("1/5  Sealing the prompt for this node only  (coti-private-messaging)")
  // -------------------------------------------------------------------------
  console.log(`  plaintext (${messaging.promptByteLength(PROMPT)} bytes, never leaves this process):`)
  console.log(`    "${PROMPT.slice(0, 68)}..."`)

  const prompt = await messaging.sendPrompt(agent, deployment.promptChannel, node.operator, PROMPT)
  console.log(`\n  on chain: message #${prompt.messageId}, ${prompt.chunks} encrypted chunks`)
  console.log(`  tx        ${explorer(prompt.txHash)}`)

  const recovered = await messaging.readPrompt(operator, deployment.promptChannel, prompt.messageId)
  console.log(`  the hired node decrypts it: ${recovered === PROMPT ? "exact match" : "MISMATCH"}`)
  console.log(`  everyone else reads a ctString and gets nothing`)

  // -------------------------------------------------------------------------
  header("2/5  Escrowing the fee without revealing it  (coti-private-erc20)")
  // -------------------------------------------------------------------------
  const agentBefore = await credits.balanceOf(agent, deployment.credits)
  const operatorBefore = await credits.balanceOf(operator, deployment.credits)
  console.log(`  agent balance before     ${formatCredits(agentBefore)} NDC`)
  console.log(`  operator balance before  ${formatCredits(operatorBefore)} NDC`)

  await credits.approveSpender(agent, deployment.credits, deployment.compute, MAX_BUDGET)
  console.log(`\n  approved an encrypted ceiling of ${formatCredits(MAX_BUDGET)} NDC to the escrow`)
  console.log(`  the agent does not compute the cost — the circuit does`)

  // -------------------------------------------------------------------------
  header("3/5  Opening the job  (coti-smart-contracts / garbled circuits)")
  // -------------------------------------------------------------------------
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const job = await compute.openJob(agent, deployment.compute, {
    nodeId: node.id,
    tokens: WORKLOAD_TOKENS,
    maxBudget: MAX_BUDGET,
    promptMessageId: prompt.messageId,
    deadline,
  })
  console.log(`  job #${job.jobId} opened`)
  console.log(`  tx    ${explorer(job.txHash)}`)
  console.log(`\n  inside the circuit:  cost = sealed(price) x sealed(${WORKLOAD_TOKENS} tokens)`)
  console.log(`                       assert cost <= sealed(budget)`)
  console.log(`                       escrow cost, agent -> contract, as an encrypted transfer`)

  const agentView = await compute.readJobAmounts(agent, deployment.compute, job.jobId)
  console.log(`\n  the agent decrypts its own copy:  cost = ${formatCredits(agentView.cost ?? 0n)} NDC`)
  console.log(`  the operator decrypts its copy of the same value; nobody else can`)

  // -------------------------------------------------------------------------
  header("4/5  Proving execution and settling  (garbled-circuit SLA arbitration)")
  // -------------------------------------------------------------------------
  const measured = { uptimeBps: 9_970, latencyMs: 310, deliveredTokens: 12n }
  const attestation = ethers.keccak256(
    ethers.toUtf8Bytes(`nodea:${job.jobId}:${node.modelId}:${measured.deliveredTokens}`),
  )

  console.log(`  node's measurements (sealed on submission):`)
  console.log(`    uptime    ${measured.uptimeBps / 100}%   vs promise ${node.promisedUptimeBps / 100}%`)
  console.log(`    latency   ${measured.latencyMs}ms   vs promise ${node.promisedLatencyMs}ms`)
  console.log(`    delivered ${measured.deliveredTokens}   vs minimum ${WORKLOAD_TOKENS}`)

  const proof = await compute.submitProof(operator, deployment.compute, {
    jobId: job.jobId,
    deliveredTokens: measured.deliveredTokens,
    uptimeBps: measured.uptimeBps,
    latencyMs: measured.latencyMs,
    attestationDigest: attestation,
    manifest: buildManifest({
      job: job.jobId,
      model: node.modelId,
      tokens: Number(measured.deliveredTokens),
      uptimeBps: measured.uptimeBps,
      latencyMs: measured.latencyMs,
      attestation: attestation.slice(0, 18),
    }),
  })

  console.log(`\n  circuit verdict: SLA ${proof.slaMet ? "MET" : "BREACHED"}`)
  console.log(`  payout selected with mux(verdict, cost, cost x ${(BPS_DENOMINATOR - SLA_SLASH_BPS) / 100}%)`)
  console.log(`  tx  ${explorer(proof.txHash)}`)

  const operatorView = await compute.readJobAmounts(operator, deployment.compute, job.jobId)
  console.log(`\n  operator decrypts payout:  ${formatCredits(operatorView.payout ?? 0n)} NDC`)
  console.log(`  agent decrypts refund:     ${formatCredits(
    (await compute.readJobAmounts(agent, deployment.compute, job.jobId)).refund ?? 0n,
  )} NDC`)

  // -------------------------------------------------------------------------
  header("5/5  The confidential SLA receipt  (coti-private-nft)")
  // -------------------------------------------------------------------------
  const certificate = await sla.getCertificate(operator, deployment.sla, proof.certificateId)
  console.log(`  certificate #${certificate.tokenId} minted to ${certificate.nodeOperator}`)
  console.log(`  public on the token:   job ${certificate.jobId}, promised ${certificate.promisedUptimeBps / 100}%, SLA ${certificate.slaMet ? "met" : "breached"}`)

  const manifest = await sla.readManifest(operator, deployment.sla, certificate.tokenId)
  console.log(`  encrypted in the URI:  ${JSON.stringify(manifest)}`)
  console.log(`  readable only by the operator that owns the token`)

  // -------------------------------------------------------------------------
  header("What the chain published, and what it did not")
  // -------------------------------------------------------------------------
  const agentAfter = await credits.balanceOf(agent, deployment.credits)
  const operatorAfter = await credits.balanceOf(operator, deployment.credits)

  console.log(`  public:   a job happened between ${short(agent.address)} and ${short(operator.address)}`)
  console.log(`            the node kept its SLA, and holds one more certificate`)
  console.log(`\n  private:  the prompt, the rate card, the budget, the workload size,`)
  console.log(`            the cost, the payout, the refund, and both balances`)
  console.log(`\n  agent    ${formatCredits(agentBefore)} -> ${formatCredits(agentAfter)} NDC`)
  console.log(`  operator ${formatCredits(operatorBefore)} -> ${formatCredits(operatorAfter)} NDC`)
  console.log(`  (both figures decrypted locally; neither exists in the clear on chain)\n`)
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
