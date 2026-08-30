"use client"

/**
 * The console header.
 *
 * It carries session *status* rather than navigation - which network, which identity is signing,
 * whether an AES key exists - plus whichever single action that status implies. On a wide screen
 * that reads as a row of badges. Below `md` it is five items competing for 350 pixels, so it
 * collapses behind a hamburger and becomes a stacked panel where each row can afford a label.
 *
 * The status the header exists to convey does not vanish when the panel closes: the dot beside the
 * mark stays visible and turns acid once an AES key is live, so the one thing worth knowing at a
 * glance still is.
 */
import Link from "next/link"
import { KeyRound, Plug } from "lucide-react"
import { useEffect, useState } from "react"
import { useWallet } from "@/lib/wallet"
import { Address, Badge, Spinner } from "./ui"

export function Header() {
  const { mode, status, address, network, connect, onboard, disconnect, hasWallet } = useWallet()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  /** The one action the current status implies, if any. Shared by both layouts. */
  const action =
    status === "connected" ? (
      <button
        type="button"
        className="btn-sm btn-acid"
        onClick={() => {
          setOpen(false)
          void onboard()
        }}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Derive AES key
      </button>
    ) : status === "onboarding" ? (
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-white/45">
        <Spinner className="h-3.5 w-3.5" />
        onboarding…
      </span>
    ) : mode === "wallet" && (status === "disconnected" || status === "connecting") ? (
      <button
        type="button"
        className="btn-sm btn-acid"
        onClick={() => {
          setOpen(false)
          void connect()
        }}
        disabled={status === "connecting" || !hasWallet}
        title={hasWallet ? undefined : "No EVM wallet detected"}
      >
        {status === "connecting" ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Plug className="h-3.5 w-3.5" />
        )}
        {hasWallet ? "Connect wallet" : "No wallet found"}
      </button>
    ) : status === "ready" && mode === "wallet" ? (
      <button
        type="button"
        className="btn-sm btn-outline"
        onClick={() => {
          setOpen(false)
          disconnect()
        }}
      >
        Disconnect
      </button>
    ) : null

  return (
    <header className="sticky top-0 z-40 border-b border-void-600 bg-void/85 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          {/* Doubles as the collapsed status light, so "is my key live?" survives the collapse. */}
          <span
            className={`h-2.5 w-2.5 rounded-sm ${status === "ready" ? "bg-acid" : "bg-void-500"}`}
            title={status === "ready" ? "AES key active" : "No AES key yet"}
          />
          <span className="font-display text-lg font-extrabold uppercase tracking-tighter">
            Nodea
          </span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
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
            </>
          )}

          {action}
        </div>

        <button
          type="button"
          className="-mr-2 flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-[5px] md:hidden"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="nodea-console-nav"
          aria-label={open ? "Close session menu" : "Open session menu"}
        >
          <span
            className={`block h-px w-5 bg-white transition-transform duration-200 ${
              open ? "translate-y-[6px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-opacity duration-200 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-transform duration-200 ${
              open ? "-translate-y-[6px] -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      <div
        id="nodea-console-nav"
        hidden={!open}
        className="border-t border-void-600 bg-void md:hidden"
      >
        <div className="shell space-y-3 py-4">
          <Row label="Network">
            <Badge tone="muted">{network.name}</Badge>
          </Row>

          <Row label="Signing as">
            <Badge tone={mode === "agent" ? "acid" : "muted"}>
              {mode === "agent" ? "agent mode" : "wallet mode"}
            </Badge>
          </Row>

          <Row label="AES key">
            {status === "ready" ? (
              <Badge tone="acid">
                <KeyRound className="h-3 w-3" />
                active
              </Badge>
            ) : (
              <span className="font-mono text-[11px] text-white/30">not derived</span>
            )}
          </Row>

          {address && (
            <Row label="Address">
              <Address value={address} network={network} chars={6} />
            </Row>
          )}

          {action && <div className="pt-1">{action}</div>}
        </div>
      </div>
    </header>
  )
}

/** A labelled status line - the room a stacked panel has that a badge row does not. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  )
}
