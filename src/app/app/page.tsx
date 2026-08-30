"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { CertificatePanel } from "@/components/CertificatePanel"
import { FleetTable } from "@/components/FleetTable"
import { Header } from "@/components/Header"
import { JobComposer } from "@/components/JobComposer"
import { JobsPanel } from "@/components/JobsPanel"
import { SessionPanel } from "@/components/SessionPanel"
import { ErrorNote } from "@/components/ui"
import { useFleet } from "@/lib/useNodea"
import { useWallet } from "@/lib/wallet"

export default function Dashboard() {
  const { deploymentError, network } = useWallet()
  const { data: fleet } = useFleet()

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const selectedNode = fleet.find((node) => node.id === selectedNodeId) ?? null
  const bump = () => setRefreshKey((key) => key + 1)

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">Console</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Hire compute, settle in ciphertext, and decrypt your own values locally.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            How Nodea works
          </Link>
        </div>

        {deploymentError && (
          <div className="mb-5">
            <ErrorNote message={deploymentError} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <FleetTable selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
            <JobsPanel refreshKey={refreshKey} />
            <CertificatePanel refreshKey={refreshKey} />
          </div>

          <div className="space-y-4">
            <SessionPanel onChanged={bump} />
            <JobComposer node={selectedNode} onJobOpened={bump} />
          </div>
        </div>

        <footer className="mt-10 border-t border-ink-800/70 pt-6 text-xs text-slate-600">
          <p>
            Nodea · Apache-2.0 · running on {network.name}. Contracts, SDK and the autonomous agent
            runtime are in the repository.
          </p>
        </footer>
      </main>
    </>
  )
}
