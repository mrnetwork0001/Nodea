"use client"

/**
 * The public fleet.
 *
 * Notice the column that is missing. On every other compute marketplace the price is the first
 * thing you sort by; here it does not exist as public data at all, and the "Rate card" column
 * says so explicitly rather than leaving a blank. An agent chooses on model, hardware, region and
 * the settled/breached record — and the garbled circuit enforces its budget against a number
 * nobody at this table can read.
 */
import { Cpu, Lock, RefreshCw } from "lucide-react"
import { useFleet } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"
import { reliability } from "@/lib/nodea/reputation"
import { Address, Badge, EmptyState, ErrorNote, Panel, Spinner } from "./ui"

export function FleetTable({
  selectedNodeId,
  onSelect,
}: {
  selectedNodeId: number | null
  onSelect: (nodeId: number) => void
}) {
  const { network } = useWallet()
  const { data: fleet, loading, error, refresh } = useFleet()

  return (
    <Panel
      title="Compute fleet"
      subtitle="Public listings. Rate cards are confidential by construction."
      actions={
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1.5 text-xs"
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
          hint="Run `npm run seed` to register the demo fleet on COTI testnet."
        />
      )}

      {fleet.length > 0 && (
        <div className="scroll-x">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-left">
                <th className="label px-5 py-2.5 font-medium">Node</th>
                <th className="label px-3 py-2.5 font-medium">Hardware</th>
                <th className="label px-3 py-2.5 font-medium">SLA promise</th>
                <th className="label px-3 py-2.5 font-medium">Record</th>
                <th className="label px-3 py-2.5 font-medium">Rate card</th>
                <th className="label px-5 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fleet.map((node) => {
                const total = node.jobsSettled + node.jobsBreached
                const selected = node.id === selectedNodeId

                return (
                  <tr
                    key={node.id}
                    className={`border-b border-ink-800/60 transition-colors last:border-0 ${
                      selected ? "bg-seal-500/10" : "hover:bg-ink-850/50"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Cpu className="h-4 w-4 shrink-0 text-seal-400/70" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-200">{node.modelId}</p>
                          <Address value={node.operator} network={network} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-slate-300">{node.gpuClass}</p>
                      <p className="text-xs text-slate-500">{node.region}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      <p>{(node.promisedUptimeBps / 100).toFixed(2)}% uptime</p>
                      <p className="text-xs text-slate-500">&lt;{node.promisedLatencyMs}ms TTFT</p>
                    </td>
                    <td className="px-3 py-3">
                      {total === 0 ? (
                        <span className="text-xs text-slate-500">unproven</span>
                      ) : (
                        <>
                          <p className="text-slate-300">{(reliability(node) * 100).toFixed(0)}%</p>
                          <p className="text-xs text-slate-500">
                            {node.jobsSettled} met · {node.jobsBreached} breached
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-seal-400/60">
                        <Lock className="h-3 w-3" />
                        encrypted
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {node.active ? (
                        <button
                          type="button"
                          className={selected ? "btn-clear !px-3 !py-1.5 text-xs" : "btn-ghost !px-3 !py-1.5 text-xs"}
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
    </Panel>
  )
}
