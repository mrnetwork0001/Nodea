"use client"

/**
 * SLA certificates held by the connected account.
 *
 * Only shows anything if you operate nodes — these are the node's receipts, not the agent's. The
 * split on each card is the whole idea: the public face is what a future customer needs to trust
 * the operator, and the encrypted manifest underneath is the telemetry that would have exposed a
 * customer's workload if it had been published alongside it.
 */
import { Award, RefreshCw } from "lucide-react"
import { useState } from "react"
import * as sla from "@/lib/nodea/sla"
import type { SlaCertificate, SlaManifest } from "@/lib/nodea/types"
import { useCertificates } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"
import { Badge, EmptyState, ErrorNote, Panel, Spinner } from "./ui"

export function CertificatePanel({ refreshKey }: { refreshKey: number }) {
  const { data: certificates, loading, error, refresh } = useCertificates()

  const [lastKey, setLastKey] = useState(refreshKey)
  if (lastKey !== refreshKey) {
    setLastKey(refreshKey)
    void refresh()
  }

  return (
    <Panel
      title="SLA certificates"
      subtitle="Confidential ERC-721 receipts. Soulbound to the operator that earned them."
      actions={
        <button
          type="button"
          className="btn-sm btn-outline"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh certificates"
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

      {!error && certificates.length === 0 && !loading && (
        <EmptyState
          title="No certificates held by this account"
          hint="Certificates are minted to node operators when a job settles."
        />
      )}

      {certificates.length > 0 && (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {certificates.map((certificate) => (
            <CertificateCard key={certificate.tokenId} certificate={certificate} />
          ))}
        </div>
      )}
    </Panel>
  )
}

function CertificateCard({ certificate }: { certificate: SlaCertificate }) {
  const { signer, status, deployment } = useWallet()
  const [manifest, setManifest] = useState<SlaManifest | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "done" | "sealed">("idle")

  const reveal = async () => {
    if (!signer || !deployment) return
    setState("loading")
    try {
      const decrypted = await sla.readManifest(signer, deployment.sla, certificate.tokenId)
      if (!decrypted) {
        setState("sealed")
        return
      }
      setManifest(decrypted)
      setState("done")
    } catch {
      setState("sealed")
    }
  }

  return (
    <article className="rounded-lg border border-void-600 bg-void-850 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Award
            className={`h-4 w-4 ${certificate.slaMet ? "text-acid" : "text-alert"}`}
          />
          <div>
            <p className="text-sm font-medium text-white">Certificate #{certificate.tokenId}</p>
            <p className="text-[11px] text-white/40">
              job #{certificate.jobId} · {new Date(certificate.issuedAt * 1000).toLocaleDateString()}
            </p>
          </div>
        </div>
        {certificate.slaMet ? (
          <Badge tone="acid">SLA met</Badge>
        ) : (
          <Badge tone="alert">breached</Badge>
        )}
      </div>

      <dl className="mt-3 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <dt className="text-white/40">Promised uptime</dt>
          <dd className="font-mono text-white/70">{(certificate.promisedUptimeBps / 100).toFixed(2)}%</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-white/40">Attestation</dt>
          <dd className="truncate font-mono text-white/45">{certificate.attestationDigest}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-void-600 pt-3">
        {state === "idle" && (
          <button
            type="button"
            className="btn-sm btn-outline w-full"
            onClick={() => void reveal()}
            disabled={status !== "ready"}
            title={status === "ready" ? undefined : "Derive your AES key to decrypt"}
          >
            Decrypt manifest
          </button>
        )}

        {state === "loading" && (
          <p className="flex items-center justify-center gap-2 py-1.5 text-xs text-white/45">
            <Spinner className="h-3.5 w-3.5" /> decrypting…
          </p>
        )}

        {state === "sealed" && (
          <p className="py-1.5 text-center text-xs text-white/25">
            Sealed to you — only the owning operator can read this manifest.
          </p>
        )}

        {state === "done" && manifest && (
          <dl className="space-y-1 text-[11px]">
            <p className="eyebrow mb-2">Decrypted manifest</p>
            <Row label="Model" value={manifest.model} />
            <Row label="Tokens generated" value={manifest.tokens.toLocaleString()} />
            <Row label="Measured uptime" value={`${(manifest.uptimeBps / 100).toFixed(2)}%`} />
            <Row label="Measured TTFT" value={`${manifest.latencyMs} ms`} />
          </dl>
        )}
      </div>
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-white/40">{label}</dt>
      <dd className="truncate font-mono text-acid">{value}</dd>
    </div>
  )
}
