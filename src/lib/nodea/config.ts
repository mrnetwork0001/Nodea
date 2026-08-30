/**
 * Network and protocol constants for Nodea.
 *
 * Nodea runs natively on COTI v2 — the privacy layer is the chain, not a sidecar — so there is
 * no "mock" or "local" mode here. The MPC precompile that backs every garbled-circuit operation
 * only exists on COTI, and a Hardhat node would silently produce meaningless ciphertext.
 */
import { ONBOARD_CONTRACT_ADDRESS } from "@coti-io/coti-ethers"

export type NodeaNetworkKey = "cotiTestnet" | "cotiMainnet"

export interface NodeaNetwork {
  key: NodeaNetworkKey
  name: string
  chainId: number
  rpcUrl: string
  explorerUrl: string
  /** COTI's AccountOnboard contract — the source of a user's AES key shares. */
  onboardContract: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export const NETWORKS: Record<NodeaNetworkKey, NodeaNetwork> = {
  cotiTestnet: {
    key: "cotiTestnet",
    name: "COTI Testnet",
    chainId: 7082400,
    rpcUrl: "https://testnet.coti.io/rpc",
    explorerUrl: "https://testnet.cotiscan.io",
    onboardContract: ONBOARD_CONTRACT_ADDRESS,
    nativeCurrency: { name: "COTI", symbol: "COTI", decimals: 18 },
  },
  cotiMainnet: {
    key: "cotiMainnet",
    name: "COTI Mainnet",
    chainId: 2632500,
    rpcUrl: "https://mainnet.coti.io/rpc",
    explorerUrl: "https://mainnet.cotiscan.io",
    onboardContract: ONBOARD_CONTRACT_ADDRESS,
    nativeCurrency: { name: "COTI", symbol: "COTI", decimals: 18 },
  },
}

export const DEFAULT_NETWORK: NodeaNetworkKey = "cotiTestnet"

/** NodeaCredits uses 6 decimals, matching the granularity of per-1k-token inference pricing. */
export const CREDIT_DECIMALS = 6
export const CREDIT_UNIT = 10n ** BigInt(CREDIT_DECIMALS)

/** Mirrors `NodeaCompute.SLA_SLASH_BPS`. */
export const SLA_SLASH_BPS = 4000
export const BPS_DENOMINATOR = 10000

/**
 * Ceiling on a single on-chain prompt, inherited from COTI's `PrivateMessaging`:
 * `MAX_CHUNKS_PER_MESSAGE` (64) x `MAX_CHUNK_CELLS` (3) x 8 bytes per `ctUint64` cell.
 */
export const PROMPT_MAX_CHUNKS = 64
export const PROMPT_CELLS_PER_CHUNK = 3
export const PROMPT_BYTES_PER_CELL = 8
export const PROMPT_BYTES_PER_CHUNK = PROMPT_CELLS_PER_CHUNK * PROMPT_BYTES_PER_CELL
export const PROMPT_MAX_BYTES = PROMPT_MAX_CHUNKS * PROMPT_BYTES_PER_CHUNK

export function explorerTx(network: NodeaNetwork, hash: string): string {
  return `${network.explorerUrl}/tx/${hash}`
}

export function explorerAddress(network: NodeaNetwork, address: string): string {
  return `${network.explorerUrl}/address/${address}`
}

/** Format NodeaCredits base units for display. */
export function formatCredits(value: bigint): string {
  const whole = value / CREDIT_UNIT
  const frac = value % CREDIT_UNIT
  if (frac === 0n) return whole.toString()
  return `${whole}.${frac.toString().padStart(CREDIT_DECIMALS, "0").replace(/0+$/, "")}`
}

/** Parse a decimal NDC string into base units. */
export function parseCredits(value: string): bigint {
  const [whole, frac = ""] = value.trim().split(".")
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error(`not a decimal amount: ${value}`)
  }
  return BigInt(whole || "0") * CREDIT_UNIT + BigInt((frac + "0".repeat(CREDIT_DECIMALS)).slice(0, CREDIT_DECIMALS))
}
