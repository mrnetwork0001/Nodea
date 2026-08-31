"use client"

import { useState } from "react"
import { CertificatePanel } from "@/components/CertificatePanel"
import { FleetTable } from "@/components/FleetTable"
import { Header } from "@/components/Header"
import { JobComposer } from "@/components/JobComposer"
import { JobsPanel } from "@/components/JobsPanel"
import { SessionPanel } from "@/components/SessionPanel"
import { Wordmark } from "@/components/Wordmark"
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

      <main className="shell py-8">
        <div className="mb-6 border-b border-void-600 pb-6 lg:mb-7 lg:pb-7">
          {/* No back link here: the wordmark already routes home, and a second control for the
              same destination was only competing with it. */}
          <p className="eyebrow flex items-center gap-3">
            <span className="text-acid">00</span>
            <span className="h-px w-8 bg-void-500" />
            {network.name}
          </p>
          <h1 className="display-md mt-4">Console</h1>
          <p className="muted mt-3 max-w-lg">
            Hire compute, settle in ciphertext, and decrypt your own values locally. Nothing on this
            page is read by a server - there isn&apos;t one.
          </p>
        </div>

        {deploymentError && (
          <div className="mb-5">
            <ErrorNote message={deploymentError} />
          </div>
        )}

        {/* On a narrow screen the session and composer lead, because a fleet of ten nodes would
            otherwise put the thing you came to do several screens down. `order` restores the
            two-column reading order at lg, where both columns are visible at once. */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:order-2">
            <SessionPanel onChanged={bump} />
            <JobComposer node={selectedNode} onJobOpened={bump} />
          </div>

          <div className="space-y-3 lg:order-1 lg:col-span-2">
            <FleetTable selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
            <JobsPanel refreshKey={refreshKey} />
            <CertificatePanel refreshKey={refreshKey} />
          </div>
        </div>

        <footer className="mt-12 space-y-4 border-t border-void-600 pt-7">
          <Wordmark className="h-7 w-auto" />
          <p className="muted">
            Apache-2.0 · running on {network.name}. Contracts, SDK and the autonomous agent
            runtime are in the repository.
          </p>
        </footer>
      </main>
    </>
  )
}
