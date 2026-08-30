/**
 * COTI skill 1 - `coti-account-setup`.
 *
 * Every participant in Nodea (agent, node operator, treasury) needs two keys, not one: the
 * secp256k1 key that signs transactions, and a 128-bit AES key that COTI's MPC network uses to
 * seal values *for that account*. The AES key is not chosen locally - it is derived through the
 * on-chain `AccountOnboard` contract, which returns two RSA-encrypted shares that the client
 * XORs back together. Without it an account can submit transactions but cannot read a single
 * one of its own encrypted balances.
 *
 * This module is the only place that key material is created or recovered.
 */
import { JsonRpcProvider, Wallet, ethers } from "@coti-io/coti-ethers"
import type { NodeaNetwork } from "./config"
import { NETWORKS, DEFAULT_NETWORK } from "./config"
import type { CotiSigner } from "./types"

export interface OnboardedAccount {
  address: string
  privateKey: string
  aesKey: string
  onboardTxHash?: string | null
}

/** Minimum native COTI an account needs before it can pay for onboarding. */
export const MIN_ONBOARD_BALANCE = ethers.parseEther("0.05")

export function getProvider(network: NodeaNetwork = NETWORKS[DEFAULT_NETWORK]): JsonRpcProvider {
  return new JsonRpcProvider(network.rpcUrl, {
    chainId: network.chainId,
    name: network.key,
  })
}

/** Mint a fresh agent identity. The caller is responsible for funding and persisting it. */
export function createAgentWallet(network: NodeaNetwork = NETWORKS[DEFAULT_NETWORK]): Wallet {
  const random = ethers.Wallet.createRandom()
  return new Wallet(random.privateKey, getProvider(network))
}

export function walletFromKey(
  privateKey: string,
  network: NodeaNetwork = NETWORKS[DEFAULT_NETWORK],
  aesKey?: string | null,
): Wallet {
  const wallet = new Wallet(privateKey, getProvider(network))
  if (aesKey) wallet.setAesKey(aesKey)
  return wallet
}

export class NotFundedError extends Error {
  constructor(
    readonly address: string,
    readonly balance: bigint,
    readonly network: NodeaNetwork,
  ) {
    super(
      `${address} holds ${ethers.formatEther(balance)} COTI on ${network.name}; ` +
        `onboarding needs at least ${ethers.formatEther(MIN_ONBOARD_BALANCE)}. ` +
        `To continue, ${network.fundingHint}.`,
    )
    this.name = "NotFundedError"
  }
}

/**
 * Derive (or recover) the account's AES key, so it can seal inputs and read its own ciphertexts.
 *
 * Idempotent and cheap to call: if the signer already carries a key this returns immediately.
 * Otherwise it runs COTI's onboarding round-trip, which costs gas - hence the balance check,
 * which turns an opaque revert into an actionable message.
 */
export async function ensureOnboarded(
  signer: CotiSigner,
  network: NodeaNetwork = NETWORKS[DEFAULT_NETWORK],
): Promise<string> {
  const existing = signer.getUserOnboardInfo()?.aesKey
  if (existing) return existing

  const address = await signer.getAddress()
  const provider = getProvider(network)
  const balance = await provider.getBalance(address)
  if (balance < MIN_ONBOARD_BALANCE) {
    throw new NotFundedError(address, balance, network)
  }

  await signer.generateOrRecoverAes(network.onboardContract)

  const aesKey = signer.getUserOnboardInfo()?.aesKey
  if (!aesKey) {
    throw new Error(`onboarding completed for ${address} but no AES key was returned`)
  }
  return aesKey
}

export function isOnboarded(signer: CotiSigner): boolean {
  return Boolean(signer.getUserOnboardInfo()?.aesKey)
}

/**
 * Browser-side cache of an AES key.
 *
 * Onboarding is a paid transaction, so re-running it on every page load would be both slow and
 * expensive. The key is scoped per address and per chain: a key derived on testnet is worthless
 * on mainnet, and silently reusing one across accounts would produce ciphertext nobody can read.
 *
 * This is deliberately `localStorage` and nothing more - the key never leaves the browser and is
 * never sent to a Nodea server, because there isn't one.
 */
export const aesKeyStore = {
  storageKey(address: string, chainId: number): string {
    return `nodea:aes:${chainId}:${address.toLowerCase()}`
  },
  load(address: string, chainId: number): string | null {
    if (typeof window === "undefined") return null
    try {
      return window.localStorage.getItem(this.storageKey(address, chainId))
    } catch {
      return null
    }
  },
  save(address: string, chainId: number, aesKey: string): void {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(this.storageKey(address, chainId), aesKey)
    } catch {
      /* private browsing or blocked storage - the key is re-derivable, so this is not fatal */
    }
  },
  clear(address: string, chainId: number): void {
    if (typeof window === "undefined") return
    try {
      window.localStorage.removeItem(this.storageKey(address, chainId))
    } catch {
      /* nothing to do */
    }
  },
}
