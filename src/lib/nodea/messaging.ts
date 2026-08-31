/**
 * COTI skill 2 - `coti-private-messaging`.
 *
 * A prompt is the most valuable thing an AI agent owns: its system instructions, its retrieved
 * context, its chain of reasoning. Handing that to a GPU marketplace over a transparent chain is
 * simply publishing it, and prompt theft is the cheapest possible attack on an agent business.
 *
 * COTI's `PrivateMessaging` stores each message as a `ctString` in three separately keyed views -
 * one under the network key, one under the sender's AES key, one under the recipient's. Only the
 * node that was hired can decrypt the payload it was sent; the chain records that a message
 * happened, never what it said.
 *
 * The wire format is fixed by the contract: a message is up to 64 chunks, each an `itString` of
 * at most 3 `ctUint64` cells, each cell holding 8 UTF-8 bytes. This module owns that packing.
 */
import type { ContractRunner, Provider } from "@coti-io/coti-ethers"
import type { itString } from "@coti-io/coti-sdk-typescript"
import { normalizeCtString, promptChannelContract, requireEvent } from "./contracts"
import { mpcMessageGas } from "./gas"
import {
  PROMPT_BYTES_PER_CELL,
  PROMPT_BYTES_PER_CHUNK,
  PROMPT_MAX_BYTES,
  PROMPT_MAX_CHUNKS,
} from "./config"
import type { CotiSigner, PromptMessage } from "./types"

/** `sendMultipartMessage(address,((uint256[]),bytes[])[])` - the selector every cell is signed under. */
export const SEND_MULTIPART_SELECTOR = "0xe768797e"

const UTF8 = new TextEncoder()

export class PromptTooLargeError extends Error {
  constructor(readonly byteLength: number) {
    super(
      `prompt is ${byteLength} bytes; a single COTI private message holds at most ${PROMPT_MAX_BYTES} ` +
        `(${PROMPT_MAX_CHUNKS} chunks x ${PROMPT_BYTES_PER_CHUNK} bytes). Split the workload across jobs.`,
    )
    this.name = "PromptTooLargeError"
  }
}

/**
 * Split a prompt into chunks that each fit one `itString`.
 *
 * The split runs over Unicode code points rather than raw bytes on purpose. Slicing UTF-8 at a
 * fixed 24-byte stride would cut multi-byte characters in half, and because each chunk is
 * decrypted independently on the way out, the halves would decode to replacement characters
 * instead of the original text. Code-point-aligned chunks are individually valid UTF-8, so the
 * round trip is lossless for any input - emoji and CJK included.
 */
export function chunkPrompt(prompt: string): string[] {
  const normalized = prompt.replace(/\0/g, "")
  const chunks: string[] = []

  let current = ""
  let currentBytes = 0

  for (const codePoint of normalized) {
    const size = UTF8.encode(codePoint).length
    if (currentBytes + size > PROMPT_BYTES_PER_CHUNK) {
      chunks.push(current)
      current = ""
      currentBytes = 0
    }
    current += codePoint
    currentBytes += size
  }
  if (current.length > 0) chunks.push(current)

  if (chunks.length > PROMPT_MAX_CHUNKS) {
    throw new PromptTooLargeError(UTF8.encode(normalized).length)
  }
  return chunks.length > 0 ? chunks : [""]
}

/** Bytes a prompt will occupy on chain, for pre-flight checks in the UI. */
export function promptByteLength(prompt: string): number {
  return UTF8.encode(prompt.replace(/\0/g, "")).length
}

/**
 * How many wallet signatures sealing this prompt will cost in a browser.
 *
 * COTI seals a string one 8-byte cell at a time, and each cell carries its own input-text
 * signature over `(signer, contract, selector, ciphertext)`. A private key signs those locally and
 * silently, which is why the agent runtime shows no prompts at all. A browser wallet cannot: every
 * cell is a separate `personal_sign`, so a 160-byte prompt is twenty MetaMask popups.
 *
 * There is no batching to reach for — the signatures are per-ciphertext by construction. The only
 * honest response is to tell the user the number before they start and count down as it goes, so
 * a long sequence reads as progress rather than as a hung page.
 */
export function promptSignatureCount(prompt: string): number {
  return Math.ceil(promptByteLength(prompt) / PROMPT_BYTES_PER_CELL)
}

/**
 * Seal a prompt for one specific node and post it on chain.
 *
 * Every cell is individually encrypted under the sender's AES key and signed over
 * `(sender, channel, selector, ciphertext)`, which is what lets the MPC network accept it as
 * authenticated input rather than arbitrary bytes.
 *
 * @returns the on-chain message id, which {@link openJob} binds the escrow to.
 */
export async function sendPrompt(
  signer: CotiSigner,
  channelAddress: string,
  nodeOperator: string,
  prompt: string,
  /** Called after each chunk is sealed, so a UI can count down the wallet popups. */
  onProgress?: (sealedCells: number, totalCells: number) => void,
): Promise<{ messageId: number; txHash: string; chunks: number; gasUsed: bigint; cells: number }> {
  const chunks = chunkPrompt(prompt)
  const totalCells = promptSignatureCount(prompt)

  const encryptedChunks: itString[] = []
  let sealedCells = 0

  for (const chunk of chunks) {
    encryptedChunks.push(
      (await signer.encryptValue(chunk, channelAddress, SEND_MULTIPART_SELECTOR)) as itString,
    )
    sealedCells = Math.min(totalCells, sealedCells + Math.ceil(UTF8.encode(chunk).length / 8) || 1)
    onProgress?.(sealedCells, totalCells)
  }

  const channel = promptChannelContract(channelAddress, signer as unknown as ContractRunner)
  const tx = await channel.sendMultipartMessage(
    nodeOperator,
    encryptedChunks,
    // Scaled by cell count: a full-capacity message needs several times what a short one does.
    mpcMessageGas(totalCells),
  )
  const receipt = await tx.wait()

  const messageId = Number(requireEvent(channel, receipt, "MessageSent").messageId)
  return { messageId, txHash: receipt.hash, chunks: chunks.length, gasUsed: receipt.gasUsed, cells: totalCells }
}

/**
 * Read a prompt back and decrypt it.
 *
 * The contract hands out the copy keyed to `msg.sender` and reverts for anyone who is neither
 * the sender nor the recipient, so this only succeeds for the two parties to the job. Chunks are
 * decrypted individually and concatenated - each one is self-contained valid UTF-8, which is
 * exactly why {@link chunkPrompt} splits on code-point boundaries.
 */
export async function readPrompt(
  signer: CotiSigner,
  channelAddress: string,
  messageId: number,
): Promise<string> {
  const channel = promptChannelContract(channelAddress, signer as unknown as ContractRunner)
  const chunkCount = Number(await channel.getMessageChunkCount(messageId))

  const parts: string[] = []
  for (let i = 0; i < chunkCount; i++) {
    const ciphertext = await channel.getMessageChunk(messageId, i)
    parts.push((await signer.decryptValue(normalizeCtString(ciphertext))) as string)
  }
  return parts.join("")
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Envelope for an inference result travelling back to the agent.
 *
 * `NODEA2|<jobId>|<part>|<parts>|<backend>|<model>|<text>` - pipe-delimited rather than JSON,
 * because every byte spent on framing is a byte of answer that does not fit in a 1,536-byte
 * message.
 *
 * The provenance fields carry what actually served the job. They belong here rather than in the
 * public node listing: which backend a node uses is the operator's own business and can change
 * between jobs, so it is a fact about *this* answer, attested by the node that produced it, not a
 * marketplace-level claim. It also rides inside the sealed payload, so only the agent that paid
 * for the job learns where its work ran.
 *
 * `NODEA1` is still parsed on read. Jobs settled before provenance existed should not become
 * unreadable because the format moved on.
 */
const RESULT_PREFIX = "NODEA2"
const LEGACY_PREFIX = "NODEA1"

export interface ResultProvenance {
  /** Which backend served it: `0g-router`, `0g`, `http`, or `local`. */
  backend: string
  /** The model that actually answered, which may differ from the node's advertised id. */
  model: string
}

export interface JobResult {
  jobId: number
  text: string
  /** True when every part of a multi-part result was found and reassembled. */
  complete: boolean
  /** Absent for results sealed before provenance was carried. */
  provenance?: ResultProvenance
}

/** Provenance fields must not contain the delimiter, or reassembly misparses. */
function sanitize(value: string): string {
  return value.replace(/\|/g, "-").slice(0, 48)
}

/**
 * Bytes per result message.
 *
 * Deliberately below the channel's 1,536-byte ceiling. A full message is 192 sealed cells, and at
 * that size the gas a single transaction needs approaches what one COTI block can give. 1,024
 * bytes is 128 cells, which sits comfortably inside the block limit with margin to spare.
 *
 * A prompt is whatever the agent typed and may still run to the full 1,536; a result is ours to
 * split, so it is split where the arithmetic is safe rather than where the contract stops us. The
 * cost is a few more transactions on a long answer, which is the cheaper failure by far - the
 * alternative is a settlement that reverts after the GPU has already been paid for.
 */
const RESULT_MAX_BYTES = 1_024

/** Bytes of actual completion that fit in one message after the envelope header. */
function resultCapacity(jobId: number, parts: number, provenance: ResultProvenance): number {
  const header = `${RESULT_PREFIX}|${jobId}|${parts}|${parts}|${sanitize(provenance.backend)}|${sanitize(provenance.model)}|`
  return RESULT_MAX_BYTES - UTF8.encode(header).length
}

/**
 * Return the completion to the agent, sealed for it alone.
 *
 * The same `PrivateMessaging` channel that carried the prompt in, used in reverse. That symmetry
 * is the point: the request and the answer get identical protection, and neither the chain nor any
 * other node learns what was asked or what came back.
 *
 * A long completion is split across messages rather than truncated, because an answer cut off at
 * 1,536 bytes is not an answer.
 */
export async function sendResult(
  signer: CotiSigner,
  channelAddress: string,
  client: string,
  jobId: number,
  text: string,
  provenance: ResultProvenance,
): Promise<{ messageIds: number[]; parts: number; gasUsed: bigint; cells: number }> {
  const backend = sanitize(provenance.backend)
  const model = sanitize(provenance.model)

  const bytes = UTF8.encode(text)
  const perPart = resultCapacity(jobId, 1, provenance)
  const parts = Math.max(1, Math.ceil(bytes.length / perPart))

  const messageIds: number[] = []
  let gasUsed = 0n
  let cells = 0

  for (let index = 0; index < parts; index++) {
    // Slice on code points, not bytes: a part split mid-character would decode to replacement
    // characters once the agent reassembles it.
    const slice = sliceByBytes(text, index * perPart, perPart)
    // Provenance repeats on every part rather than riding only on the first: a few dozen bytes
    // buys reassembly that does not depend on which part happens to arrive.
    const envelope = `${RESULT_PREFIX}|${jobId}|${index}|${parts}|${backend}|${model}|${slice}`

    const sent = await sendPrompt(signer, channelAddress, client, envelope)
    messageIds.push(sent.messageId)
    gasUsed += sent.gasUsed
    cells += sent.cells
  }

  return { messageIds, parts, gasUsed, cells }
}

/** Take up to `maxBytes` of UTF-8 starting at byte `from`, without splitting a code point. */
function sliceByBytes(text: string, from: number, maxBytes: number): string {
  let seen = 0
  let out = ""
  let taken = 0

  for (const codePoint of text) {
    const size = UTF8.encode(codePoint).length
    if (seen + size > from) {
      if (taken + size > maxBytes) break
      out += codePoint
      taken += size
    }
    seen += size
  }
  return out
}

/**
 * Find and decrypt the result for a job.
 *
 * Scans the caller's inbox newest-first for envelopes matching this job. The channel already
 * enforces that only the sender and the addressed recipient can decrypt, so an agent reading its
 * own inbox is the only party that can reassemble this.
 */
export async function readResult(
  signer: CotiSigner,
  channelAddress: string,
  jobId: number,
  { scan = 40 }: { scan?: number } = {},
): Promise<JobResult | null> {
  const account = await signer.getAddress()
  const ids = await inbox(signer as unknown as ContractRunner, channelAddress, account, scan)

  const found = new Map<number, string>()
  let expected: number | null = null
  let provenance: ResultProvenance | undefined

  for (const id of ids) {
    let decrypted: string
    try {
      decrypted = await readPrompt(signer, channelAddress, id)
    } catch {
      continue // not ours to read, or not a text payload
    }

    const versioned = decrypted.startsWith(`${RESULT_PREFIX}|`)
    const legacy = decrypted.startsWith(`${LEGACY_PREFIX}|`)
    if (!versioned && !legacy) continue

    const fields = decrypted.split("|")
    const [, job, part, parts] = fields
    if (Number(job) !== jobId) continue

    expected = Number(parts)

    if (versioned) {
      provenance = { backend: fields[4] ?? "", model: fields[5] ?? "" }
      // The body may itself contain a pipe, so rejoin everything after the header.
      found.set(Number(part), fields.slice(6).join("|"))
    } else {
      found.set(Number(part), fields.slice(4).join("|"))
    }

    if (found.size === expected) break
  }

  if (expected === null) return null

  const ordered = Array.from({ length: expected }, (_, index) => found.get(index))
  return {
    jobId,
    text: ordered.map((part) => part ?? "").join(""),
    complete: ordered.every((part) => part !== undefined),
    provenance,
  }
}

export async function getMessageMetadata(
  runner: ContractRunner | Provider,
  channelAddress: string,
  messageId: number,
): Promise<PromptMessage> {
  const channel = promptChannelContract(channelAddress, runner as ContractRunner)
  const [from, to, timestamp, epoch] = await channel.getMessageMetadata(messageId)
  const chunkCount = Number(await channel.getMessageChunkCount(messageId))

  return {
    id: messageId,
    from,
    to,
    timestamp: Number(timestamp),
    epoch: Number(epoch),
    chunkCount,
  }
}

/** Message ids addressed to `account`, newest first. */
export async function inbox(
  runner: ContractRunner | Provider,
  channelAddress: string,
  account: string,
  limit = 50,
): Promise<number[]> {
  const channel = promptChannelContract(channelAddress, runner as ContractRunner)
  const total = Number(await channel.inboxCount(account))
  if (total === 0) return []

  const offset = Math.max(0, total - limit)
  const page: bigint[] = await channel.getInboxPage(account, offset, Math.min(limit, total))
  return page.map(Number).reverse()
}
