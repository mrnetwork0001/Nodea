"use client"

/**
 * Wallet and AES-key session for the dashboard.
 *
 * A COTI session has two distinct steps that most dApps collapse into one, and keeping them
 * separate here is deliberate - it is the clearest way to show what COTI actually adds:
 *
 *  1. **Connect.** An ordinary EVM connection. From here the app can send transactions.
 *  2. **Onboard.** A paid round-trip through COTI's `AccountOnboard`, which returns two
 *     RSA-encrypted shares that the browser XORs into the account's AES key. Until this happens
 *     the app can move value but cannot *read* a single encrypted balance - every ciphertext on
 *     screen stays a ciphertext.
 *
 * The AES key never leaves the browser. It is cached in `localStorage` keyed by address and chain
 * so a reload does not cost another onboarding transaction, and it is dropped on disconnect.
 */
import { BrowserProvider, JsonRpcProvider, type JsonRpcSigner } from "@coti-io/coti-ethers"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_NETWORK, NETWORKS, type NodeaNetwork } from "./nodea/config"
import { aesKeyStore } from "./nodea/account"
import { loadDeployment, type NodeaDeployment } from "./nodea/deployments"

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, handler: (...args: never[]) => void): void
  removeListener?(event: string, handler: (...args: never[]) => void): void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export type WalletStatus = "disconnected" | "connecting" | "connected" | "onboarding" | "ready"

interface WalletState {
  status: WalletStatus
  address: string | null
  signer: JsonRpcSigner | null
  /** Read-only runner, always available - the fleet is public and should render before connect. */
  reader: JsonRpcProvider
  network: NodeaNetwork
  deployment: NodeaDeployment | null
  deploymentError: string | null
  error: string | null
  hasWallet: boolean
  connect: () => Promise<void>
  onboard: () => Promise<void>
  disconnect: () => void
  clearError: () => void
}

const WalletContext = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const network = NETWORKS[DEFAULT_NETWORK]

  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [address, setAddress] = useState<string | null>(null)
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasWallet, setHasWallet] = useState(false)

  const reader = useMemo(
    () => new JsonRpcProvider(network.rpcUrl, { chainId: network.chainId, name: network.key }),
    [network],
  )

  const { deployment, deploymentError } = useMemo(() => {
    try {
      return { deployment: loadDeployment(network.key), deploymentError: null }
    } catch (cause) {
      return { deployment: null, deploymentError: (cause as Error).message }
    }
  }, [network.key])

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && Boolean(window.ethereum))
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No EVM wallet found. Install MetaMask to use the dashboard.")
      return
    }

    setStatus("connecting")
    setError(null)

    try {
      await ensureCotiNetwork(window.ethereum, network)

      const provider = new BrowserProvider(window.ethereum, {
        chainId: network.chainId,
        name: network.key,
      })
      await provider.send("eth_requestAccounts", [])

      const connected = await provider.getSigner()
      const account = await connected.getAddress()

      // Re-attach a previously derived key so a reload does not re-run paid onboarding.
      const cached = aesKeyStore.load(account, network.chainId)
      if (cached) connected.setAesKey(cached)

      setSigner(connected)
      setAddress(account)
      setStatus(cached ? "ready" : "connected")
    } catch (cause) {
      setStatus("disconnected")
      setError(describe(cause))
    }
  }, [network])

  const onboard = useCallback(async () => {
    if (!signer || !address) return

    setStatus("onboarding")
    setError(null)

    try {
      await signer.generateOrRecoverAes(network.onboardContract)

      const aesKey = signer.getUserOnboardInfo()?.aesKey
      if (!aesKey) throw new Error("onboarding returned no AES key")

      aesKeyStore.save(address, network.chainId, aesKey)
      setStatus("ready")
    } catch (cause) {
      setStatus("connected")
      setError(describe(cause))
    }
  }, [signer, address, network])

  const disconnect = useCallback(() => {
    if (address) aesKeyStore.clear(address, network.chainId)
    setSigner(null)
    setAddress(null)
    setStatus("disconnected")
    setError(null)
  }, [address, network.chainId])

  // A wallet-level account or chain change invalidates the whole session, AES key included.
  useEffect(() => {
    const ethereum = typeof window !== "undefined" ? window.ethereum : undefined
    if (!ethereum?.on || !ethereum.removeListener) return

    const reset = () => {
      setSigner(null)
      setAddress(null)
      setStatus("disconnected")
    }

    ethereum.on("accountsChanged", reset)
    ethereum.on("chainChanged", reset)
    return () => {
      ethereum.removeListener?.("accountsChanged", reset)
      ethereum.removeListener?.("chainChanged", reset)
    }
  }, [])

  const value: WalletState = {
    status,
    address,
    signer,
    reader,
    network,
    deployment,
    deploymentError,
    error,
    hasWallet,
    connect,
    onboard,
    disconnect,
    clearError: () => setError(null),
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext)
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>")
  return context
}

/** Switch the wallet to COTI, adding the chain first if it does not know it yet. */
async function ensureCotiNetwork(ethereum: Eip1193Provider, network: NodeaNetwork): Promise<void> {
  const chainIdHex = `0x${network.chainId.toString(16)}`

  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] })
  } catch (cause) {
    // 4902 is "unrecognised chain" - the only case where adding it is the right response.
    if ((cause as { code?: number }).code !== 4902) throw cause

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        },
      ],
    })
  }
}

function describe(cause: unknown): string {
  if (typeof cause === "object" && cause !== null) {
    const error = cause as { shortMessage?: string; reason?: string; message?: string; code?: number }
    if (error.code === 4001) return "Request rejected in the wallet."
    return error.shortMessage ?? error.reason ?? error.message ?? "Unknown wallet error."
  }
  return String(cause)
}
