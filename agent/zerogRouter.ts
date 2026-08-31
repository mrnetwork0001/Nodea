/**
 * 0G Compute Router - the simple way for a node to buy real GPU.
 *
 * 0G exposes its compute network two ways, and they draw on **separate balances**:
 *
 *  - **Router** (`pc.0g.ai`, this module). One unified on-chain pool, an API key, and a single
 *    OpenAI-compatible endpoint. The Router handles provider discovery, billing, authentication
 *    and failover on the node's behalf.
 *  - **SDK / broker** (`zerog.ts`). Per-provider sub-accounts funded through a ledger, with a
 *    3 0G minimum to open one and a signed request per call. More control, more moving parts.
 *
 * Depositing on the Router web UI does *not* fund the ledger, which is the trap: a node operator
 * can hold thousands of 0G and still watch `addLedger` fail for want of three. Nodea therefore
 * prefers the Router when a key is present and falls back to the broker when only a private key
 * is configured.
 */
const ROUTER_URLS = {
  mainnet: "https://router-api.0g.ai/v1",
  testnet: "https://router-api-testnet.integratenetwork.work/v1",
} as const

const REQUEST_TIMEOUT_MS = 120_000

export interface RouterModel {
  id: string
  name?: string
  contextLength?: number
  /**
   * Wire formats the Router accepts for this model.
   *
   * Not every model speaks OpenAI. Four of the catalog's chat models - the Claude family - are
   * Anthropic-only and reject `/v1/chat/completions` outright with a message naming the format
   * they do accept. Reading this off the catalog is what keeps the best models in the fleet
   * instead of quietly dropping them.
   */
  formats: string[]
}

export interface RouterCompletion {
  content: string
  model: string
  promptTokens: number
  completionTokens: number
  /**
   * Milliseconds to the first chunk of the response.
   *
   * This, not total generation time, is what a latency SLA can fairly be judged on. Total time
   * grows with how much the agent ordered, so a node promising 8s would pass on a short answer and
   * fail on a long one having done nothing wrong. First-chunk latency is a property of the service.
   */
  ttftMs: number
}

export function routerBaseUrl(): string {
  if (process.env.ZEROG_ROUTER_URL) return process.env.ZEROG_ROUTER_URL.replace(/\/$/, "")
  return process.env.ZEROG_NETWORK === "testnet" ? ROUTER_URLS.testnet : ROUTER_URLS.mainnet
}

export function isRouterConfigured(): boolean {
  return Boolean(process.env.ZEROG_ROUTER_KEY)
}

/** The catalog is public, so this works before a key exists - useful for `zerog:status`. */
export async function listRouterModels(): Promise<RouterModel[]> {
  const response = await fetch(`${routerBaseUrl()}/models`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`0G Router returned ${response.status} listing models`)
  }

  const body = (await response.json()) as {
    data?: Array<{
      id: string
      name?: string
      context_length?: number
      supported_formats?: string[]
    }>
  }

  return (body.data ?? []).map((model) => ({
    id: model.id,
    name: model.name,
    contextLength: model.context_length,
    formats: model.supported_formats ?? ["openai"],
  }))
}

/**
 * Resolve what a Nodea node advertises to something the Router actually serves.
 *
 * A node registered on COTI as `llama-3.3-70b-instruct` should not quietly answer with a
 * different model - the SLA certificate it mints names the model it claims to run. So an exact
 * id wins, a prefix match is accepted, and anything else is refused with the catalog in the error
 * rather than silently substituted.
 */
export function resolveRouterModel(advertised: string, available: readonly RouterModel[]): string {
  const override = process.env.ZEROG_MODEL
  const wanted = (override ?? advertised).toLowerCase()

  const exact = available.find((model) => model.id.toLowerCase() === wanted)
  if (exact) return exact.id

  const family = wanted.split(/[-/.]/)[0]
  const near = available.find((model) => model.id.toLowerCase().startsWith(family))
  if (near) return near.id

  throw new Error(
    `0G Router does not serve "${override ?? advertised}". Set ZEROG_MODEL to one of: ` +
      `${available.slice(0, 8).map((model) => model.id).join(", ")}…`,
  )
}

/**
 * Run one completion through the Router, billed against the node operator's unified balance.
 *
 * Speaks whichever wire format the model actually accepts. Anthropic's differs from OpenAI's in
 * both directions - `max_tokens` is required rather than optional, the answer arrives as a content
 * block array rather than a choices array, and usage is named differently - so the two paths are
 * kept explicit rather than papered over with optional chaining.
 */
export async function runRouterInference(
  prompt: string,
  model: string,
  maxTokens?: number,
  formats: readonly string[] = ["openai"],
): Promise<RouterCompletion> {
  const key = process.env.ZEROG_ROUTER_KEY
  if (!key) throw new Error("ZEROG_ROUTER_KEY is not set")

  const anthropic = !formats.includes("openai") && formats.includes("anthropic")
  const started = Date.now()

  // Streamed, purely so first-chunk latency can be measured. Both wire formats still report token
  // usage in their terminal event - OpenAI needs to be asked for it, Anthropic sends it anyway -
  // and those counts are what the SLA circuit judges delivered volume on, so losing them is not an
  // option.
  const response = await fetch(`${routerBaseUrl()}${anthropic ? "/messages" : "/chat/completions"}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(
      anthropic
        ? {
            model,
            max_tokens: maxTokens ?? 1_024,
            stream: true,
            messages: [{ role: "user", content: prompt }],
          }
        : {
            model,
            messages: [{ role: "user", content: prompt }],
            stream: true,
            stream_options: { include_usage: true },
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
          },
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text()
    // 401/402 are the two a node operator will actually hit, and they mean different things.
    const hint =
      response.status === 401
        ? " - check ZEROG_ROUTER_KEY, created at https://pc.0g.ai"
        : response.status === 402
          ? " - the Router balance is empty; deposit at https://pc.0g.ai"
          : ""

    throw new Error(`0G Router ${response.status}${hint}: ${detail.slice(0, 200)}`)
  }

  // A model that ignores `stream` and answers in one JSON body still has to work. Falling back
  // keeps a non-streaming model serving rather than failing, at the cost of a latency figure that
  // is really total time - flagged by ttftMs equalling the total.
  if (!(response.headers.get("content-type") ?? "").includes("event-stream")) {
    return { ...parseWhole(await response.json(), model, anthropic), ttftMs: Date.now() - started }
  }

  let ttftMs = 0
  let content = ""
  let promptTokens = 0
  let completionTokens = 0
  let buffer = ""

  const decoder = new TextDecoder()
  for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (ttftMs === 0) ttftMs = Date.now() - started
    buffer += decoder.decode(part, { stream: true })

    // SSE frames arrive split across arbitrary chunk boundaries, so lines are drained only once
    // a newline has actually been seen.
    let newline: number
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line.startsWith("data:")) continue

      const payload = line.slice(5).trim()
      if (payload === "[DONE]") continue

      try {
        const event = JSON.parse(payload)
        if (anthropic) {
          if (event.delta?.text) content += event.delta.text
          const usage = event.usage ?? event.message?.usage
          if (usage?.input_tokens) promptTokens = usage.input_tokens
          if (usage?.output_tokens) completionTokens = usage.output_tokens
        } else {
          const delta = event.choices?.[0]?.delta?.content
          if (delta) content += delta
          if (event.usage?.prompt_tokens) promptTokens = event.usage.prompt_tokens
          if (event.usage?.completion_tokens) completionTokens = event.usage.completion_tokens
        }
      } catch {
        // A frame that will not parse is not worth failing a paid job over.
      }
    }
  }

  return { content, model, promptTokens, completionTokens, ttftMs }
}

/** The non-streaming shape, kept for a model that ignores `stream`. */
function parseWhole(
  body: {
    model?: string
    choices?: Array<{ message?: { content?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      input_tokens?: number
      output_tokens?: number
    }
    content?: Array<{ type?: string; text?: string }>
  },
  model: string,
  anthropic: boolean,
): Omit<RouterCompletion, "ttftMs"> {
  const content = anthropic
    ? (body.content ?? [])
        .filter((block) => block.type === "text" || block.text)
        .map((block) => block.text ?? "")
        .join("")
    : (body.choices?.[0]?.message?.content ?? "")

  return {
    content,
    model: body.model ?? model,
    promptTokens: body.usage?.prompt_tokens ?? body.usage?.input_tokens ?? 0,
    completionTokens: body.usage?.completion_tokens ?? body.usage?.output_tokens ?? 0,
  }
}
