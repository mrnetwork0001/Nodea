"use client"

/**
 * Session state: which identity is signing, its AES key, and its NDC balance.
 *
 * The balance row is the clearest single demonstration in the app. Before deriving it reads
 * "sealed" - not because the app is being coy, but because the contract genuinely returns a
 * ciphertext this browser has no key for. After onboarding, the same call returns the same bytes
 * and they resolve to a number. Nothing about the chain changed; the reader did.
 */
import { AlertTriangle, Cpu, Droplets, Eye, EyeOff, KeyRound, Plug, Wallet as WalletIcon } from "lucide-react"
import { useState } from "react"
import { ethers } from "@coti-io/coti-ethers"
import { formatCredits } from "@/lib/nodea/config"
import * as credits from "@/lib/nodea/credits"
import { useCreditBalance } from "@/lib/useNodea"
import { useWallet, type SignerMode } from "@/lib/wallet"
import { ConfirmDialog } from "./ConfirmDialog"
import { Address, CopyButton, ErrorNote, Panel, Spinner } from "./ui"

/** Enough to onboard, claim credits and run several jobs. */
const DEFAULT_FUNDING = "0.3"

export function SessionPanel({ onChanged }: { onChanged: () => void }) {
  const wallet = useWallet()
  const { mode, setMode, status, address, network, signer, deployment, error, clearError } = wallet
  const { data: balance, claimed, refresh } = useCreditBalance()

  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const claim = async () => {
    if (!signer || !deployment) return
    setClaiming(true)
    setClaimError(null)
    try {
      await credits.claimFaucet(signer, deployment.credits)
      await refresh()
      onChanged()
    } catch (cause) {
      setClaimError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Panel title="Session" subtitle="Two keys: one signs, one decrypts.">
      <div className="space-y-3 p-5">
        <ModeToggle mode={mode} onChange={setMode} />

        {mode === "agent" ? <AgentIdentity /> : <WalletIdentity />}

        <Step
          index={2}
          title="AES key"
          done={status === "ready"}
          detail={
            status === "ready"
              ? "Derived from COTI AccountOnboard. Held only in this browser."
              : "Without it, every value on this page stays a ciphertext."
          }
          action={
            status === "connected" || status === "onboarding" ? (
              <button
                type="button"
                className="btn-sm btn-acid"
                onClick={() => void wallet.onboard()}
                disabled={status === "onboarding"}
              >
                {status === "onboarding" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                Derive
              </button>
            ) : null
          }
        />

        <Step
          index={3}
          title="Compute credits"
          done={balance !== null && balance > 0n}
          detail={
            status !== "ready" ? (
              <span className="font-mono text-white/25">sealed</span>
            ) : balance === null ? (
              "reading…"
            ) : (
              <span className="plaintext">{formatCredits(balance)} NDC</span>
            )
          }
          action={
            status === "ready" && !claimed ? (
              <button
                type="button"
                className="btn-sm btn-acid"
                onClick={() => void claim()}
                disabled={claiming}
              >
                {claiming ? <Spinner className="h-3.5 w-3.5" /> : <Droplets className="h-3.5 w-3.5" />}
                Claim 500
              </button>
            ) : null
          }
        />

        {error && <ErrorNote message={error} onDismiss={clearError} />}
        {claimError && <ErrorNote message={claimError} onDismiss={() => setClaimError(null)} />}

        {address && (
          <p className="text-[11px] leading-relaxed text-white/30">
            Signing as <Address value={address} network={network} chars={6} />
            {mode === "agent"
              ? " - locally, with no wallet prompts."
              : " - one wallet prompt per 8-byte cell when sealing a prompt."}
          </p>
        )}
      </div>
    </Panel>
  )
}

/**
 * The mode switch.
 *
 * Not a preference toggle: these are genuinely different identities with different signing
 * behaviour, and the labels say which is which rather than leaving it to be discovered nine
 * popups in.
 */
function ModeToggle({ mode, onChange }: { mode: SignerMode; onChange: (mode: SignerMode) => void }) {
  const options: Array<{ value: SignerMode; label: string; icon: React.ReactNode; hint: string }> = [
    { value: "agent", label: "Agent", icon: <Cpu className="h-3.5 w-3.5" />, hint: "signs locally" },
    {
      value: "wallet",
      label: "Wallet",
      icon: <WalletIcon className="h-3.5 w-3.5" />,
      hint: "MetaMask",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-void-600 bg-void-950 p-1.5">
      {options.map((option) => {
        const active = option.value === mode
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2.5 transition-colors ${
              active ? "bg-acid text-black" : "text-white/45 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-label">
              {option.icon}
              {option.label}
            </span>
            <span
              className={`font-mono text-[9px] uppercase tracking-label ${
                active ? "text-black/60" : "text-white/25"
              }`}
            >
              {option.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function WalletIdentity() {
  const { status, address, network, connect, disconnect, hasWallet } = useWallet()

  return (
    <Step
      index={1}
      title="Wallet"
      done={status !== "disconnected" && status !== "connecting"}
      detail={
        address ? (
          <Address value={address} network={network} chars={6} />
        ) : (
          `Connect an EVM wallet on ${network.name}.`
        )
      }
      action={
        address ? (
          <button type="button" className="btn-sm btn-outline" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn-sm btn-acid"
            onClick={() => void connect()}
            disabled={status === "connecting" || !hasWallet}
          >
            {status === "connecting" ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Plug className="h-3.5 w-3.5" />
            )}
            Connect
          </button>
        )
      }
    />
  )
}

function AgentIdentity() {
  const {
    agent,
    agentBalance,
    network,
    createAgentIdentity,
    importAgentIdentity,
    forgetAgentIdentity,
    fundAgent,
    refreshAgentBalance,
    hasWallet,
    connect,
  } = useWallet()

  const [importing, setImporting] = useState(false)
  const [importValue, setImportValue] = useState("")
  const [funding, setFunding] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  if (!agent) {
    return (
      <div className="rounded-xl border border-void-600 bg-void-850 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-void-700 text-[11px] text-white/45">
            1
          </span>
          <p className="text-xs font-medium text-white">Agent identity</p>
        </div>
        <p className="muted mt-2">
          A key held in this browser, so the console signs locally instead of asking your wallet
          once per 8-byte cell. This is what the CLI agent does.
        </p>

        {importing ? (
          <div className="mt-3 space-y-2">
            <input
              className="field"
              type="password"
              placeholder="0x… private key"
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-sm btn-acid flex-1"
                onClick={() => {
                  importAgentIdentity(importValue)
                  setImportValue("")
                  setImporting(false)
                }}
              >
                Import
              </button>
              <button
                type="button"
                className="btn-sm btn-outline"
                onClick={() => {
                  setImportValue("")
                  setImporting(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-sm btn-acid flex-1" onClick={createAgentIdentity}>
              <Cpu className="h-3.5 w-3.5" />
              Create agent
            </button>
            <button type="button" className="btn-sm btn-outline" onClick={() => setImporting(true)}>
              Import key
            </button>
          </div>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-white/25">
          A hot key in browser storage, for small amounts. It never leaves this browser and is never
          sent anywhere, but anyone with access to this profile has it.
        </p>
      </div>
    )
  }

  const funded = (agentBalance ?? 0n) > 0n

  return (
    <div className="rounded-xl border border-acid/30 bg-acid/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-acid/20 text-[11px] text-acid">
            1
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white">Agent identity</p>
            <Address value={agent.address} network={network} chars={6} />
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 font-mono text-[10px] uppercase tracking-label text-white/30 hover:text-alert"
          onClick={() => setForgetting(true)}
        >
          forget
        </button>
      </div>

      <ConfirmDialog
        open={forgetting}
        tone="danger"
        title="Forget this agent?"
        body={
          <>
            <p>
              The key is deleted from this browser. Any COTI or NDC this agent holds becomes
              unreachable unless you have already backed the key up.
            </p>
            <p className="font-mono text-[11px] text-white/60">
              {ethers.formatEther(agentBalance ?? 0n)} COTI held
            </p>
          </>
        }
        confirmLabel="Hold to forget"
        holdToConfirm
        onCancel={() => setForgetting(false)}
        onConfirm={() => {
          setForgetting(false)
          forgetAgentIdentity()
        }}
      />

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-acid/20 pt-3">
        <span className="font-mono text-[11px] text-white/45">
          {agentBalance === null ? "…" : `${ethers.formatEther(agentBalance)} COTI`}
        </span>

        {!funded && (
          <button
            type="button"
            className="btn-sm btn-acid"
            disabled={funding || !hasWallet}
            onClick={async () => {
              setFunding(true)
              try {
                await connect()
                await fundAgent(DEFAULT_FUNDING)
              } finally {
                setFunding(false)
                void refreshAgentBalance()
              }
            }}
          >
            {funding ? <Spinner className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
            Fund {DEFAULT_FUNDING} COTI
          </button>
        )}
      </div>

      {funded && <BackupKey privateKey={agent.privateKey} />}

      {!funded && (
        <div className="mt-3 space-y-2 border-t border-acid/20 pt-3">
          <p className="text-[10px] leading-relaxed text-white/40">
            The agent needs COTI for gas before it can onboard. Three ways to get it there:
          </p>
          <ol className="space-y-1.5 text-[10px] leading-relaxed text-white/30">
            <li>
              <span className="text-white/50">1.</span> The button above, if your wallet holds COTI
              on {network.name} - the only wallet prompt agent mode needs.
            </li>
            <li>
              <span className="text-white/50">2.</span> Send COTI to the address above from any
              wallet or exchange withdrawal.
            </li>
            <li>
              <span className="text-white/50">3.</span> From the repo, using the deployer key:
              <code className="mt-1 block break-all font-mono text-acid">
                npm run fund -- --to {agent.address} 0.3
              </code>
            </li>
          </ol>
          <p className="text-[10px] leading-relaxed text-white/25">
            Must be native COTI on chain {network.chainId} - the COTI ERC-20 on Ethereum will not
            arrive here.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Back up the agent key.
 *
 * This exists because the identity lives in `localStorage` and nowhere else. It survives a
 * reload, a closed tab and a restarted browser - but not cleared site data, a different browser,
 * or a private window that ends. Once the agent holds funds, the key is the only way back to
 * them, and there is no recovery path we could offer instead.
 *
 * Revealing it is behind a click and a warning rather than shown by default, because the most
 * likely moment someone opens this panel is while screen-sharing or recording a demo.
 */
function BackupKey({ privateKey }: { privateKey: string }) {
  const [revealed, setRevealed] = useState(false)
  const [asking, setAsking] = useState(false)

  return (
    <div className="mt-3 border-t border-acid/20 pt-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
        <p className="text-[10px] leading-relaxed text-white/40">
          This key lives only in this browser. It survives a reload, but clearing site data or
          switching browser loses it - and the funds with it. Back it up.
        </p>
      </div>

      {revealed ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2">
            <code className="scroll-x min-w-0 flex-1 whitespace-nowrap font-mono text-[10px] text-alert">
              {privateKey}
            </code>
            <CopyButton value={privateKey} />
          </div>
          <button
            type="button"
            className="btn-sm btn-outline w-full"
            onClick={() => setRevealed(false)}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Hide
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-sm btn-outline mt-2 w-full"
          onClick={() => setAsking(true)}
        >
          <Eye className="h-3.5 w-3.5" />
          Reveal key to back up
        </button>
      )}

      <ConfirmDialog
        open={asking}
        tone="danger"
        title="Reveal the private key?"
        body={
          <>
            <p>
              Anyone who sees or records this key controls the agent and everything it holds.
            </p>
            <p className="text-white/60">
              Do not reveal it while screen-sharing or recording.
            </p>
          </>
        }
        confirmLabel="Hold to reveal"
        holdToConfirm
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          setRevealed(true)
        }}
      />
    </div>
  )
}

function Step({
  index,
  title,
  detail,
  done,
  action,
}: {
  index: number
  title: string
  detail: React.ReactNode
  done: boolean
  action?: React.ReactNode
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
        done ? "border-acid/30 bg-acid/5" : "border-void-600 bg-void-850"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
          done ? "bg-acid/20 text-acid" : "bg-void-700 text-white/45"
        }`}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white">{title}</p>
        <div className="mt-0.5 text-[11px] text-white/40">{detail}</div>
      </div>
      {action}
    </div>
  )
}
