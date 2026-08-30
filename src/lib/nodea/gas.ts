/**
 * Gas limits for transactions that touch COTI's MPC precompile.
 *
 * `eth_estimateGas` is not reliable for garbled-circuit code, and the reason is visible in COTI's
 * own `MpcCore`: during estimation the precompile short-circuits - `decrypt` always returns `1`,
 * for instance, so `checkOverflow` passes and any branch gated on a decrypted value takes the
 * cheap path. Real execution then follows a different, more expensive path than the one that was
 * measured.
 *
 * Measured on mainnet: `claimFaucet` estimated at 624,754 and actually used 679,471. Only 9%
 * short - and because ethers uses the estimate as the limit with no buffer, the transaction ran
 * out of gas and burned the fee for nothing. The divergence grows with the number of MPC calls
 * and with how much branching depends on a decrypted value, so `submitProof` is far riskier than
 * the faucet.
 *
 * The fix is a generous fixed limit rather than a padded estimate:
 *
 *  - unused gas is refunded, so over-setting the limit costs nothing but the balance that has to
 *    be available up front;
 *  - COTI's block gas limit is 120,000,000, so even the heaviest job is nowhere near the ceiling;
 *  - one fixed number has no estimation round trip and no failure mode of its own, whereas
 *    `estimate * k` still fails whenever `k` was guessed too low for a particular branch.
 */

/**
 * Registry writes, encrypted transfers and approvals: a handful of MPC calls each.
 * Observed usage is under 1M; this leaves an order of magnitude of headroom.
 */
export const MPC_GAS_STANDARD = 12_000_000n

/**
 * Sealing a prompt scales with its length - one MPC validation per 8-byte cell, up to 192 cells
 * for a full-size message.
 */
export const MPC_GAS_MESSAGE = 30_000_000n

/**
 * `submitProof` is the heaviest call in the protocol: four input-text validations, two onboards,
 * five comparisons, a decrypt, the payout arithmetic, nine offboards, two encrypted transfers and
 * the manifest re-encryption for the certificate - roughly forty precompile calls in one
 * transaction, several of them behind a decrypted branch.
 */
export const MPC_GAS_HEAVY = 60_000_000n

/** Transaction overrides for a call that touches the MPC precompile. */
export function mpcGas(limit: bigint = MPC_GAS_STANDARD): { gasLimit: bigint } {
  return { gasLimit: limit }
}
