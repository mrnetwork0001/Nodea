"use client"

/**
 * The agent's jobs, with every amount still sealed until you ask for it.
 *
 * The row header is everything the chain publishes about a job: which node, what state, whether
 * the SLA held. Underneath, five quantities that exist only as ciphertext - and each one decrypts
 * in this browser, for this account, on demand. Expanding a row is the fastest way to see the
 * boundary the whole protocol is built around.
 */
import { ChevronDown, MessageSquareLock, RefreshCw } from "lucide-react"
import { useState } from "react"
import { formatCredits } from "@/lib/nodea/config"
import * as compute from "@/lib/nodea/compute"
import * as messaging from "@/lib/nodea/messaging"
import { computeContract, normalizeCtUint256 } from "@/lib/nodea/contracts"
import type { JobRecord } from "@/lib/nodea/types"
import { useJobs } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"
import { formatCiphertext, SealedValue } from "./SealedValue"
import { Badge, EmptyState, ErrorNote, Panel, Spinner } from "./ui"

export function JobsPanel({ refreshKey }: { refreshKey: number }) {
  const { data: jobs, loading, error, refresh } = useJobs()
  const [expanded, setExpanded] = useState<number | null>(null)

  // Re-fetch whenever the composer reports a new job.
  const [lastKey, setLastKey] = useState(refreshKey)
  if (lastKey !== refreshKey) {
    setLastKey(refreshKey)
    void refresh()
  }

  return (
    <Panel
      title="Your jobs"
      subtitle="States are public. Amounts are not - decrypt them below."
      actions={
        <button
          type="button"
          className="btn-sm btn-outline"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh jobs"
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

      {!error && jobs.length === 0 && !loading && (
        <EmptyState title="No jobs yet" hint="Hire a node above to open your first encrypted escrow." />
      )}

      <ul>
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            expanded={expanded === job.id}
            onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
          />
        ))}
      </ul>
    </Panel>
  )
}

function JobRow({
  job,
  expanded,
  onToggle,
}: {
  job: JobRecord
  expanded: boolean
  onToggle: () => void
}) {
  const { signer, status, deployment } = useWallet()
  const canDecrypt = status === "ready" && Boolean(signer && deployment)

  const sealed = (method: "jobWorkloadFor" | "jobCostFor" | "jobDeliveredFor" | "jobPayoutFor" | "jobRefundFor", format: (value: bigint) => string) =>
    async () => {
      if (!signer || !deployment) return null

      const contract = computeContract(deployment.compute, signer as never)
      const raw = normalizeCtUint256(await contract[method](job.id))
      if (raw.ciphertextHigh === 0n && raw.ciphertextLow === 0n) return null

      return {
        ciphertext: formatCiphertext(raw),
        plaintext: format(await signer.decryptValue256(raw)),
      }
    }

  const settled = job.state === "Settled"

  return (
    <li className="border-b border-void-600 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-void-850"
      >
        <span className="font-mono text-xs text-white/40">#{job.id}</span>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-white">
            node #{job.nodeId}
            <span className="ml-2 text-xs text-white/40">
              opened {new Date(job.openedAt * 1000).toLocaleString()}
            </span>
          </p>
          <p className="text-[11px] text-white/40">
            prompt message #{job.promptMessageId}
            {job.certificateId > 0 && ` · SLA certificate #${job.certificateId}`}
          </p>
        </div>

        {job.state === "Escrowed" && <Badge tone="warn">escrowed</Badge>}
        {job.state === "Refunded" && <Badge tone="muted">reclaimed</Badge>}
        {settled &&
          (job.slaMet ? <Badge tone="acid">SLA met</Badge> : <Badge tone="alert">SLA breached</Badge>)}

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-void-600 bg-void-950 px-5 py-4">
          {settled && <JobResult jobId={job.id} />}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SealedValue
              label="Minimum ordered"
              disabled={!canDecrypt}
              fetcher={sealed("jobWorkloadFor", (value) => `${value} tokens`)}
            />
            <SealedValue
              label="Escrowed cost"
              disabled={!canDecrypt}
              fetcher={sealed("jobCostFor", (value) => `${formatCredits(value)} NDC`)}
            />
            <SealedValue
              label="Tokens delivered"
              disabled={!canDecrypt}
              fetcher={sealed("jobDeliveredFor", (value) => `${value} tokens`)}
            />
            <SealedValue
              label="Paid to node"
              disabled={!canDecrypt}
              fetcher={sealed("jobPayoutFor", (value) => `${formatCredits(value)} NDC`)}
            />
            <SealedValue
              label="Returned to you"
              disabled={!canDecrypt}
              fetcher={sealed("jobRefundFor", (value) => `${formatCredits(value)} NDC`)}
            />
            <div className="rounded-lg border border-void-600 bg-void-850 px-3 py-2.5">
              <p className="eyebrow">Attestation digest</p>
              <p className="scroll-x mt-1 whitespace-nowrap font-mono text-xs text-white/45">
                {job.attestationDigest === "0x" + "0".repeat(64)
                  ? "awaiting proof of execution"
                  : job.attestationDigest}
              </p>
            </div>
          </div>

          {job.state === "Escrowed" && <ReclaimNotice job={job} />}
        </div>
      )}
    </li>
  )
}

/**
 * The answer the job was opened to buy.
 *
 * Everything else on this row - the escrow, the SLA verdict, the certificate - exists to make
 * paying for this safe. The completion travels back down the same E2EE channel the prompt went
 * out on, so it is sealed for this agent alone and decrypts here, in the browser, with the same
 * AES key that read the balances.
 */
function JobResult({ jobId }: { jobId: number }) {
  const { signer, status, deployment } = useWallet()
  const [state, setState] = useState<"idle" | "loading" | "done" | "none">("idle")
  const [text, setText] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)

  const load = async () => {
    if (!signer || !deployment) return
    setState("loading")
    try {
      const result = await messaging.readResult(signer, deployment.promptChannel, jobId)
      if (!result) {
        setState("none")
        return
      }
      setText(result.text)
      setPartial(!result.complete)
      setState("done")
    } catch {
      setState("none")
    }
  }

  return (
    <div className="rounded-xl border border-acid/30 bg-acid/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-acid">
          <MessageSquareLock className="h-3 w-3" />
          The answer
        </p>
        {state === "idle" && (
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-label text-acid hover:text-acid/80 disabled:opacity-35"
            onClick={() => void load()}
            disabled={status !== "ready"}
            title={status === "ready" ? undefined : "Derive your AES key to decrypt"}
          >
            decrypt
          </button>
        )}
        {state === "loading" && <Spinner className="h-3 w-3 text-acid" />}
      </div>

      {state === "idle" && <p className="mt-1.5 font-mono text-sm text-white/25">sealed</p>}

      {state === "none" && (
        <p className="mt-1.5 text-[11px] text-white/30">
          No result found in this account&apos;s inbox. Jobs settled before results were returned
          have none.
        </p>
      )}

      {state === "done" && (
        <>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-white">{text}</p>
          <p className="mt-2 text-[10px] text-white/30">
            {partial ? "Some parts are still arriving. " : ""}
            Decrypted in this browser - the node sealed it for this agent alone.
          </p>
        </>
      )}
    </div>
  )
}

function ReclaimNotice({ job }: { job: JobRecord }) {
  const { signer, deployment } = useWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expired = Date.now() / 1000 > job.deadline

  const reclaim = async () => {
    if (!signer || !deployment) return
    setBusy(true)
    setError(null)
    try {
      await compute.reclaimExpiredJob(signer, deployment.compute, job.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-void-600 bg-void-850 px-4 py-3">
      <p className="text-[11px] text-white/40">
        {expired
          ? "The deadline has passed with no proof of execution. Your escrow is reclaimable."
          : `Escrow is protected until ${new Date(job.deadline * 1000).toLocaleString()}, after which you can reclaim it.`}
      </p>
      <button
        type="button"
        className="btn-sm btn-outline"
        onClick={() => void reclaim()}
        disabled={!expired || busy}
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
        Reclaim escrow
      </button>
      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}
    </div>
  )
}
