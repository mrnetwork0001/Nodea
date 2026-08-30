/**
 * COTI skill 3 — `coti-private-erc20`.
 *
 * NodeaCredits (NDC) is the settlement asset for compute. Balances, allowances and every transfer
 * amount are garbled ciphertext on chain, which closes two leaks that are fatal to an agent
 * economy on a transparent ledger:
 *
 *  - a public balance is a public statement of how much inference an agent can still afford, and
 *    therefore of how long it can keep competing;
 *  - public per-task amounts let anyone reconstruct a node's rate card from the ledger and
 *    undercut it, so no operator can price honestly.
 *
 * Reading your own balance is a two-step affair here, and that is the point: the contract returns
 * a ciphertext addressed to your AES key, and decryption happens locally. Nothing on the network
 * path ever sees the number.
 */
import type { ContractRunner, Provider } from "@coti-io/coti-ethers"
import type { itUint256 } from "@coti-io/coti-sdk-typescript"
import { creditsContract, normalizeCtUint256 } from "./contracts"
import type { CotiSigner } from "./types"

/** `approve(address,((uint256,uint256),bytes))` */
export const APPROVE_SELECTOR = "0x8e532c44"
/** `transfer(address,((uint256,uint256),bytes))` */
export const TRANSFER_SELECTOR = "0x83ae57f4"

/**
 * Decrypt the caller's own NDC balance.
 *
 * Returns `0n` for an account that has never held credits: COTI treats an all-zero ciphertext as
 * canonical empty storage and short-circuits it, so a fresh wallet reads zero rather than failing.
 */
export async function balanceOf(
  signer: CotiSigner,
  creditsAddress: string,
  account?: string,
): Promise<bigint> {
  const credits = creditsContract(creditsAddress, signer as unknown as ContractRunner)
  const owner = account ?? (await signer.getAddress())
  const ciphertext = await credits.balanceOf(owner)

  return signer.decryptValue256(normalizeCtUint256(ciphertext))
}

/** Claim the one-shot testnet allotment so a fresh agent can hire compute immediately. */
export async function claimFaucet(
  signer: CotiSigner,
  creditsAddress: string,
): Promise<{ txHash: string; amount: bigint }> {
  const credits = creditsContract(creditsAddress, signer as unknown as ContractRunner)
  const address = await signer.getAddress()

  if (await credits.faucetClaimed(address)) {
    throw new Error(`${address} has already claimed the NDC faucet`)
  }

  const amount: bigint = await credits.FAUCET_AMOUNT()
  const receipt = await (await credits.claimFaucet()).wait()

  return { txHash: receipt.hash, amount }
}

export async function hasClaimedFaucet(
  runner: ContractRunner | Provider,
  creditsAddress: string,
  account: string,
): Promise<boolean> {
  return creditsContract(creditsAddress, runner as ContractRunner).faucetClaimed(account)
}

/**
 * Grant an encrypted spending allowance to the compute escrow.
 *
 * The allowance is the one figure an agent sizes by hand — the job's actual cost is computed
 * inside the garbled circuit from the node's sealed price, so the agent never has to learn it in
 * order to pay it.
 *
 * COTI inherits ERC-20's approve race mitigation: setting a non-zero allowance over an existing
 * non-zero one reverts with `ERC20UnsafeApprove`. This resets to zero first, which costs one
 * extra transaction and removes a whole class of surprise.
 */
export async function approveSpender(
  signer: CotiSigner,
  creditsAddress: string,
  spender: string,
  amount: bigint,
): Promise<{ txHash: string }> {
  const credits = creditsContract(creditsAddress, signer as unknown as ContractRunner)

  await (await credits["approve(address,uint256)"](spender, 0n)).wait()

  const encrypted = (await signer.encryptValue256(
    amount,
    creditsAddress,
    APPROVE_SELECTOR,
  )) as itUint256
  const receipt = await (
    await credits["approve(address,((uint256,uint256),bytes))"](spender, encrypted)
  ).wait()

  return { txHash: receipt.hash }
}

/** Send credits to another account with the amount sealed end to end. */
export async function transferCredits(
  signer: CotiSigner,
  creditsAddress: string,
  to: string,
  amount: bigint,
): Promise<{ txHash: string }> {
  const credits = creditsContract(creditsAddress, signer as unknown as ContractRunner)
  const encrypted = (await signer.encryptValue256(
    amount,
    creditsAddress,
    TRANSFER_SELECTOR,
  )) as itUint256

  const receipt = await (
    await credits["transfer(address,((uint256,uint256),bytes))"](to, encrypted)
  ).wait()

  return { txHash: receipt.hash }
}

/** Decrypt the caller's remaining allowance for `spender`. */
export async function allowanceOf(
  signer: CotiSigner,
  creditsAddress: string,
  spender: string,
): Promise<bigint> {
  const credits = creditsContract(creditsAddress, signer as unknown as ContractRunner)
  const owner = await signer.getAddress()
  const allowance = await credits.allowance(owner, spender)

  return signer.decryptValue256(normalizeCtUint256(allowance.ownerCiphertext ?? allowance[1]))
}
