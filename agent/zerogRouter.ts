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

  const response = await fetch(`${routerBaseUrl()}${anthropic ? "/messages" : "/chat/completions"}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(
      anthropic
        ? {
            model,
            // Required by the Anthropic format, unlike OpenAI's where it is optional.
            max_tokens: maxTokens ?? 1_024,
            messages: [{ role: "user", content: prompt }],
          }
        : {
            model,
            messages: [{ role: "user", content: prompt }],
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

  const body = (await response.json()) as {
    model?: string
    // OpenAI shape
    choices?: Array<{ message?: { content?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      input_tokens?: number
      output_tokens?: number
    }
    // Anthropic shape
    content?: Array<{ type?: string; text?: string }>
  }

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
