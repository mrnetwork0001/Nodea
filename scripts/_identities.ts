/**
 * Loads the three demo identities from `.env` and gets them onboarded.
 *
 * Onboarding is the step people forget: an account can sign transactions the moment it is
 * funded, but until COTI's `AccountOnboard` has issued its AES key shares it cannot seal an
 * input or read a single one of its own encrypted balances. Doing it here, once, keeps every
 * script below free of key-management noise.
 */
import * as dotenv from "dotenv"
import { ethers, type Wallet } from "@coti-io/coti-ethers"
import { DEFAULT_NETWORK, NETWORKS, type NodeaNetworkKey } from "../src/lib/nodea/config"
import { ensureOnboarded, walletFromKey } from "../src/lib/nodea/account"

dotenv.config()

export type Role = "deployer" | "operator" | "agent"

const ENV_KEYS: Record<Role, string> = {
  deployer: "NODEA_DEPLOYER_KEY",
  operator: "NODEA_NODE_OPERATOR_KEY",
  agent: "NODEA_AGENT_KEY",
}

export function networkKey(): NodeaNetworkKey {
  const requested = process.env.NODEA_NETWORK
  return requested === "cotiTestnet" || requested === "cotiMainnet" ? requested : DEFAULT_NETWORK
}

export function loadWallet(role: Role): Wallet {
  const key = process.env[ENV_KEYS[role]]
  if (!key) {
    throw new Error(`${ENV_KEYS[role]} is not set. Run \`npx tsx scripts/keygen.ts\` and fill in .env.`)
  }
  return walletFromKey(key, NETWORKS[networkKey()])
}

/** Fund check, onboard, and report — the preamble every demo script shares. */
export async function prepare(role: Role): Promise<Wallet> {
  const network = NETWORKS[networkKey()]
  const wallet = loadWallet(role)
  const balance = await wallet.provider!.getBalance(wallet.address)

  console.log(`  ${role.padEnd(9)} ${wallet.address}  ${ethers.formatEther(balance)} COTI`)

  if (balance === 0n) {
    throw new Error(
      `${role} (${wallet.address}) has no COTI on ${network.name}. To continue, ${network.fundingHint}.`,
    )
  }

  await ensureOnboarded(wallet, network)
  return wallet
}

export function header(title: string): void {
  console.log(`\n${"─".repeat(74)}\n  ${title}\n${"─".repeat(74)}`)
}

export function explorer(hash: string): string {
  return `${NETWORKS[networkKey()].explorerUrl}/tx/${hash}`
}
