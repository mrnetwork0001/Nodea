/**
 * List every model the 0G Router serves as a Nodea node.
 *
 *   npm run fleet            register anything not already listed
 *   npm run fleet -- --dry   show the plan without sending
 *
 * Two things this script is careful about.
 *
 * **Only chat models.** The Router also serves speech-to-text, image and video. A Nodea node
 * advertises a model in the SLA certificate it mints, and the resolver refuses to answer a text
 * prompt from a non-chat model, so listing those would be a claim the node could never honour.
 *
 * **Rate cards derived from real cost.** Each node's confidential price is what that model
 * actually costs on the Router plus a margin, rather than a number invented for a demo. That makes
 * the operator's economics real - and the gap between what a node charges on COTI and what it pays
 * 0G is precisely the margin Nodea keeps confidential. On a transparent chain both legs are
 * visible and it is trivially computable.
 */
import { listRouterModels, routerBaseUrl } from "../agent/zerogRouter"
import { loadDeployment } from "../src/lib/nodea/deployments"
import { formatCredits } from "../src/lib/nodea/config"
import * as compute from "../src/lib/nodea/compute"
import { explorer, header, networkKey, prepare } from "./_identities"

/** The node's markup over its own compute cost: infrastructure, risk, and profit. */
const MARGIN = 3

/** Never price a token at zero, however cheap the underlying model is. */
const MIN_PRICE = 1n

interface RouterPricing {
  id: string
  type?: string
  completionNeuron: bigint
  contextLength?: number
}

/** The catalog with pricing, which `listRouterModels` deliberately does not carry. */
async function pricedModels(): Promise<RouterPricing[]> {
  const response = await fetch(`${routerBaseUrl()}/models`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`0G Router returned ${response.status} listing models`)

  const body = (await response.json()) as {
    data?: Array<{
      id: string
      type?: string
      context_length?: number
      pricing?: { completion?: string; prompt?: string }
    }>
  }

  return (body.data ?? []).map((model) => ({
    id: model.id,
    type: model.type,
    contextLength: model.context_length,
    completionNeuron: BigInt(model.pricing?.completion ?? "0"),
  }))
}

/**
 * NDC per token: the Router's own completion price, converted from neuron, times the margin.
 *
 * 1 neuron is 1e-18 0G and NDC carries 6 decimals, so the conversion divides by 1e12. The spread
 * across the catalog is roughly fifty-fold, which is what gives an agent a real choice to make.
 */
function priceFor(model: RouterPricing): bigint {
  const perToken = (model.completionNeuron * BigInt(MARGIN)) / 1_000_000_000_000n
  return perToken > MIN_PRICE ? perToken : MIN_PRICE
}

/**
 * Hardware and commitments, derived from where a model sits in the price range.
 *
 * A frontier model is larger, slower to first token and runs on better silicon; a flash model is
 * the reverse. Deriving the listing from price keeps the fleet internally consistent instead of
 * pairing an expensive model with a claim it could not meet.
 */
function tierFor(price: bigint, cheapest: bigint, dearest: bigint) {
  const span = dearest > cheapest ? dearest - cheapest : 1n
  const position = Number(((price - cheapest) * 100n) / span) / 100

  if (position > 0.55) {
    return { gpuClass: "H100-80GB-SXM", promisedLatencyMs: 12_000, promisedUptimeBps: 9_950 }
  }
  if (position > 0.15) {
    return { gpuClass: "A100-80GB", promisedLatencyMs: 8_000, promisedUptimeBps: 9_900 }
  }
  return { gpuClass: "L40S-48GB", promisedLatencyMs: 6_000, promisedUptimeBps: 9_700 }
}

const REGIONS = ["eu-central", "us-east", "ap-southeast", "us-west", "eu-west"] as const

async function main() {
  const dryRun = process.argv.includes("--dry")
  const deployment = loadDeployment(networkKey())

  header("Nodea fleet - listing 0G Router models as nodes")
  const operator = await prepare("operator")

  const catalog = await pricedModels()
  const chat = catalog.filter((model) => model.type === "chatbot" && model.completionNeuron > 0n)

  console.log(`\n  ${catalog.length} models on the Router, ${chat.length} chat-capable and priced`)
  console.log(`  ${catalog.length - chat.length} skipped (speech, image, video, or unpriced)\n`)

  const listed = new Set(
    (await compute.listNodes(operator, deployment.compute))
      .filter((node) => node.active)
      .map((node) => node.modelId.toLowerCase()),
  )

  const prices = chat.map(priceFor)
  const cheapest = prices.reduce((a, b) => (a < b ? a : b))
  const dearest = prices.reduce((a, b) => (a > b ? a : b))

  const pending = chat.filter((model) => !listed.has(model.id.toLowerCase()))
  console.log(`  ${listed.size} already listed and active, ${pending.length} to register\n`)

  if (pending.length === 0) {
    console.log(`  Nothing to do.\n`)
    return
  }

  let index = 0
  for (const model of pending) {
    const price = priceFor(model)
    const tier = tierFor(price, cheapest, dearest)
    const region = REGIONS[index % REGIONS.length]
    index += 1

    const perThousand = formatCredits(price * 1000n)
    console.log(`  ${model.id}`)
    console.log(
      `     ${tier.gpuClass} · ${region} · ${tier.promisedUptimeBps / 100}% · <${tier.promisedLatencyMs}ms`,
    )
    console.log(
      `     ${formatCredits(price)} NDC/token (${perThousand} per 1k) - ` +
        `${Number(model.completionNeuron) / 1e18} 0G cost x${MARGIN}`,
    )

    if (dryRun) {
      console.log()
      continue
    }

    const { nodeId, txHash } = await compute.registerNode(operator, deployment.compute, {
      modelId: model.id,
      gpuClass: tier.gpuClass,
      region,
      promisedUptimeBps: tier.promisedUptimeBps,
      promisedLatencyMs: tier.promisedLatencyMs,
      pricePerToken: price,
    })
    console.log(`     node #${nodeId}  ${explorer(txHash)}\n`)
  }

  if (dryRun) {
    console.log(`  --dry: nothing registered.\n`)
    return
  }

  const active = (await compute.listNodes(operator, deployment.compute)).filter((node) => node.active)
  console.log(`  active fleet: ${active.length} nodes\n`)
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
