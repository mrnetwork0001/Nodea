"use client"

import Link from "next/link"
import { KeyRound, Plug, ShieldCheck } from "lucide-react"
import { useWallet } from "@/lib/wallet"
import { Address, Badge, Spinner } from "./ui"

export function Header() {
  const { mode, status, address, network, connect, onboard, disconnect, hasWallet } = useWallet()

  return (
    <header className="sticky top-0 z-40 border-b border-void-600 bg-void/85 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-sm bg-acid" />
          <span className="font-display text-lg font-extrabold uppercase tracking-tighter">
            Nodea
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Badge tone="muted">{network.name}</Badge>

          <Badge tone={mode === "agent" ? "acid" : "muted"}>
            {mode === "agent" ? "agent mode" : "wallet mode"}
          </Badge>

          {status === "ready" && address && (
            <>
              <Badge tone="acid">
                <KeyRound className="h-3 w-3" />
                AES key active
              </Badge>
              <Address value={address} network={network} />
              {mode === "wallet" && (
                <button type="button" className="btn-sm btn-outline" onClick={disconnect}>
                  disconnect
                </button>
              )}
            </>
          )}

          {status === "connected" && (
            <button type="button" className="btn-sm btn-acid" onClick={onboard}>
              <KeyRound className="h-3.5 w-3.5" />
              Derive AES key
            </button>
          )}

          {status === "onboarding" && (
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-white/45">
              <Spinner className="h-3.5 w-3.5" />
              onboarding…
            </span>
          )}

          {mode === "wallet" && (status === "disconnected" || status === "connecting") && (
            <button
              type="button"
              className="btn-sm btn-acid"
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
