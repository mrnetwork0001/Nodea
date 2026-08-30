/**
 * The hero visual: the same job, on two different chains.
 *
 * Every abstract sentence about "confidential compute" resolves into this one picture - the left
 * card is what any block explorer shows today, the right is the same five fields after COTI's MPC
 * layer gets them. The field names match the real storage in `NodeaCompute`, and the ciphertext
 * strings are the shape a `ctUint256` and a `ctString` actually take on chain.
 */
import { Eye, Lock } from "lucide-react"

const ROWS = [
  {
    field: "prompt",
    exposed: '"SYSTEM: rank ETH/USDC pools by…"',
    sealed: "ctString[0x8f3a…c210]",
  },
  { field: "price / 1k", exposed: "0.85 NDC", sealed: "ctUint256[0x41c9…7ab4]" },
  { field: "workload", exposed: "12,000 tokens", sealed: "ctUint256[0x0d52…9e18]" },
  { field: "settled", exposed: "10.20 NDC", sealed: "ctUint256[0xbb07…4f6d]" },
  { field: "balance left", exposed: "489.80 NDC", sealed: "ctUint256[0x77e1…b093]" },
] as const

export function LedgerCompare() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card
        icon={<Eye className="h-3.5 w-3.5" />}
        title="Any transparent chain"
        caption="Everything a competitor needs"
        accent={false}
      >
        {ROWS.map((row) => (
          <Row key={row.field} field={row.field} value={row.exposed} exposed />
        ))}
      </Card>

      <Card
        icon={<Lock className="h-3.5 w-3.5" />}
        title="Nodea on COTI"
        caption="Same job, same explorer"
        accent
      >
        {ROWS.map((row) => (
          <Row key={row.field} field={row.field} value={row.sealed} exposed={false} />
        ))}
      </Card>
    </div>
  )
}

function Card({
  icon,
  title,
  caption,
  accent,
  children,
}: {
  icon: React.ReactNode
  title: string
  caption: string
  accent: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`card ${accent ? "border-acid/30" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-void-600 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className={accent ? "text-acid" : "text-alert"}>{icon}</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tighter">{title}</h3>
        </div>
        <span className="eyebrow">{caption}</span>
      </div>
      <dl>{children}</dl>
    </div>
  )
}

function Row({ field, value, exposed }: { field: string; value: string; exposed: boolean }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-void-700/70 px-5 py-3 last:border-0">
      <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-label text-white/30">
        {field}
      </dt>
      <dd
        className={`scroll-x min-w-0 flex-1 whitespace-nowrap font-mono text-xs ${
          exposed ? "text-alert" : "text-acid"
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
