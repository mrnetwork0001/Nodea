/**
 * The compute side of a Nodea node: decrypt the prompt, run inference, measure yourself.
 *
 * Nodea is a settlement and privacy layer, not a model host, so what a node actually runs is its
 * own business. Four backends, in priority order:
 *
 *   0G Router    `ZEROG_ROUTER_KEY` - one unified balance, 31 models, OpenAI-compatible
 *   0G broker    `ZEROG_PRIVATE_KEY` - per-provider ledger, more control, 3 0G to open
 *   HTTP         `NODEA_INFERENCE_URL` - any OpenAI-compatible endpoint (vLLM, TGI, hosted)
 *   local        none of the above - a deterministic stand-in, so the demo runs with no keys
 *
 * The Router comes first because it is the one most operators will have: depositing on 0G's web
 * UI funds the Router pool, not the SDK ledger, so a node can hold thousands of 0G and still see
 * `addLedger` fail for want of three.
 *
 * 0G is the interesting one, because it makes the architecture literal rather than illustrative:
 * the agent pays the node in encrypted NDC on COTI, and the node redeems that into real GPU time
 * on 0G. Neither the agent nor an observer learns what the node paid, so the node's margin stays
 * as confidential as the prompt did. On a transparent chain both legs would be visible and the
 * margin trivially computable.
 *
 * The property all three share is that the plaintext prompt exists only here, in the node's own
 * process, after it decrypts a message sealed for its AES key alone.
 */
import { createHash } from "crypto"
import {
  connectZeroG,
  isZeroGConfigured,
  runZeroGInference,
  selectService,
  type ZeroGCompletion,
} from "./zerog"
import {
  isRouterConfigured,
  listRouterModels,
  resolveRouterModel,
  runRouterInference,
} from "./zerogRouter"

export interface InferenceResult {
  completion: string
  /** Tokens generated - the unit the escrow prices and compares in-circuit. */
  deliveredTokens: bigint
  /** Measured time to first token. */
  latencyMs: number
  /** Whole-answer time. Reported for the operator, never judged - see `latencyMs`. */
  totalMs?: number
  /** Measured uptime over the job window, in basis points. */
  uptimeBps: number
  /** Which backend produced this, for the daemon's log and the operator's own records. */
  backend: "0g-router" | "0g" | "http" | "local"
  /** Present only for 0G: the provider, model, and whether its TEE signature verified. */
  zeroG?: Pick<ZeroGCompletion, "provider" | "model" | "verified" | "completionTokens">
}

export interface InferenceOptions {
  model: string
  /** The minimum output the agent paid for, in tokens. */
  orderedTokens: bigint
  /** Force a deliberate SLA breach, to demonstrate in-circuit slashing. */
  degrade?: boolean
}

const REMOTE_TIMEOUT_MS = 60_000

/**
 * Headroom above the minimum the agent paid for.
 *
 * The sealed workload is a *floor*, not a quota, so capping generation at it is exactly wrong: a
 * reasoning model spends its first tokens thinking and emits nothing visible, and a cap set to
 * the floor truncates before any content arrives - a job that settles as SLA MET with an empty
 * answer. The ceiling exists only so a node cannot burn unbounded GPU on one job.
 */
const OUTPUT_HEADROOM = 8
const MIN_OUTPUT_CEILING = 1_024

/** Generation ceiling for a job whose paid-for minimum is `ordered` tokens. */
function outputCeiling(ordered: bigint): number {
  return Math.max(MIN_OUTPUT_CEILING, Number(ordered) * OUTPUT_HEADROOM)
}

export async function runInference(
  prompt: string,
  options: InferenceOptions,
): Promise<InferenceResult> {
  if (isRouterConfigured()) return runOnRouter(prompt, options)
  if (isZeroGConfigured()) return runOnZeroG(prompt, options)

  const endpoint = process.env.NODEA_INFERENCE_URL
  const started = Date.now()

  const completion = endpoint
    ? await callRemote(endpoint, prompt, options.model)
    : localCompletion(prompt, options.model)

  const latencyMs = endpoint ? Date.now() - started : simulatedLatency(prompt, options.degrade)

  return {
    completion,
    // A healthy node delivers what was ordered; a degraded one comes up short, which the
    // garbled circuit catches without either party revealing the numbers.
    deliveredTokens: options.degrade ? options.orderedTokens / 2n : options.orderedTokens,
    latencyMs,
    uptimeBps: options.degrade ? 8_500 : 9_970,
    backend: endpoint ? "http" : "local",
  }
}

/**
 * Serve the job through the 0G Compute Router.
 *
 * Delivered volume is exactly what the Router billed, in tokens. No rounding: a thousand-token
 * unit floored a good 120-token answer to zero and slashed a node that had done the work.
 */
async function runOnRouter(prompt: string, options: InferenceOptions): Promise<InferenceResult> {
  const catalog = await listRouterModels()
  const model = resolveRouterModel(options.model, catalog)
  const formats = catalog.find((entry) => entry.id === model)?.formats ?? ["openai"]

  const total = Date.now()
  const result = await runRouterInference(
    prompt,
    model,
    // A degraded node deliberately under-delivers, so the circuit has something to catch.
    options.degrade
      ? Math.max(1, Math.floor(Number(options.orderedTokens) / 2))
      : outputCeiling(options.orderedTokens),
    formats,
  )

  /**
   * The SLA is judged on first-chunk latency, not on how long the whole answer took.
   *
   * Total generation time grows with how much the agent ordered, so measuring that against a
   * fixed `promisedLatencyMs` meant a node passed on a short answer and failed on a long one
   * having done nothing wrong - the more work you bought, the more certain the breach. It cost
   * node 8 a permanent breach on a job it served correctly: 36s of honest generation against an
   * 8s promise, where its first chunk had arrived in under 5.
   *
   * First-chunk latency is a property of the service rather than of the order size, which is the
   * only thing a fixed promise can fairly be held to.
   */
  const latencyMs = result.ttftMs
  const totalMs = Date.now() - total

  return {
    completion: result.content,
    deliveredTokens: BigInt(result.completionTokens),
    latencyMs,
    totalMs,
    // Real measurement is the point of using 0G at all, so uptime is the only figure still
    // self-reported here - see the oracle caveat in docs/PRIVACY.md.
    uptimeBps: options.degrade ? 8_500 : 9_970,
    backend: "0g-router",
    zeroG: {
      provider: "0g-router",
      model: result.model,
      verified: null,
      completionTokens: result.completionTokens,
    },
  }
}

/**
 * Serve the job from 0G Compute.
 *
 * The token budget is derived from what the agent ordered: a job priced for N thousand tokens asks
 * the provider for at most that many, so the node cannot overspend on GPU relative to what it was
 * paid — the one place where the COTI-side economics have to reach into the 0G-side request.
 *
 * Delivered volume is exactly what the provider billed, in tokens. No rounding: a thousand-token
 * unit floored a good 120-token answer to zero and slashed a node that had done the work.
 */
async function runOnZeroG(prompt: string, options: InferenceOptions): Promise<InferenceResult> {
  const { broker } = await connectZeroG()
  const service = await selectService(broker, options.model)

  const started = Date.now()
  const result = await runZeroGInference(
    broker,
    service,
    prompt,
    // A degraded node deliberately under-delivers, so the circuit has something to catch.
    options.degrade
      ? Math.max(1, Math.floor(Number(options.orderedTokens) / 2))
      : outputCeiling(options.orderedTokens),
  )
  const latencyMs = Date.now() - started

  return {
    completion: result.content,
    deliveredTokens: BigInt(result.completionTokens),
    latencyMs,
    // Real measurement is the point of using 0G at all, so uptime is the only figure still
    // self-reported here — see the oracle caveat in docs/PRIVACY.md.
    uptimeBps: options.degrade ? 8_500 : 9_970,
    backend: "0g",
    zeroG: {
      provider: result.provider,
      model: result.model,
      verified: result.verified,
      completionTokens: result.completionTokens,
    },
  }
}

async function callRemote(endpoint: string, prompt: string, model: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.NODEA_INFERENCE_KEY
          ? { authorization: `Bearer ${process.env.NODEA_INFERENCE_KEY}` }
          : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`inference endpoint returned ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      completion?: string
    }
    return body.choices?.[0]?.message?.content ?? body.completion ?? ""
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Deterministic stand-in so the demo is reproducible and needs no external service.
 *
 * It is derived from the prompt, so a node genuinely has to have decrypted the prompt to produce
 * it — which is what makes the attestation digest meaningful rather than decorative.
 */
function localCompletion(prompt: string, model: string): string {
  const digest = createHash("sha256").update(`${model} ${prompt}`).digest("hex")
  return `[${model}] ${digest.slice(0, 32)}`
}

function simulatedLatency(prompt: string, degrade?: boolean): number {
  const jitter = createHash("sha256").update(prompt).digest()[0] % 90
  return degrade ? 1_800 + jitter : 260 + jitter
}
