"use client"

import Link from "next/link"
import { KeyRound, Plug, ShieldCheck } from "lucide-react"
import { useWallet } from "@/lib/wallet"
import { Address, Badge, Spinner } from "./ui"

export function Header() {
  const { status, address, network, connect, onboard, disconnect, hasWallet } = useWallet()

  return (
    <header className="sticky top-0 z-20 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-seal-500 to-clear-500">
            <ShieldCheck className="h-4 w-4 text-ink-950" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight text-slate-100">Nodea</span>
            <span className="block text-[11px] text-slate-500">Encrypted DeAI compute on COTI</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Badge tone="seal">{network.name}</Badge>

          {status === "ready" && address && (
            <>
              <Badge tone="clear">
                <KeyRound className="h-3 w-3" />
                AES key active
              </Badge>
              <Address value={address} network={network} />
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={disconnect}>
                disconnect
              </button>
            </>
          )}

          {status === "connected" && (
            <button type="button" className="btn-primary !py-1.5 text-xs" onClick={onboard}>
              <KeyRound className="h-3.5 w-3.5" />
              Derive AES key
            </button>
          )}

          {status === "onboarding" && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <Spinner className="h-3.5 w-3.5" />
              onboarding…
            </span>
          )}

          {(status === "disconnected" || status === "connecting") && (
            <button
              type="button"
              className="btn-primary !py-1.5 text-xs"
              onClick={connect}
              disabled={status === "connecting" || !hasWallet}
              title={hasWallet ? undefined : "No EVM wallet detected"}
            >
              {status === "connecting" ? <Spinner className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
              {hasWallet ? "Connect wallet" : "No wallet found"}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
