"use client"

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { explorerAddress, explorerTx, type NodeaNetwork } from "@/lib/nodea/config"

export function Panel({
  title,
  subtitle,
  index,
  actions,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  index?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-void-600 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            {index && <span className="font-mono text-[10px] tracking-label text-acid">{index}</span>}
            <h2 className="font-display text-sm font-bold uppercase tracking-tighter">{title}</h2>
          </div>
          {subtitle && <p className="mt-1 text-[11px] text-white/40">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

type Tone = "acid" | "muted" | "alert" | "warn"

const TONES: Record<Tone, string> = {
  acid: "border-acid/40 bg-acid/10 text-acid",
  muted: "border-void-500 bg-void-800 text-white/50",
  alert: "border-alert/40 bg-alert/10 text-alert",
  warn: "border-white/20 bg-white/5 text-white/70",
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${TONES[tone]}`}>{children}</span>
}

export function Address({
  value,
  network,
  chars = 4,
}: {
  value: string
  network?: NodeaNetwork
  chars?: number
}) {
  const short = `${value.slice(0, 6)}…${value.slice(-chars)}`
  if (!network) return <span className="font-mono text-[11px] text-white/40">{short}</span>

  return (
    <a
      className="inline-flex items-center gap-1 font-mono text-[11px] text-white/40 transition-colors hover:text-acid"
      href={explorerAddress(network, value)}
      target="_blank"
      rel="noreferrer"
    >
      {short}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function TxLink({
  hash,
  network,
  label = "view tx",
}: {
  hash: string
  network: NodeaNetwork
  label?: string
}) {
  return (
    <a
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-acid hover:text-acid-400"
      href={explorerTx(network, hash)}
      target="_blank"
      rel="noreferrer"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="rounded p-1 text-white/35 transition-colors hover:text-white"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* clipboard blocked — nothing useful to say about it */
        }
      }}
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-acid" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="font-display text-sm font-bold uppercase tracking-tighter text-white/60">
        {title}
      </p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-white/30">{hint}</p>}
    </div>
  )
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-alert/40 bg-alert/10 px-4 py-3">
      <p className="text-[11px] leading-relaxed text-alert">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 font-mono text-[10px] uppercase tracking-label text-alert/70 hover:text-alert"
        >
          dismiss
        </button>
      )}
    </div>
  )
}
