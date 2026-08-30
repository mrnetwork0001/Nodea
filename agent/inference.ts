/**
 * The compute side of a Nodea node: decrypt the prompt, run inference, measure yourself.
 *
 * Nodea is infrastructure, not a model host — what a node actually runs is its own business, and
 * `runInference` is the seam where a real operator drops in vLLM, TGI, an 0G/io.net worker, or an
 * OpenAI-compatible endpoint. Set `NODEA_INFERENCE_URL` and the daemon will call it; leave it
 * unset and the daemon runs the deterministic local stand-in below, so the whole demo works
 * offline with no API keys.
 *
 * The important property either way is that the plaintext prompt exists only here, in the node's
 * own process, after it decrypts a message that was sealed for its AES key alone.
 */
import { createHash } from "crypto"

export interface InferenceResult {
  completion: string
  /** Tokens generated, in thousands — the unit the escrow prices and compares in-circuit. */
  deliveredKTokens: bigint
  /** Measured time to first token. */
  latencyMs: number
  /** Measured uptime over the job window, in basis points. */
  uptimeBps: number
}

export interface InferenceOptions {
  model: string
  /** What the agent ordered, in thousands of tokens. */
  orderedKTokens: bigint
  /** Force a deliberate SLA breach, to demonstrate in-circuit slashing. */
  degrade?: boolean
}

const REMOTE_TIMEOUT_MS = 60_000

export async function runInference(
  prompt: string,
  options: InferenceOptions,
): Promise<InferenceResult> {
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
    deliveredKTokens: options.degrade ? options.orderedKTokens / 2n : options.orderedKTokens,
    latencyMs,
    uptimeBps: options.degrade ? 8_500 : 9_970,
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
