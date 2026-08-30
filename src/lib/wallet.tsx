"use client"

/**
 * Session state for the console, in two modes.
 *
 * **Wallet mode** connects MetaMask. Ordinary, familiar, and expensive on COTI: sealing a string
 * costs one `personal_sign` per 8-byte cell, so a short prompt is nine popups.
 *
 * **Agent mode** holds a key in the browser and signs locally — zero popups, which is how the CLI
 * agent and every script already behave. This is not a workaround for the popup problem; it is
 * what Nodea's user actually is. An agent is a program that holds a key.
 *
 * Both modes produce something satisfying `CotiSigner`, so every component below this file is
 * identical either way. That interface was in the SDK from the start; this exposes the second half
 * of it to the browser.
 *
 * Either way there are two keys, and the second is the interesting one: connecting lets you spend,
 * onboarding lets you *read*. Until COTI's `AccountOnboard` has issued the AES key shares, every
 * ciphertext on screen stays a ciphertext.
 */
import {
  BrowserProvider,
  JsonRpcProvider,
  Wallet,
  ethers,
  type JsonRpcSigner,
} from "@coti-io/coti-ethers"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { DEFAULT_NETWORK, NETWORKS, type NodeaNetwork } from "./nodea/config"
import { aesKeyStore } from "./nodea/account"
import { loadDeployment, type NodeaDeployment } from "./nodea/deployments"
import { clearAgent, createAgent, importAgent, loadAgent, type AgentIdentity } from "./agentKey"

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

export type SignerMode = "wallet" | "agent"
export type WalletStatus = "disconnected" | "connecting" | "connected" | "onboarding" | "ready"

/** What the console can do with the active identity, whichever mode produced it. */
interface WalletState {
  mode: SignerMode
  setMode: (mode: SignerMode) => void

  status: WalletStatus
  address: string | null
  signer: JsonRpcSigner | Wallet | null
  /** Read-only runner, always available — the fleet is public and should render before connect. */
  reader: JsonRpcProvider
  network: NodeaNetwork
  deployment: NodeaDeployment | null
  deploymentError: string | null
  error: string | null

  /** True when this browser signs locally, so the caller can drop popup warnings. */
  signsLocally: boolean

  // --- wallet mode ---
  hasWallet: boolean
  connect: () => Promise<void>
  disconnect: () => void

  // --- agent mode ---
  agent: AgentIdentity | null
  agentBalance: bigint | null
  createAgentIdentity: () => void
  importAgentIdentity: (privateKey: string) => void
  forgetAgentIdentity: () => void
  /** Send COTI from the connected wallet to the agent. The only popup agent mode needs. */
  fundAgent: (amount: string) => Promise<void>
  refreshAgentBalance: () => Promise<void>

  onboard: () => Promise<void>
  clearError: () => void
}

const WalletContext = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const network = NETWORKS[DEFAULT_NETWORK]

  const [mode, setModeState] = useState<SignerMode>("agent")
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [error, setError] = useState<string | null>(null)
  const [hasWallet, setHasWallet] = useState(false)

  const [browserSigner, setBrowserSigner] = useState<JsonRpcSigner | null>(null)
  const [browserAddress, setBrowserAddress] = useState<string | null>(null)

  const [agent, setAgent] = useState<AgentIdentity | null>(null)
  const [agentSigner, setAgentSigner] = useState<Wallet | null>(null)
  const [agentBalance, setAgentBalance] = useState<bigint | null>(null)
  const [agentReady, setAgentReady] = useState(false)

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

  // ---- agent identity ----------------------------------------------------

  /** Rebuild the signer for an identity, re-attaching any AES key already derived for it. */
  const adoptAgent = useCallback(
    (identity: AgentIdentity | null) => {
      setAgent(identity)
      setAgentReady(false)

      if (!identity) {
        setAgentSigner(null)
        setAgentBalance(null)
        return
      }

      const wallet = new Wallet(identity.privateKey, reader)
      const cached = aesKeyStore.load(identity.address, network.chainId)
      if (cached) {
        wallet.setAesKey(cached)
        setAgentReady(true)
      }

      setAgentSigner(wallet)
      void reader.getBalance(identity.address).then(setAgentBalance).catch(() => setAgentBalance(null))
    },
    [reader, network.chainId],
  )

  useEffect(() => {
    adoptAgent(loadAgent(network.chainId))
  }, [adoptAgent, network.chainId])

  const refreshAgentBalance = useCallback(async () => {
    if (!agent) return
    try {
      setAgentBalance(await reader.getBalance(agent.address))
    } catch {
      setAgentBalance(null)
    }
  }, [agent, reader])

  // ---- wallet mode -------------------------------------------------------

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No EVM wallet found. Install MetaMask, or use agent mode — it needs no extension.")
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

      setBrowserSigner(connected)
      setBrowserAddress(account)
      setStatus(cached ? "ready" : "connected")
    } catch (cause) {
      setStatus("disconnected")
      setError(describe(cause))
    }
  }, [network])

  const disconnect = useCallback(() => {
    if (browserAddress) aesKeyStore.clear(browserAddress, network.chainId)
    setBrowserSigner(null)
    setBrowserAddress(null)
    setStatus("disconnected")
    setError(null)
  }, [browserAddress, network.chainId])

  /**
   * Move COTI from the connected wallet to the agent.
   *
   * The one place agent mode touches MetaMask: an agent that cannot pay gas cannot onboard, and
   * onboarding is a real transaction.
   */
  const fundAgent = useCallback(
    async (amount: string) => {
      if (!agent) return
      setError(null)

      try {
        if (!browserSigner) {
          throw new Error("Connect a wallet first — funding sends COTI from it to the agent.")
        }

        const tx = await browserSigner.sendTransaction({
          to: agent.address,
          value: ethers.parseEther(amount),
        })
        await tx.wait()
        await refreshAgentBalance()
      } catch (cause) {
        setError(describe(cause))
      }
    },
    [agent, browserSigner, refreshAgentBalance],
  )

  // ---- shared ------------------------------------------------------------

  const activeSigner = mode === "agent" ? agentSigner : browserSigner
  const activeAddress = mode === "agent" ? (agent?.address ?? null) : browserAddress

  const effectiveStatus: WalletStatus =
    mode === "agent"
      ? !agent
        ? "disconnected"
        : status === "onboarding"
          ? "onboarding"
          : agentReady
            ? "ready"
            : "connected"
      : status

  const onboard = useCallback(async () => {
    const signer = mode === "agent" ? agentSigner : browserSigner
    const address = mode === "agent" ? agent?.address : browserAddress
    if (!signer || !address) return

    setStatus("onboarding")
    setError(null)

    try {
      await signer.generateOrRecoverAes(network.onboardContract)

      const aesKey = signer.getUserOnboardInfo()?.aesKey
      if (!aesKey) throw new Error("onboarding returned no AES key")

      aesKeyStore.save(address, network.chainId, aesKey)
      if (mode === "agent") setAgentReady(true)
      setStatus("ready")
    } catch (cause) {
      setStatus(mode === "agent" ? "disconnected" : "connected")
      setError(describe(cause))
    }
  }, [mode, agentSigner, browserSigner, agent, browserAddress, network])

  // A wallet-level account or chain change invalidates the browser session, AES key included.
  // The agent identity is unaffected — it does not belong to the extension.
  useEffect(() => {
    const ethereum = typeof window !== "undefined" ? window.ethereum : undefined
    if (!ethereum?.on || !ethereum.removeListener) return

    const reset = () => {
      setBrowserSigner(null)
      setBrowserAddress(null)
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
    mode,
    setMode: (next) => {
      setModeState(next)
      setError(null)
    },
    status: effectiveStatus,
    address: activeAddress,
    signer: activeSigner,
    reader,
    network,
    deployment,
    deploymentError,
    error,
    signsLocally: mode === "agent",
    hasWallet,
    connect,
    disconnect,
    agent,
    agentBalance,
    createAgentIdentity: () => {
      try {
        adoptAgent(createAgent(network.chainId))
      } catch (cause) {
        setError(describe(cause))
      }
    },
    importAgentIdentity: (privateKey) => {
      try {
        adoptAgent(importAgent(network.chainId, privateKey))
      } catch {
        // The key itself is never echoed back, here or anywhere else.
        setError("That is not a valid private key.")
      }
    },
    forgetAgentIdentity: () => {
      clearAgent(network.chainId, agent?.address)
      adoptAgent(null)
    },
    fundAgent,
    refreshAgentBalance,
    onboard,
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
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    })
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
    const error = cause as {
      shortMessage?: string
      reason?: string
      message?: string
      code?: number
    }
    if (error.code === 4001) return "Request rejected in the wallet."
    return error.shortMessage ?? error.reason ?? error.message ?? "Unknown wallet error."
  }
  return String(cause)
}
