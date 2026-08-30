/**
 * COTI skill 4 - `coti-private-nft`.
 *
 * Private compute has a marketing problem: a provider must prove it is reliable to win the next
 * contract, but publishing that proof on a transparent chain would also publish its customers'
 * inference patterns - which model, how often, how large. The reputation and the confidentiality
 * appear to be in direct conflict.
 *
 * A confidential ERC-721 resolves it. Every settled job mints one certificate to the node
 * operator. Public on the token: which job, which client, what uptime was promised, and whether
 * the garbled circuit found the SLA met. Encrypted in the token URI, readable only by the
 * operator that owns it: the manifest - tokens generated, measured latency, measured uptime, and
 * the attestation digest. The track record is verifiable; the workload behind it is not exposed.
 *
 * Certificates are soulbound. Reputation that can be sold to another operator is not reputation.
 */
import type { ContractRunner, Provider } from "@coti-io/coti-ethers"
import { normalizeCtString, slaContract } from "./contracts"
import type { CotiSigner, SlaCertificate, SlaManifest } from "./types"

/** Build the compact JSON manifest a node seals into its certificate. */
export function buildManifest(manifest: SlaManifest): string {
  return JSON.stringify({
    j: manifest.job,
    m: manifest.model,
    t: manifest.tokens,
    u: manifest.uptimeBps,
    l: manifest.latencyMs,
    a: manifest.attestation,
  })
}

export function parseManifest(json: string): SlaManifest | null {
  try {
    const raw = JSON.parse(json)
    return {
      job: Number(raw.j),
      model: String(raw.m),
      tokens: Number(raw.t),
      uptimeBps: Number(raw.u),
      latencyMs: Number(raw.l),
      attestation: String(raw.a),
    }
  } catch {
    return null
  }
}

export async function certificatesOf(
  runner: ContractRunner | Provider,
  slaAddress: string,
  operator: string,
): Promise<number[]> {
  const sla = slaContract(slaAddress, runner as ContractRunner)
  const ids: bigint[] = await sla.certificatesOf(operator)
  return ids.map(Number)
}

export async function getCertificate(
  runner: ContractRunner | Provider,
  slaAddress: string,
  tokenId: number,
): Promise<SlaCertificate> {
  const sla = slaContract(slaAddress, runner as ContractRunner)
  const record = await sla.certificates(tokenId)

  return {
    tokenId,
    jobId: Number(record.jobId),
    nodeOperator: record.nodeOperator,
    client: record.client,
    issuedAt: Number(record.issuedAt),
    promisedUptimeBps: Number(record.promisedUptimeBps),
    attestationDigest: record.attestationDigest,
    slaMet: record.slaMet,
  }
}

export async function certificateOfJob(
  runner: ContractRunner | Provider,
  slaAddress: string,
  jobId: number,
): Promise<number | null> {
  const tokenId = Number(
    await slaContract(slaAddress, runner as ContractRunner).certificateOfJob(jobId),
  )
  return tokenId === 0 ? null : tokenId
}

/**
 * Decrypt a certificate's manifest.
 *
 * Only succeeds for the operator that owns the token - the URI is stored re-encrypted under the
 * owner's AES key, so anyone else reads the ciphertext and gets nothing out of it.
 */
export async function readManifest(
  signer: CotiSigner,
  slaAddress: string,
  tokenId: number,
): Promise<SlaManifest | null> {
  const sla = slaContract(slaAddress, signer as unknown as ContractRunner)
  const ciphertext = await sla.tokenURI(tokenId)
  const json = (await signer.decryptValue(normalizeCtString(ciphertext))) as string

  return parseManifest(json)
}

export async function totalCertificates(
  runner: ContractRunner | Provider,
  slaAddress: string,
): Promise<number> {
  return Number(await slaContract(slaAddress, runner as ContractRunner).totalSupply())
}
