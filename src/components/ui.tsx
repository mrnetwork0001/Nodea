"use client"

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { explorerAddress, explorerTx, type NodeaNetwork } from "@/lib/nodea/config"

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

type Tone = "seal" | "clear" | "warn" | "breach" | "muted"

const TONES: Record<Tone, string> = {
  seal: "border-seal-500/40 bg-seal-500/10 text-seal-400",
  clear: "border-clear-500/40 bg-clear-500/10 text-clear-400",
  warn: "border-warn-500/40 bg-warn-500/10 text-warn-400",
  breach: "border-breach-500/40 bg-breach-500/10 text-breach-400",
  muted: "border-ink-600 bg-ink-800/60 text-slate-400",
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>
}

export function Stat({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: Tone
}) {
  const accent = tone === "clear" ? "text-clear-400" : tone === "seal" ? "text-seal-400" : "text-slate-100"
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-850/50 px-4 py-3">
      <p className="label">{label}</p>
      <p className={`mt-1 font-mono text-lg ${accent}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
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
  if (!network) return <span className="font-mono text-xs text-slate-400">{short}</span>

  return (
    <a
      className="inline-flex items-center gap-1 font-mono text-xs text-slate-400 hover:text-seal-400"
      href={explorerAddress(network, value)}
      target="_blank"
      rel="noreferrer"
    >
      {short}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function TxLink({ hash, network, label = "view tx" }: { hash: string; network: NodeaNetwork; label?: string }) {
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-seal-400 hover:text-seal-400/80"
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
      className="rounded p-1 text-slate-500 transition-colors hover:text-slate-300"
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
      {copied ? <Check className="h-3.5 w-3.5 text-clear-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-slate-400">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-breach-500/40 bg-breach-500/10 px-4 py-3">
      <p className="text-xs leading-relaxed text-breach-400">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs text-breach-400/70 hover:text-breach-400"
        >
          dismiss
        </button>
      )}
    </div>
  )
}
