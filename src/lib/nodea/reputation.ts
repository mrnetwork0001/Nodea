/**
 * Scoring a node on the only evidence Nodea makes public.
 *
 * Prices are confidential here, so neither the dashboard nor an autonomous agent can rank the
 * fleet by cost. What remains public is the model, the hardware, the SLA a node committed to at
 * registration, and the settled/breached record those commitments produced — and the garbled
 * circuit enforces the buyer's budget against a rate nobody can read.
 *
 * That is a healthier market than a transparent one: an operator's rate cannot be undercut by
 * one wei by a rival reading the ledger, so the competition moves to reliability, which is the
 * thing the buyer wanted in the first place.
 */
import type { NodeListing } from "./types"

/**
 * Reliability with a prior, so a brand-new node is neither blindly trusted nor unhirable.
 *
 * Without the prior, a node with a single clean job scores a perfect 1.0 and outranks an operator
 * with a hundred settlements and two breaches. Two pseudo-jobs pull an unproven node toward the
 * middle and let real history overwhelm the prior as it accumulates.
 */
export function reliability(node: NodeListing): number {
  return (node.jobsSettled + 1) / (node.jobsSettled + node.jobsBreached + 2)
}

/**
 * Composite rank. Promised uptime is cheap talk on its own, so it is weighted below the record
 * that actually backs it; promised latency is normalised against a 2s ceiling and counts least.
 */
export function score(node: NodeListing): number {
  const uptime = node.promisedUptimeBps / 10_000
  const speed = Math.max(0, 1 - node.promisedLatencyMs / 2_000)

  return reliability(node) * 0.55 + uptime * 0.3 + speed * 0.15
}
