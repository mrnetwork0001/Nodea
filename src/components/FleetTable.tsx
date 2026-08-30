"use client"

/**
 * The public fleet.
 *
 * Notice the column that is missing. On every other compute marketplace the price is the first
 * thing you sort by; here it does not exist as public data at all, and the "Rate card" column
 * says so explicitly rather than leaving a blank. An agent chooses on model, hardware, region and
 * the settled/breached record - and the garbled circuit enforces its budget against a number
 * nobody at this table can read.
 */
import { ChevronLeft, ChevronRight, Cpu, Lock, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"
import { useFleet } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"
import { reliability, score } from "@/lib/nodea/reputation"
import { Address, Badge, EmptyState, ErrorNote, Panel, Spinner } from "./ui"

/** Rows per page. Below this the controls are noise; above it the table stops being scannable. */
const PAGE_SIZE = 10

export function FleetTable({
  selectedNodeId,
  onSelect,
}: {
  selectedNodeId: number | null
  onSelect: (nodeId: number) => void
}) {
  const { network } = useWallet()
  const { data: fleet, loading, error, refresh } = useFleet()
  const [page, setPage] = useState(0)

  /**
   * Online nodes first, then by the same score an autonomous agent ranks with.
   *
   * A retired listing is still worth showing - the registry is append-only and its record is part
   * of the operator's history - but it is never what someone is looking for, so it sorts below
   * everything hireable rather than interleaving by id.
   */
  const ordered = useMemo(
    () =>
      [...fleet].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        return score(b) - score(a)
      }),
    [fleet],
  )

  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = ordered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const onlineCount = ordered.filter((node) => node.active).length

  return (
    <Panel
      title="Compute fleet"
      subtitle={`${onlineCount} online of ${ordered.length}. Rate cards are confidential by construction.`}
      actions={
        <button
          type="button"
          className="btn-sm btn-outline"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh fleet"
        >
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      }
    >
      {error && (
        <div className="p-4">
          <ErrorNote message={error} />
        </div>
      )}

      {!error && fleet.length === 0 && !loading && (
        <EmptyState
          title="No nodes registered yet"
          hint={`Run \`npm run seed\` to register the demo fleet on ${network.name}.`}
        />
      )}

      {ordered.length > 0 && (
        <div className="scroll-x">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-void-600 text-left">
                <th className="eyebrow px-5 py-3 font-medium">Node</th>
                <th className="eyebrow px-3 py-3 font-medium">Hardware</th>
                <th className="eyebrow px-3 py-3 font-medium">SLA promise</th>
                <th className="eyebrow px-3 py-3 font-medium">Record</th>
                <th className="eyebrow px-3 py-3 font-medium">Rate card</th>
                <th className="eyebrow px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((node) => {
                const total = node.jobsSettled + node.jobsBreached
                const selected = node.id === selectedNodeId

                return (
                  <tr
                    key={node.id}
                    className={`border-b border-void-600 transition-colors last:border-0 ${
                      selected ? "bg-acid/10" : "hover:bg-void-850"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Cpu className="h-4 w-4 shrink-0 text-acid/70" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{node.modelId}</p>
                          <Address value={node.operator} network={network} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-white/70">{node.gpuClass}</p>
                      <p className="text-xs text-white/40">{node.region}</p>
                    </td>
                    <td className="px-3 py-3 text-white/70">
                      <p>{(node.promisedUptimeBps / 100).toFixed(2)}% uptime</p>
                      <p className="text-xs text-white/40">&lt;{node.promisedLatencyMs}ms TTFT</p>
                    </td>
                    <td className="px-3 py-3">
                      {total === 0 ? (
                        <span className="text-xs text-white/40">unproven</span>
                      ) : (
                        <>
                          <p className="text-white/70">{(reliability(node) * 100).toFixed(0)}%</p>
                          <p className="text-xs text-white/40">
                            {node.jobsSettled} met · {node.jobsBreached} breached
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-white/25">
                        <Lock className="h-3 w-3" />
                        encrypted
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {node.active ? (
                        <button
                          type="button"
                          className={selected ? "btn-sm btn-acid" : "btn-sm btn-outline"}
                          onClick={() => onSelect(node.id)}
                        >
                          {selected ? "selected" : "hire"}
                        </button>
                      ) : (
                        <Badge>offline</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-void-600 px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-label text-white/30">
            {current * PAGE_SIZE + 1}-{Math.min(ordered.length, (current + 1) * PAGE_SIZE)} of{" "}
            {ordered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-sm btn-outline !px-2.5"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-[10px] tracking-label text-white/45">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              className="btn-sm btn-outline !px-2.5"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
