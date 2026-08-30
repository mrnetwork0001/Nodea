/**
 * Thin binding helpers shared by every Nodea module.
 *
 * The ABIs are generated from Hardhat artifacts as `as const` literals, which is what gives the
 * app compile-time knowledge of the contract surface - but ethers wants a mutable `InterfaceAbi`,
 * so the widening happens here once instead of at twenty call sites.
 */
import { Contract, type ContractRunner, type InterfaceAbi } from "@coti-io/coti-ethers"
import {
  NodeaComputeAbi,
  NodeaCreditsAbi,
  NodeaPromptChannelAbi,
  NodeaSLAAbi,
} from "./abi"

export function bind(address: string, abi: readonly unknown[], runner: ContractRunner): Contract {
  return new Contract(address, abi as InterfaceAbi, runner)
}

export const computeContract = (address: string, runner: ContractRunner) =>
  bind(address, NodeaComputeAbi, runner)

export const creditsContract = (address: string, runner: ContractRunner) =>
  bind(address, NodeaCreditsAbi, runner)

export const promptChannelContract = (address: string, runner: ContractRunner) =>
  bind(address, NodeaPromptChannelAbi, runner)

export const slaContract = (address: string, runner: ContractRunner) =>
  bind(address, NodeaSLAAbi, runner)

/** Find one event in a receipt and return its parsed args, or throw with useful context. */
export function requireEvent(
  contract: Contract,
  receipt: { logs: readonly unknown[]; hash?: string },
  name: string,
): Record<string, unknown> & { [key: number]: unknown } {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log as never)
      if (parsed?.name === name) return parsed.args as never
    } catch {
      /* a log emitted by a different contract in the same transaction */
    }
  }
  throw new Error(`transaction ${receipt.hash ?? ""} emitted no ${name} event`)
}

/**
 * ethers decodes Solidity structs into array-like `Result` objects; COTI's SDK expects plain
 * `{ ciphertextHigh, ciphertextLow }` / `{ value: bigint[] }` shapes. These two normalisers sit
 * on every boundary where a ciphertext comes back off the wire.
 */
export function normalizeCtUint256(raw: unknown): { ciphertextHigh: bigint; ciphertextLow: bigint } {
  const source = raw as { ciphertextHigh?: bigint; ciphertextLow?: bigint } & ArrayLike<bigint>
  return {
    ciphertextHigh: BigInt(source.ciphertextHigh ?? source[0]),
    ciphertextLow: BigInt(source.ciphertextLow ?? source[1]),
  }
}

export function normalizeCtString(raw: unknown): { value: bigint[] } {
  const source = (raw as { value?: unknown }).value ?? (raw as unknown[])[0]
  return { value: Array.from(source as ArrayLike<bigint>, (cell) => BigInt(cell)) }
}
