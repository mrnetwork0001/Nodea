"use client"

/**
 * Data hooks for the dashboard.
 *
 * The split here mirrors the privacy model exactly, and that is the point: anything read through
 * `reader` (a plain RPC provider) is genuinely public - the fleet, job states, certificate
 * metadata. Anything that needs `signer` needs an AES key, because it is a ciphertext addressed to
 * one account. If a value can be fetched without a signer, it was never confidential.
 */
import { useCallback, useEffect, useState } from "react"
import * as compute from "./nodea/compute"
import * as credits from "./nodea/credits"
import * as sla from "./nodea/sla"
import type { JobRecord, NodeListing, SlaCertificate } from "./nodea/types"
import { useWallet } from "./wallet"

interface Resource<T> {
  data: T
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function useResource<T>(load: () => Promise<T>, initial: T, deps: unknown[]): Resource<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await load())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
    // `load` is rebuilt from deps by each caller below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}

/** The public fleet. No signer needed, because no part of a listing is confidential. */
export function useFleet(): Resource<NodeListing[]> {
  const { reader, deployment } = useWallet()

  return useResource<NodeListing[]>(
    async () => (deployment ? compute.listNodes(reader, deployment.compute) : []),
    [],
    [reader, deployment?.compute],
  )
}

/** Jobs opened by the connected agent. States are public; every attached amount is not. */
export function useJobs(): Resource<JobRecord[]> {
  const { reader, deployment, address } = useWallet()

  return useResource<JobRecord[]>(
    async () => {
      if (!deployment || !address) return []
      const ids = await compute.jobsOfClient(reader, deployment.compute, address)
      const jobs = await Promise.all(
        ids.map((id) => compute.getJob(reader, deployment.compute, id)),
      )
      return jobs.reverse()
    },
    [],
    [reader, deployment?.compute, address],
  )
}

/** SLA certificates held by the connected account, if it operates nodes. */
export function useCertificates(): Resource<SlaCertificate[]> {
  const { reader, deployment, address } = useWallet()

  return useResource<SlaCertificate[]>(
    async () => {
      if (!deployment || !address) return []
      const ids = await sla.certificatesOf(reader, deployment.sla, address)
      const certificates = await Promise.all(
        ids.map((id) => sla.getCertificate(reader, deployment.sla, id)),
      )
      return certificates.reverse()
    },
    [],
    [reader, deployment?.sla, address],
  )
}

/**
 * The connected account's NDC balance.
 *
 * Needs the signer, and only resolves once the AES key exists - the contract hands back a
 * ciphertext addressed to this account and the decryption happens in the browser.
 */
export function useCreditBalance(): Resource<bigint | null> & { claimed: boolean } {
  const { signer, reader, deployment, address, status } = useWallet()
  const [claimed, setClaimed] = useState(false)

  const resource = useResource<bigint | null>(
    async () => {
      if (!deployment || !signer || status !== "ready") return null
      return credits.balanceOf(signer, deployment.credits)
    },
    null,
    [signer, deployment?.credits, status],
  )

  useEffect(() => {
    if (!deployment || !address) return
    void credits
      .hasClaimedFaucet(reader, deployment.credits, address)
      .then(setClaimed)
      .catch(() => setClaimed(false))
  }, [reader, deployment, address, resource.data])

  return { ...resource, claimed }
}
