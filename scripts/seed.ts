/**
 * Seed a fresh Nodea deployment with a demo fleet.
 *
 * Registers three GPU nodes with different confidential rate cards and different public SLA
 * commitments, then tops the agent up from the NDC faucet. Prices go on chain sealed — the
 * numbers printed here are what the *operator* knows locally, and are re-read back through
 * decryption at the end to prove the round trip.
 */
import { loadDeployment } from "../src/lib/nodea/deployments"
import { formatCredits, parseCredits } from "../src/lib/nodea/config"
import * as compute from "../src/lib/nodea/compute"
import * as credits from "../src/lib/nodea/credits"
import { header, networkKey, prepare, explorer } from "./_identities"

const FLEET = [
  {
    modelId: "claude-opus-5",
    gpuClass: "H100-80GB-SXM",
    region: "eu-central",
    promisedUptimeBps: 9_950,
    promisedLatencyMs: 400,
    pricePerToken: parseCredits("0.00085"),
  },
  {
    modelId: "deepseek-v4-flash",
    gpuClass: "A100-80GB",
    region: "us-east",
    promisedUptimeBps: 9_900,
    promisedLatencyMs: 650,
    pricePerToken: parseCredits("0.00042"),
  },
  {
    modelId: "qwen3.8-flash",
    gpuClass: "L40S-48GB",
    region: "ap-southeast",
    promisedUptimeBps: 9_500,
    promisedLatencyMs: 1_200,
    pricePerToken: parseCredits("0.00019"),
  },
] as const

async function main() {
  const deployment = loadDeployment(networkKey())

  header("Nodea — seeding the demo fleet")
  const operator = await prepare("operator")
  const agent = await prepare("agent")

  header("Registering GPU nodes (rate cards sealed on submission)")
  for (const spec of FLEET) {
    const { nodeId, txHash } = await compute.registerNode(operator, deployment.compute, spec)
    console.log(`  node #${nodeId}  ${spec.modelId} on ${spec.gpuClass} (${spec.region})`)
    console.log(`     promises  ${spec.promisedUptimeBps / 100}% uptime, <${spec.promisedLatencyMs}ms TTFT`)
    console.log(`     price     ${formatCredits(spec.pricePerToken)} NDC / token  — encrypted on chain`)
    console.log(`     tx        ${explorer(txHash)}\n`)
  }

  header("Verifying the rate cards decrypt only for their operator")
  for (const node of await compute.listNodes(operator, deployment.compute)) {
    const price = await compute.readNodePrice(operator, deployment.compute, node.id)
    console.log(`  node #${node.id}  operator reads ${formatCredits(price)} NDC / token`)
  }
  console.log(`\n  A block explorer reading the same storage slots sees only ciphertext.`)

  header("Funding the agent with NDC compute credits")
  const balanceBefore = await credits.balanceOf(agent, deployment.credits)
  if (balanceBefore === 0n) {
    const { txHash, amount } = await credits.claimFaucet(agent, deployment.credits)
    console.log(`  claimed ${formatCredits(amount)} NDC`)
    console.log(`  tx      ${explorer(txHash)}`)
  }
  const balance = await credits.balanceOf(agent, deployment.credits)
  console.log(`\n  agent balance ${formatCredits(balance)} NDC (decrypted locally with the agent's AES key)`)
  console.log(`  the same balance on chain: an encrypted ctUint256 nobody else can read\n`)
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
