/**
 * 0G Compute as the GPU behind a Nodea node.
 *
 * Nodea is a settlement and privacy layer, not a model host — so the honest way to demonstrate it
 * is to have nodes redeem their work on a real decentralized compute network rather than simulate
 * it. This module is that backend.
 *
 * The two layers do different jobs, and the split is the point:
 *
 *   COTI  — the agent's prompt, budget, the node's rate card and the settlement amount. Private.
 *   0G    — the actual GPU inference the node buys to fulfil the job. Public, and metered.
 *
 * The **node operator** holds the 0G account, not the agent. That is the correct shape: an agent
 * hires a node and pays it in encrypted NDC without ever learning what the node paid for compute,
 * and the node's margin — the gap between what it charges on COTI and what it spends on 0G — stays
 * as confidential as everything else. On a transparent chain both legs would be visible and the
 * margin trivially computable.
 *
 * Billing on 0G is prepaid: funds sit in a ledger, are sub-allocated per provider, and each request
 * carries signed headers that double as a settlement proof. Nothing here holds the prompt longer
 * than the request that carries it.
 */
import { ethers } from "ethers"
import {
  createZGComputeNetworkBroker,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
} from "@0gfoundation/0g-compute-ts-sdk"

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>

export interface ZeroGNetwork {
  name: string
  chainId: bigint
  rpcUrl: string
}

export const ZEROG_NETWORKS: Record<"mainnet" | "testnet", ZeroGNetwork> = {
  mainnet: { name: "0G Mainnet", chainId: MAINNET_CHAIN_ID, rpcUrl: "https://evmrpc.0g.ai" },
  testnet: { name: "0G Galileo Testnet", chainId: TESTNET_CHAIN_ID, rpcUrl: "https://evmrpc-testnet.0g.ai" },
}

/** 0G's own classification. Nodea serves text generation, so only `chatbot` is usable. */
export const CHAT_SERVICE_TYPE = "chatbot"

export interface ZeroGService {
  provider: string
  serviceType: string
  model: string
  url: string
  /** Price per input token, in neuron (1e-18 0G). */
  inputPrice: bigint
  outputPrice: bigint
  verifiability: string
  teeSignerAcknowledged: boolean
}

export interface ZeroGCompletion {
  content: string
  promptTokens: number
  completionTokens: number
  /** True when the provider is TEE-verifiable and the response signature checked out. */
  verified: boolean | null
  provider: string
  model: string
}

export class ZeroGNotConfiguredError extends Error {
  constructor() {
    super(
      "0G Compute is not configured. Set ZEROG_PRIVATE_KEY (the node operator's 0G wallet) to " +
        "have this node serve jobs with real GPU inference, or leave it unset to use the local " +
        "stand-in.",
    )
    this.name = "ZeroGNotConfiguredError"
  }
}

export class ZeroGLedgerError extends Error {
  constructor(message: string) {
    super(
      `${message}\n\n` +
        `Fund the node's 0G ledger before serving jobs:\n` +
        `  npx tsx scripts/zerog.ts fund 0.1     # deposit 0.1 0G\n` +
        `  npx tsx scripts/zerog.ts status       # ledger balance and providers`,
    )
    this.name = "ZeroGLedgerError"
  }
}

export function zeroGNetwork(): ZeroGNetwork {
  return process.env.ZEROG_NETWORK === "testnet" ? ZEROG_NETWORKS.testnet : ZEROG_NETWORKS.mainnet
}

export function isZeroGConfigured(): boolean {
  return Boolean(process.env.ZEROG_PRIVATE_KEY)
}

/**
 * Build a broker for the node operator's 0G wallet.
 *
 * Deliberately separate from the operator's COTI key: the two chains have independent balances and
 * blast radii, and an operator should be able to fund GPU spend without exposing the key that
 * controls its Nodea earnings.
 */
export async function connectZeroG(): Promise<{ broker: Broker; address: string; network: ZeroGNetwork }> {
  const key = process.env.ZEROG_PRIVATE_KEY
  if (!key) throw new ZeroGNotConfiguredError()

  const network = zeroGNetwork()
  const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(network.rpcUrl))

  return { broker: await createZGComputeNetworkBroker(wallet), address: wallet.address, network }
}

/** Ledger balance in neuron, or null when no ledger exists for this wallet yet. */
export async function ledgerBalance(broker: Broker): Promise<{ total: bigint; locked: bigint } | null> {
  try {
    const ledger = await broker.ledger.getLedger()
    return { total: BigInt(ledger.totalBalance), locked: BigInt(ledger.availableBalance) }
  } catch {
    return null
  }
}

export async function listServices(broker: Broker): Promise<ZeroGService[]> {
  const services = await broker.inference.listService()

  return services.map((service) => ({
    provider: service.provider,
    serviceType: service.serviceType,
    model: service.model,
    url: service.url,
    inputPrice: BigInt(service.inputPrice),
    outputPrice: BigInt(service.outputPrice),
    verifiability: service.verifiability,
    teeSignerAcknowledged: service.teeSignerAcknowledged,
  }))
}

/** Text-generation services only. The registry also carries speech, image and video providers. */
export function chatServices(services: readonly ZeroGService[]): ZeroGService[] {
  return services.filter((service) => service.serviceType === CHAT_SERVICE_TYPE)
}

/**
 * Pick the provider this node will use.
 *
 * An explicit `ZEROG_PROVIDER` wins. Otherwise prefer a service whose model matches what the Nodea
 * node advertises — a node that registered as `llama-3.3-70b-instruct` on COTI should not quietly
 * serve a different model, because the SLA certificate it mints names the model it claims to run.
 *
 * Only `chatbot` services are considered. The registry also lists speech-to-text, text-to-image and
 * video providers, and some of them price output at zero — so a naive "cheapest" sort happily
 * selects Whisper to answer a text prompt.
 */
export async function selectService(
  broker: Broker,
  advertisedModel?: string,
): Promise<ZeroGService> {
  const all = await listServices(broker)
  const services = chatServices(all)

  if (services.length === 0) {
    throw new ZeroGLedgerError(
      all.length === 0
        ? "no inference providers are currently registered on 0G"
        : `0G has ${all.length} providers but none serving \`${CHAT_SERVICE_TYPE}\``,
    )
  }

  const explicit = process.env.ZEROG_PROVIDER
  if (explicit) {
    const match = all.find((s) => s.provider.toLowerCase() === explicit.toLowerCase())
    if (!match) throw new Error(`ZEROG_PROVIDER ${explicit} is not in the 0G service registry`)
    if (match.serviceType !== CHAT_SERVICE_TYPE) {
      throw new Error(
        `ZEROG_PROVIDER ${explicit} serves "${match.serviceType}" (${match.model}), not text generation`,
      )
    }
    return match
  }

  if (advertisedModel) {
    const family = advertisedModel.split(/[-.]/)[0].toLowerCase()
    const byModel = services.find((s) => s.model.toLowerCase().includes(family))
    if (byModel) return byModel
  }

  // Cheapest by output price, which dominates cost for generation workloads.
  return [...services].sort((a, b) => (a.outputPrice < b.outputPrice ? -1 : 1))[0]
}

/** Providers must be acknowledged once per account before their headers are accepted. */
async function ensureAcknowledged(broker: Broker, provider: string): Promise<void> {
  try {
    if (await broker.inference.acknowledged(provider)) return
  } catch {
    // Older deployments do not expose the check; acknowledging again is harmless.
  }
  await broker.inference.acknowledgeProviderSigner(provider)
}

/**
 * Run one inference request against 0G and return the completion with its measured usage.
 *
 * The request headers are single-use and signed — in 0G's model they *are* the settlement proof,
 * which is why they are fetched per call rather than cached.
 */
export async function runZeroGInference(
  broker: Broker,
  service: ZeroGService,
  prompt: string,
  maxTokens?: number,
): Promise<ZeroGCompletion> {
  await ensureAcknowledged(broker, service.provider)

  const { endpoint, model } = await broker.inference.getServiceMetadata(service.provider)
  const headers = await broker.inference.getRequestHeaders(service.provider, prompt)

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers as unknown as Record<string, string>) },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(
      `0G provider ${short(service.provider)} returned ${response.status} ${response.statusText}: ` +
        `${(await response.text()).slice(0, 200)}`,
    )
  }

  const body = (await response.json()) as {
    id?: string
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const content = body.choices?.[0]?.message?.content ?? ""
  const promptTokens = body.usage?.prompt_tokens ?? 0
  const completionTokens = body.usage?.completion_tokens ?? 0

  // Settles the request against the provider and, for TEE-verifiable services, checks the
  // response signature. A failure here is a billing/verification problem, not a bad completion,
  // so it is reported rather than thrown — the node still delivered work it must account for.
  let verified: boolean | null = null
  try {
    const chatID = response.headers.get("ZG-Res-Key") ?? body.id
    verified = await broker.inference.processResponse(
      service.provider,
      chatID ?? undefined,
      JSON.stringify({ prompt_tokens: promptTokens, completion_tokens: completionTokens }),
    )
  } catch (cause) {
    console.warn(`     0G settlement/verification warning: ${(cause as Error).message}`)
  }

  return { content, promptTokens, completionTokens, verified, provider: service.provider, model }
}

/** neuron (1e-18) to a readable 0G amount. */
export function formatOG(neuron: bigint, decimals = 6): string {
  const s = ethers.formatEther(neuron)
  const [whole, frac = ""] = s.split(".")
  return frac ? `${whole}.${frac.slice(0, decimals).replace(/0+$/, "") || "0"}` : whole
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
