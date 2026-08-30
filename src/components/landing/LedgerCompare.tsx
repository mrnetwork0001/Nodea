/**
 * The hero visual: the same job, on two different chains.
 *
 * Every abstract sentence about "confidential compute" resolves into this one picture — the left
 * card is what any block explorer shows today, the right card is the same four fields after COTI's
 * MPC layer gets them. Nothing here is mocked-up marketing shorthand: the field names match the
 * real storage in `NodeaCompute`, and the ciphertext strings are the shape a `ctUint256` and a
 * `ctString` actually take on chain.
 */
import { Eye, Lock } from "lucide-react"

const ROWS = [
  {
    field: "prompt",
    transparent: '"SYSTEM: rank ETH/USDC pools by…"',
    sealed: "ctString[0x8f3a…c210]",
  },
  { field: "price / 1k", transparent: "0.85 NDC", sealed: "ctUint256[0x41c9…7ab4]" },
  { field: "workload", transparent: "12,000 tokens", sealed: "ctUint256[0x0d52…9e18]" },
  { field: "settled", transparent: "10.20 NDC", sealed: "ctUint256[0xbb07…4f6d]" },
  { field: "balance left", transparent: "1,204.55 NDC", sealed: "ctUint256[0x77e1…b093]" },
] as const

export function LedgerCompare() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        tone="exposed"
        icon={<Eye className="h-4 w-4" />}
        title="On a transparent chain"
        caption="Everything your competitor needs."
      >
        {ROWS.map((row) => (
          <Row key={row.field} field={row.field} value={row.transparent} tone="exposed" />
        ))}
      </Card>

      <Card
        tone="sealed"
        icon={<Lock className="h-4 w-4" />}
        title="On Nodea"
        caption="The same job, same explorer."
      >
        {ROWS.map((row) => (
          <Row key={row.field} field={row.field} value={row.sealed} tone="sealed" />
        ))}
      </Card>
    </div>
  )
}

function Card({
  tone,
  icon,
  title,
  caption,
  children,
}: {
  tone: "exposed" | "sealed"
  icon: React.ReactNode
  title: string
  caption: string
  children: React.ReactNode
}) {
  const sealed = tone === "sealed"

  return (
    <div
      className={`panel overflow-hidden ${sealed ? "border-seal-500/40" : "border-breach-500/25"}`}
    >
      <div className="flex items-baseline gap-2 border-b border-ink-700/60 px-5 py-3.5">
        <span className={sealed ? "text-seal-400" : "text-breach-400"}>{icon}</span>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="text-[11px] text-slate-500">{caption}</span>
      </div>
      <dl className="divide-y divide-ink-800/70">{children}</dl>
    </div>
  )
}

function Row({
  field,
  value,
  tone,
}: {
  field: string
  value: string
  tone: "exposed" | "sealed"
}) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-2.5">
      <dt className="w-24 shrink-0 font-mono text-[11px] text-slate-500">{field}</dt>
      <dd
        className={`scroll-x min-w-0 flex-1 whitespace-nowrap font-mono text-xs ${
          tone === "sealed" ? "text-seal-400/70" : "text-breach-400/90"
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
