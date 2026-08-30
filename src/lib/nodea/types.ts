import type { Wallet, JsonRpcSigner } from "@coti-io/coti-ethers"
import type { ctUint256, itString, itUint256 } from "@coti-io/coti-sdk-typescript"

/**
 * Anything that can seal a value for COTI's MPC layer and unseal one addressed to it.
 *
 * Both COTI signer flavours satisfy this: `Wallet` (a private key, used by the agent runtime and
 * deploy scripts) and `JsonRpcSigner` (a browser wallet, used by the dashboard). Every Nodea
 * module is written against this interface so the same code path serves both.
 */
export interface CotiSigner {
  getAddress(): Promise<string>
  encryptValue(
    plaintext: bigint | number | string,
    contractAddress: string,
    functionSelector: string,
  ): Promise<itUint256 | itString | { ciphertext: bigint; signature: Uint8Array | string }>
  encryptValue256(
    plaintext: bigint | number,
    contractAddress: string,
    functionSelector: string,
  ): Promise<itUint256>
  decryptValue256(ciphertext: ctUint256): Promise<bigint>
  decryptValue(ciphertext: bigint | { value: Array<bigint> }): Promise<bigint | string>
  generateOrRecoverAes(onboardContractAddress?: string): Promise<void>
  getUserOnboardInfo(): { aesKey?: string | null } | undefined
}

export type AnyCotiSigner = Wallet | JsonRpcSigner

/** Public listing data for a GPU node. Never includes its price. */
export interface NodeListing {
  id: number
  operator: string
  active: boolean
  modelId: string
  gpuClass: string
  region: string
  promisedUptimeBps: number
  promisedLatencyMs: number
  registeredAt: number
  jobsSettled: number
  jobsBreached: number
}

export const JOB_STATES = ["None", "Escrowed", "Settled", "Refunded"] as const
export type JobState = (typeof JOB_STATES)[number]

/** Public job record. Every amount attached to it lives in a separate sealed view. */
export interface JobRecord {
  id: number
  nodeId: number
  client: string
  operator: string
  state: JobState
  openedAt: number
  deadline: number
  settledAt: number
  promptMessageId: number
  attestationDigest: string
  slaMet: boolean
  certificateId: number
}

/** A quantity that only the job's two counterparties can read, once decrypted. */
export interface SealedAmounts {
  workload?: bigint
  cost?: bigint
  payout?: bigint
  refund?: bigint
  delivered?: bigint
}

export interface SlaCertificate {
  tokenId: number
  jobId: number
  nodeOperator: string
  client: string
  issuedAt: number
  promisedUptimeBps: number
  attestationDigest: string
  slaMet: boolean
}

/** The decrypted contents of a certificate's encrypted token URI. */
export interface SlaManifest {
  job: number
  model: string
  tokens: number
  uptimeBps: number
  latencyMs: number
  attestation: string
}

export interface PromptMessage {
  id: number
  from: string
  to: string
  timestamp: number
  epoch: number
  chunkCount: number
}
