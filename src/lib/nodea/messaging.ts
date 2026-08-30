/**
 * COTI skill 2 — `coti-private-messaging`.
 *
 * A prompt is the most valuable thing an AI agent owns: its system instructions, its retrieved
 * context, its chain of reasoning. Handing that to a GPU marketplace over a transparent chain is
 * simply publishing it, and prompt theft is the cheapest possible attack on an agent business.
 *
 * COTI's `PrivateMessaging` stores each message as a `ctString` in three separately keyed views —
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
import { PROMPT_BYTES_PER_CHUNK, PROMPT_MAX_BYTES, PROMPT_MAX_CHUNKS } from "./config"
import type { CotiSigner, PromptMessage } from "./types"

/** `sendMultipartMessage(address,((uint256[]),bytes[])[])` — the selector every cell is signed under. */
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
 * round trip is lossless for any input — emoji and CJK included.
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
): Promise<{ messageId: number; txHash: string; chunks: number }> {
  const chunks = chunkPrompt(prompt)

  const encryptedChunks: itString[] = []
  for (const chunk of chunks) {
    encryptedChunks.push(
      (await signer.encryptValue(chunk, channelAddress, SEND_MULTIPART_SELECTOR)) as itString,
    )
  }

  const channel = promptChannelContract(channelAddress, signer as unknown as ContractRunner)
  const tx = await channel.sendMultipartMessage(nodeOperator, encryptedChunks)
  const receipt = await tx.wait()

  const messageId = Number(requireEvent(channel, receipt, "MessageSent").messageId)
  return { messageId, txHash: receipt.hash, chunks: chunks.length }
}

/**
 * Read a prompt back and decrypt it.
 *
 * The contract hands out the copy keyed to `msg.sender` and reverts for anyone who is neither
 * the sender nor the recipient, so this only succeeds for the two parties to the job. Chunks are
 * decrypted individually and concatenated — each one is self-contained valid UTF-8, which is
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
