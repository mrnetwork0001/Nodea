/**
 * COTI skill 5 - `coti-smart-contracts` (garbled circuits).
 *
 * The client for `NodeaCompute`: the escrow that prices a job, judges an SLA and splits the
 * payment entirely inside COTI's MPC layer.
 *
 * The shape worth noticing in this module is what is *absent*. An agent opening a job never
 * learns the node's price, and never computes the cost - it seals a workload size and a ceiling,
 * and the multiplication and comparison happen in the circuit. A node submitting proof never
 * learns what it will be paid until it decrypts its own copy afterwards. Neither party, and no
 * observer, sees the other's numbers at any point.
 */
import type { ContractRunner, Provider } from "@coti-io/coti-ethers"
import type { itString, itUint256 } from "@coti-io/coti-sdk-typescript"
import { isZeroCtUint256 } from "@coti-io/coti-sdk-typescript"
import { computeContract, normalizeCtUint256, requireEvent } from "./contracts"
import { mpcGas, MPC_GAS_HEAVY } from "./gas"
import { JOB_STATES, type CotiSigner, type JobRecord, type NodeListing, type SealedAmounts } from "./types"

/** `registerNode(string,string,string,uint32,uint32,((uint256,uint256),bytes))` */
export const REGISTER_NODE_SELECTOR = "0x426116e3"
/** `updateNodePrice(uint256,((uint256,uint256),bytes))` */
export const UPDATE_PRICE_SELECTOR = "0x9cff6a94"
/** `openJob(uint256,((uint256,uint256),bytes),((uint256,uint256),bytes),uint256,uint64)` */
export const OPEN_JOB_SELECTOR = "0x9e353d64"
/** `submitProof(uint256,IT,IT,IT,bytes32,itString)` - all four sealed arguments share this selector. */
export const SUBMIT_PROOF_SELECTOR = "0xf91370d2"

export interface RegisterNodeParams {
  modelId: string
  gpuClass: string
  region: string
  /** Public commitment, in basis points. 9_900 = "99% uptime". */
  promisedUptimeBps: number
  /** Public commitment, in milliseconds, for time to first token. */
  promisedLatencyMs: number
  /** Confidential rate card: NDC base units per 1,000 generated tokens. */
  pricePerKToken: bigint
}

export interface OpenJobParams {
  nodeId: number
  /** Workload ordered, in thousands of tokens. Sealed. */
  kTokens: bigint
  /** The most the agent will pay for this job. Sealed. */
  maxBudget: bigint
  /** Id of the E2EE prompt already delivered to this node. */
  promptMessageId: number
  /** Unix seconds after which the agent may reclaim the escrow. */
  deadline: number
}

export interface SubmitProofParams {
  jobId: number
  /** Workload actually produced, in thousands of tokens. Sealed and compared in-circuit. */
  deliveredKTokens: bigint
  /** Measured uptime, in basis points. Sealed. */
  uptimeBps: number
  /** Measured time to first token, in milliseconds. Sealed. */
  latencyMs: number
  /** keccak256 of the node's off-chain execution attestation. */
  attestationDigest: string
  /** Compact JSON manifest sealed into the certificate's token URI. */
  manifest: string
}

// ---------------------------------------------------------------------------
// Node registry
// ---------------------------------------------------------------------------

export async function registerNode(
  signer: CotiSigner,
  computeAddress: string,
  params: RegisterNodeParams,
): Promise<{ nodeId: number; txHash: string }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)
  const encryptedPrice = (await signer.encryptValue256(
    params.pricePerKToken,
    computeAddress,
    REGISTER_NODE_SELECTOR,
  )) as itUint256

  const receipt = await (
    await compute.registerNode(
      params.modelId,
      params.gpuClass,
      params.region,
      params.promisedUptimeBps,
      params.promisedLatencyMs,
      encryptedPrice,
      mpcGas(),
    )
  ).wait()

  return { nodeId: Number(requireEvent(compute, receipt, "NodeRegistered").nodeId), txHash: receipt.hash }
}

export async function updateNodePrice(
  signer: CotiSigner,
  computeAddress: string,
  nodeId: number,
  pricePerKToken: bigint,
): Promise<{ txHash: string }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)
  const encrypted = (await signer.encryptValue256(
    pricePerKToken,
    computeAddress,
    UPDATE_PRICE_SELECTOR,
  )) as itUint256

  const receipt = await (await compute.updateNodePrice(nodeId, encrypted, mpcGas())).wait()
  return { txHash: receipt.hash }
}

export async function setNodeActive(
  signer: CotiSigner,
  computeAddress: string,
  nodeId: number,
  active: boolean,
): Promise<{ txHash: string }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)
  const receipt = await (await compute.setNodeActive(nodeId, active, mpcGas())).wait()
  return { txHash: receipt.hash }
}

export async function getNode(
  runner: ContractRunner | Provider,
  computeAddress: string,
  nodeId: number,
): Promise<NodeListing> {
  const node = await computeContract(computeAddress, runner as ContractRunner).getNode(nodeId)
  return toListing(nodeId, node)
}

/** The whole public fleet. Prices are absent by construction - they are not public data. */
export async function listNodes(
  runner: ContractRunner | Provider,
  computeAddress: string,
): Promise<NodeListing[]> {
  const compute = computeContract(computeAddress, runner as ContractRunner)
  const count = Number(await compute.nodeCount())

  const nodes: NodeListing[] = []
  for (let id = 1; id <= count; id++) {
    nodes.push(toListing(id, await compute.getNode(id)))
  }
  return nodes
}

/** Node ids registered by one operator. */
export async function nodesOf(
  runner: ContractRunner | Provider,
  computeAddress: string,
  operator: string,
): Promise<number[]> {
  const ids: bigint[] = await computeContract(computeAddress, runner as ContractRunner).nodesOf(
    operator,
  )
  return ids.map(Number)
}

/** Decrypt a node's own rate card. Reverts on chain for anyone but the operator. */
export async function readNodePrice(
  signer: CotiSigner,
  computeAddress: string,
  nodeId: number,
): Promise<bigint> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)
  const ciphertext = normalizeCtUint256(await compute.nodePriceForOperator(nodeId))

  if (isZeroCtUint256(ciphertext)) return 0n

  return signer.decryptValue256(ciphertext)
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

/**
 * Hire a node and escrow the fee.
 *
 * Requires an encrypted NDC allowance already granted to the escrow, and a prompt already
 * delivered through {@link sendPrompt} - the contract checks on chain that the message came from
 * this agent and was addressed to this node, so an escrow cannot be attached to a prompt the node
 * was never given.
 */
export async function openJob(
  signer: CotiSigner,
  computeAddress: string,
  params: OpenJobParams,
): Promise<{ jobId: number; txHash: string }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)

  const encryptedKTokens = (await signer.encryptValue256(
    params.kTokens,
    computeAddress,
    OPEN_JOB_SELECTOR,
  )) as itUint256
  const encryptedBudget = (await signer.encryptValue256(
    params.maxBudget,
    computeAddress,
    OPEN_JOB_SELECTOR,
  )) as itUint256

  const receipt = await (
    await compute.openJob(
      params.nodeId,
      encryptedKTokens,
      encryptedBudget,
      params.promptMessageId,
      params.deadline,
      mpcGas(MPC_GAS_HEAVY),
    )
  ).wait()

  return { jobId: Number(requireEvent(compute, receipt, "JobOpened").jobId), txHash: receipt.hash }
}

/**
 * Deliver proof of execution and settle.
 *
 * The three measurements are compared against the node's public promises inside the garbled
 * circuit; the contract declassifies only the combined verdict, then selects payout and refund
 * with `mux` and moves both as encrypted transfers.
 */
export async function submitProof(
  signer: CotiSigner,
  computeAddress: string,
  params: SubmitProofParams,
): Promise<{ txHash: string; slaMet: boolean; certificateId: number }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)

  const encryptedTokens = (await signer.encryptValue256(
    params.deliveredKTokens,
    computeAddress,
    SUBMIT_PROOF_SELECTOR,
  )) as itUint256
  const encryptedUptime = (await signer.encryptValue256(
    BigInt(params.uptimeBps),
    computeAddress,
    SUBMIT_PROOF_SELECTOR,
  )) as itUint256
  const encryptedLatency = (await signer.encryptValue256(
    BigInt(params.latencyMs),
    computeAddress,
    SUBMIT_PROOF_SELECTOR,
  )) as itUint256
  const encryptedManifest = (await signer.encryptValue(
    params.manifest,
    computeAddress,
    SUBMIT_PROOF_SELECTOR,
  )) as itString

  const receipt = await (
    await compute.submitProof(
      params.jobId,
      encryptedTokens,
      encryptedUptime,
      encryptedLatency,
      params.attestationDigest,
      encryptedManifest,
      mpcGas(MPC_GAS_HEAVY),
    )
  ).wait()

  const settled = requireEvent(compute, receipt, "JobSettled")
  return {
    txHash: receipt.hash,
    slaMet: Boolean(settled.slaMet),
    certificateId: Number(settled.certificateId),
  }
}

export async function reclaimExpiredJob(
  signer: CotiSigner,
  computeAddress: string,
  jobId: number,
): Promise<{ txHash: string }> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)
  const receipt = await (await compute.reclaimExpiredJob(jobId, mpcGas())).wait()
  return { txHash: receipt.hash }
}

export async function getJob(
  runner: ContractRunner | Provider,
  computeAddress: string,
  jobId: number,
): Promise<JobRecord> {
  const job = await computeContract(computeAddress, runner as ContractRunner).getJob(jobId)
  return toJobRecord(jobId, job)
}

export async function jobsOfClient(
  runner: ContractRunner | Provider,
  computeAddress: string,
  client: string,
): Promise<number[]> {
  const ids: bigint[] = await computeContract(
    computeAddress,
    runner as ContractRunner,
  ).jobsOfClient(client)
  return ids.map(Number)
}

export async function jobsOfNode(
  runner: ContractRunner | Provider,
  computeAddress: string,
  nodeId: number,
): Promise<number[]> {
  const ids: bigint[] = await computeContract(computeAddress, runner as ContractRunner).jobsOfNode(
    nodeId,
  )
  return ids.map(Number)
}

/**
 * Decrypt every sealed quantity attached to a job that the caller is entitled to read.
 *
 * The contract hands back the copy re-encrypted for whichever counterparty is asking and reverts
 * for everyone else, so this returns the agent's view or the operator's view depending on who is
 * signing. Fields absent from the result are simply not populated yet - payout and refund do not
 * exist until settlement.
 */
export async function readJobAmounts(
  signer: CotiSigner,
  computeAddress: string,
  jobId: number,
): Promise<SealedAmounts> {
  const compute = computeContract(computeAddress, signer as unknown as ContractRunner)

  const decryptOrSkip = async (call: () => Promise<unknown>): Promise<bigint | undefined> => {
    try {
      const ciphertext = normalizeCtUint256(await call())

      // Canonical empty storage. Decrypting it would return a garbage 70-digit number rather
      // than zero, so a value that does not exist yet must be reported as absent, not as noise.
      if (isZeroCtUint256(ciphertext)) return undefined

      return await signer.decryptValue256(ciphertext)
    } catch {
      // Not yet written (pre-settlement) or not addressed to this caller.
      return undefined
    }
  }

  return {
    workload: await decryptOrSkip(() => compute.jobWorkloadFor(jobId)),
    cost: await decryptOrSkip(() => compute.jobCostFor(jobId)),
    delivered: await decryptOrSkip(() => compute.jobDeliveredFor(jobId)),
    payout: await decryptOrSkip(() => compute.jobPayoutFor(jobId)),
    refund: await decryptOrSkip(() => compute.jobRefundFor(jobId)),
  }
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

function toListing(id: number, raw: Record<string, unknown>): NodeListing {
  return {
    id,
    operator: String(raw.operator),
    active: Boolean(raw.active),
    modelId: String(raw.modelId),
    gpuClass: String(raw.gpuClass),
    region: String(raw.region),
    promisedUptimeBps: Number(raw.promisedUptimeBps),
    promisedLatencyMs: Number(raw.promisedLatencyMs),
    registeredAt: Number(raw.registeredAt),
    jobsSettled: Number(raw.jobsSettled),
    jobsBreached: Number(raw.jobsBreached),
  }
}

function toJobRecord(id: number, raw: Record<string, unknown>): JobRecord {
  return {
    id,
    nodeId: Number(raw.nodeId),
    client: String(raw.client),
    operator: String(raw.operator),
    state: JOB_STATES[Number(raw.state)] ?? "None",
    openedAt: Number(raw.openedAt),
    deadline: Number(raw.deadline),
    settledAt: Number(raw.settledAt),
    promptMessageId: Number(raw.promptMessageId),
    attestationDigest: String(raw.attestationDigest),
    slaMet: Boolean(raw.slaMet),
    certificateId: Number(raw.certificateId),
  }
}
