"use client"

/**
 * Session state: connection, AES key, and NDC balance.
 *
 * The balance row is the clearest single demonstration in the app. Before onboarding it reads
 * "sealed" — not because the app is being coy, but because the contract genuinely returns a
 * ciphertext this browser has no key for. After onboarding, the same call returns the same bytes
 * and they resolve to a number. Nothing about the chain changed; the reader did.
 */
import { Droplets, KeyRound, Plug } from "lucide-react"
import { useState } from "react"
import { formatCredits } from "@/lib/nodea/config"
import * as credits from "@/lib/nodea/credits"
import { useCreditBalance } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"
import { Address, ErrorNote, Panel, Spinner } from "./ui"

export function SessionPanel({ onChanged }: { onChanged: () => void }) {
  const { status, address, network, signer, deployment, connect, onboard, error, clearError, hasWallet } =
    useWallet()
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
        <Step
          index={1}
          title="Wallet"
          done={status !== "disconnected" && status !== "connecting"}
          detail={
            address ? (
              <Address value={address} network={network} chars={6} />
            ) : (
              "Connect an EVM wallet on COTI Testnet."
            )
          }
          action={
            status === "disconnected" || status === "connecting" ? (
              <button
                type="button"
                className="btn-primary !py-1.5 text-xs"
                onClick={() => void connect()}
                disabled={status === "connecting" || !hasWallet}
              >
                {status === "connecting" ? <Spinner className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
                Connect
              </button>
            ) : null
          }
        />

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
                className="btn-primary !py-1.5 text-xs"
                onClick={() => void onboard()}
                disabled={status === "onboarding"}
              >
                {status === "onboarding" ? <Spinner className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
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
              <span className="font-mono text-seal-400/60">sealed</span>
            ) : balance === null ? (
              "reading…"
            ) : (
              <span className="font-mono text-clear-400">{formatCredits(balance)} NDC</span>
            )
          }
          action={
            status === "ready" && !claimed ? (
              <button
                type="button"
                className="btn-clear !py-1.5 text-xs"
                onClick={() => void claim()}
                disabled={claiming}
              >
                {claiming ? <Spinner className="h-3.5 w-3.5" /> : <Droplets className="h-3.5 w-3.5" />}
                Claim 500 NDC
              </button>
            ) : null
          }
        />

        {error && <ErrorNote message={error} onDismiss={clearError} />}
        {claimError && <ErrorNote message={claimError} onDismiss={() => setClaimError(null)} />}
      </div>
    </Panel>
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
      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
        done ? "border-clear-500/30 bg-clear-500/5" : "border-ink-700/60 bg-ink-850/30"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
          done ? "bg-clear-500/20 text-clear-400" : "bg-ink-700 text-slate-400"
        }`}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-200">{title}</p>
        <div className="mt-0.5 text-[11px] text-slate-500">{detail}</div>
      </div>
      {action}
    </div>
  )
}
