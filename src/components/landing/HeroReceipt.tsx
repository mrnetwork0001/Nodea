/**
 * The hero's product card: one settled job, as the chain actually stored it.
 *
 * The headline states the problem in words; this states it in evidence. Every row a competitor
 * would want - the rate card, the budget, what it cost, what the node earned - is present, named,
 * and unreadable. The row above the footer is the protocol's entire disclosure surface, rendered
 * at a glance: two facts, and nothing else.
 *
 * Node-to-model pairing is the real mainnet registry - node 5 is `claude-opus-5`. The hardware,
 * region and ciphertext are representative, the same way `LedgerCompare` further down the page is:
 * a `ctUint256` really does take this shape on chain.
 */
import { Lock } from "lucide-react"

const SEALED = [
  { label: "rate card", value: "ctUint256[0x41c9…7ab4]" },
  { label: "budget", value: "ctUint256[0x0d52…9e18]" },
  { label: "cost", value: "ctUint256[0xbb07…4f6d]" },
  { label: "payout", value: "ctUint256[0x77e1…b093]" },
] as const

export function HeroReceipt() {
  return (
    <div className="card p-5 sm:p-6">
      {/* ---- status line ---- */}
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-label text-white/45">
          <span className="h-1.5 w-1.5 rounded-full bg-acid" />
          job #10 · settled
        </p>
        <span className="chip border-acid/35 bg-acid/10 text-acid">sla met</span>
      </div>

      {/* ---- what the two parties can read, and nobody else ---- */}
      <div className="mt-5 rounded-xl border border-void-600 bg-void-950 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-xs text-acid">node 05 · claude-opus-5</p>
          <p className="font-mono text-[10px] uppercase tracking-label text-white/30">
            h100 · eu-west
          </p>
        </div>
        <p className="mt-3 font-mono text-xs leading-relaxed text-white/45">
          prompt <span className="text-white/25">→ sealed for this node alone</span>
          <br />
          answer <span className="text-white/25">→ sealed for the agent alone</span>
        </p>
      </div>

      {/* ---- the numbers a competitor would trade on ---- */}
      <dl className="mt-5 space-y-2.5">
        {SEALED.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-label text-white/35">
              {row.label}
            </dt>
            <dd className="ciphertext flex items-center gap-2">
              <Lock className="h-3 w-3 shrink-0 text-white/20" />
              <span className="tabular-nums">{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* ---- the entire disclosure surface, in one row ---- */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-void-600 bg-void-850 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-white/40">
          what an observer learns
        </p>
        <p className="font-mono text-[10px] uppercase tracking-label text-acid">
          a job happened · sla met
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-void-700 pt-4 font-mono text-[10px] uppercase tracking-label text-white/25">
        <span>coti mainnet · garbled circuit</span>
        <span>2 bits declassified</span>
      </div>
    </div>
  )
}
