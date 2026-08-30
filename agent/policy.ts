/**
 * How a Nodea agent picks a GPU node when it cannot see anyone's prices.
 *
 * The ranking itself lives in the SDK (`src/lib/nodea/reputation`) so the dashboard and the
 * autonomous agent judge the fleet by exactly the same rule; this module adds the filtering an
 * agent applies before ranking.
 */
import { reliability, score } from "../src/lib/nodea/reputation"
import type { NodeListing } from "../src/lib/nodea/types"

export { reliability, score }

export interface SelectionCriteria {
  /** Substring match against the node's advertised model id. */
  model?: string
  region?: string
  /** Reject nodes promising less than this uptime, in basis points. */
  minUptimeBps?: number
  /** Reject nodes promising slower time-to-first-token than this. */
  maxLatencyMs?: number
}

export interface ScoredNode {
  node: NodeListing
  score: number
  reliability: number
  jobs: number
}

function matches(node: NodeListing, criteria: SelectionCriteria): boolean {
  if (!node.active) return false
  if (criteria.model && !node.modelId.includes(criteria.model)) return false
  if (criteria.region && node.region !== criteria.region) return false
  if (criteria.minUptimeBps && node.promisedUptimeBps < criteria.minUptimeBps) return false
  if (criteria.maxLatencyMs && node.promisedLatencyMs > criteria.maxLatencyMs) return false
  return true
}

export function rankNodes(
  nodes: readonly NodeListing[],
  criteria: SelectionCriteria = {},
): ScoredNode[] {
  return nodes
    .filter((node) => matches(node, criteria))
    .map((node) => ({
      node,
      score: score(node),
      reliability: reliability(node),
      jobs: node.jobsSettled + node.jobsBreached,
    }))
    .sort((a, b) => b.score - a.score)
}

export function selectNode(
  nodes: readonly NodeListing[],
  criteria: SelectionCriteria = {},
): ScoredNode | null {
  return rankNodes(nodes, criteria)[0] ?? null
}
