/**
 * Generate the three demo identities Nodea needs and print them as a .env block.
 *
 * Keys are written to stdout and nowhere else — nothing here touches the network, and nothing
 * is persisted for you. Fund the printed addresses at https://faucet.coti.io before deploying.
 */
import { ethers } from "ethers"
import { DEFAULT_NETWORK, NETWORKS } from "../src/lib/nodea/config"

const ROLES = [
  ["NODEA_DEPLOYER_KEY", "deployer — owns token admin roles"],
  ["NODEA_NODE_OPERATOR_KEY", "GPU node operator — registers a node, submits proofs"],
  ["NODEA_AGENT_KEY", "AI agent — hires compute, pays in encrypted NDC"],
] as const

console.log("\n# --- Nodea demo identities: paste into .env ---\n")

const addresses: string[] = []
for (const [name, role] of ROLES) {
  const wallet = ethers.Wallet.createRandom()
  addresses.push(wallet.address)
  console.log(`# ${role}`)
  console.log(`# ${wallet.address}`)
  console.log(`${name}=${wallet.privateKey}\n`)
}

const network = NETWORKS[DEFAULT_NETWORK]
console.log(`# Target: ${network.name} — ${network.fundingHint}.`)
console.log(`# Fund all three:`)
for (const address of addresses) console.log(`#   ${address}`)
console.log()
