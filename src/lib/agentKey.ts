"use client"

/**
 * A signing key that lives in the browser, so the console can act as an agent rather than as a
 * human clicking a wallet.
 *
 * ## Why this exists
 *
 * COTI seals a string one 8-byte cell at a time, and every cell carries its own input-text
 * signature. A private key signs those locally and silently; a browser wallet routes each one
 * through `personal_sign`. That makes a 48-byte prompt nine MetaMask popups through MetaMask and
 * zero through a held key — same protocol, same SDK, entirely different experience.
 *
 * The deeper point is that Nodea's user is an *agent*: a program that holds a key and acts on its
 * own. Modelling that in the browser is not a workaround for a UX problem, it is the honest shape
 * of the product. The wallet path stays available because a human should be able to drive it too.
 *
 * ## What this is not
 *
 * This is a hot key in `localStorage`. It is a session/burner identity for small amounts, in the
 * same family as the session keys agent infrastructure generally uses — not a place to hold value.
 * It never leaves the browser and is never sent anywhere, but anyone with access to the browser
 * profile has it. The UI says so, and the key can be exported or destroyed at any time.
 */
import { ethers } from "@coti-io/coti-ethers"

const STORAGE_PREFIX = "nodea:agent"

export interface AgentIdentity {
  address: string
  privateKey: string
}

function storageKey(chainId: number): string {
  return `${STORAGE_PREFIX}:${chainId}`
}

/** Scoped by chain, like the AES key cache: an identity funded on one chain is useless on another. */
export function loadAgent(chainId: number): AgentIdentity | null {
  if (typeof window === "undefined") return null

  try {
    const privateKey = window.localStorage.getItem(storageKey(chainId))
    if (!privateKey) return null

    return { address: new ethers.Wallet(privateKey).address, privateKey }
  } catch {
    // Corrupt or unreadable entry. Treat it as absent rather than wedging the console.
    return null
  }
}

export function createAgent(chainId: number): AgentIdentity {
  const wallet = ethers.Wallet.createRandom()
  persist(chainId, wallet.privateKey)

  return { address: wallet.address, privateKey: wallet.privateKey }
}

/** Adopt an existing key — the same one the CLI agent uses, if you want one identity for both. */
export function importAgent(chainId: number, privateKey: string): AgentIdentity {
  const normalized = privateKey.trim()
  // Constructing the wallet is the validation; a bad key throws here with the value redacted.
  const wallet = new ethers.Wallet(normalized)

  persist(chainId, normalized)
  return { address: wallet.address, privateKey: normalized }
}

/**
 * Forget the identity.
 *
 * Deliberately destructive and deliberately warned about in the UI: any COTI or NDC still held by
 * this address becomes unreachable unless the key was exported first.
 *
 * Takes the address because the AES key is cached per address, not per chain. Clearing only the
 * chain-scoped entry would leave the derived key orphaned in storage forever - harmless, but the
 * kind of residue that turns into a support question when a later identity reuses the address.
 */
export function clearAgent(chainId: number, address?: string): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(storageKey(chainId))
    if (address) {
      window.localStorage.removeItem(`nodea:aes:${chainId}:${address.toLowerCase()}`)
    }
  } catch {
    /* blocked storage - nothing useful to do */
  }
}

function persist(chainId: number, privateKey: string): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(storageKey(chainId), privateKey)
  } catch {
    throw new Error(
      "Could not store the agent key — browser storage is unavailable. " +
        "Private browsing or blocked site data will prevent agent mode from working.",
    )
  }
}
