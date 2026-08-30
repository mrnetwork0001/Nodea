# NDC — the compute credit, and what it becomes

**Today, during the COTI Web4 Vibe Code Challenge, NDC is a metering unit and nothing more.**
Anyone can mint 500 of it for the price of gas. That is deliberate: a judge should be able to
evaluate a live mainnet deployment without waiting on us to hand out tokens.

**After the challenge, we launch a real token with liquidity that serves exactly the role NDC
serves now** — the unit every job on Nodea is priced and settled in. Same function, same contracts,
real supply. This document states how, so the plan can be judged on its merits rather than assumed.

---

## What NDC does today

NDC is a COTI `PrivateERC20` deployed at
[`0x4d61f8BB478e257E241E47A45A8F46B4a47f1876`](https://mainnet.cotiscan.io/address/0x4d61f8BB478e257E241E47A45A8F46B4a47f1876).
Every job is priced in it, escrowed in it and settled in it, with **balances and amounts encrypted
end to end**. A real settled job on mainnet moved 10.2 NDC without that figure existing in plaintext
anywhere on chain.

The demand is already structural: **you cannot hire compute on Nodea without holding NDC.** What is
missing is scarcity, and that is a switch we have not yet thrown.

## The switch

`NodeaCredits.setFaucetEnabled(false)` — already deployed, admin-only, one transaction.

Calling it stops free minting. Existing balances are untouched; only new claims are refused, and
supply falls under `MINTER_ROLE` alone. That single call is the line between the demo economy and
the real one.

## How a confidential credit trades on a public market

The obvious objection: if NDC balances are encrypted, how does it list on Bancor, where an AMM has
to read balances?

It does not have to. COTI ships `PrivacyBridgeERC20` for exactly this shape — a **public ERC-20**
bridged one-to-one into its **private counterpart** on COTI. The same pattern already backs
`PrivacyBridgeUSDCe`, `PrivacyBridgeWETH` and `PrivacyBridgegCoti`.

So the launch is two faces of one asset:

| | Where | Visible | Purpose |
| --- | --- | --- | --- |
| **NDC** (public ERC-20) | Bancor, exchanges | Balances public, as an AMM requires | Price discovery, liquidity, acquisition |
| **NDC** (private, deployed) | COTI | Balances and amounts encrypted | Hiring compute inside Nodea |

Bridge in to spend, bridge out to trade. **The market is public; the per-job amounts are not** —
which is precisely the property Nodea exists to provide, and it survives being listed.

## Where value accrues

Three mechanisms, in order of how much each one matters.

### 1. Node staking against SLA breaches — the strongest

A node locks NDC to register, and a breached SLA slashes part of that stake.

This is not a token gimmick bolted onto the protocol; it repairs a real weakness in what is already
built. Today a breaching node forfeits 40% of *that one job's* payment — on a 10.2 NDC job, about
4 NDC. That is a weak deterrent for an operator that has over-promised. With capital at stake, a
public SLA commitment costs something to break, and the reputation record in `NodeaSLA` starts to
carry real weight.

It also removes supply from circulation: every active node is holding NDC it cannot spend.

### 2. A protocol fee on settled jobs

The escrow retains a small share — on the order of 1% — of each settled job. Nodea's first real job
settled 10.2 NDC, so the fee would have been roughly 0.10 NDC.

Small per job, and that is the point: **it scales with genuine usage rather than with speculation.**
It gives the token something to be valued against that a reviewer can actually compute.

The fee is charged inside the garbled circuit alongside the existing payout/refund split, so it
inherits the same confidentiality — the protocol earns without publishing what any single job paid.

### 3. Metering demand

Every job needs NDC, and once the faucet is closed the only way to get it is to acquire it. Demand
scales directly with compute hired on the network.

## Supply

- **Fixed cap at launch**, set on the public ERC-20 rather than minted on demand.
- **The faucet closes**, so post-launch issuance comes from the treasury alone.
- **Staked NDC is locked** for as long as a node is registered.
- The private side is minted only against tokens bridged in, one-to-one — the bridge holds the
  public tokens it has issued private credits for, so the two faces cannot diverge.

## What is deployed, and what is planned

Stated plainly, because a roadmap presented as a product is worth less than an honest roadmap.

| | Status |
| --- | --- |
| NDC as the metering unit for every job | **Live on COTI mainnet** |
| Encrypted balances, allowances and settlement | **Live** |
| Confidential SLA arbitration and the 40% breach slash | **Live** |
| `setFaucetEnabled` to close free minting | **Deployed, not yet called** |
| Public ERC-20 + `PrivacyBridgeERC20` bridge | Planned — COTI primitive, not yet deployed |
| Node staking and slashing | Planned — contract work |
| Protocol fee on settled jobs | Planned — contract work |

Everything in the "live" rows can be verified against the deployment today. Everything below it is
what the first prize's launch support would fund.

## Why this is worth launching

Nodea's demand is not narrative. It is the thing agents already have to do: rent inference. What
COTI adds — and no transparent chain can — is that the rate card, the budget, the settlement amount
and the operator's margin all stay confidential while the market itself stays public and liquid.

That combination is what makes a compute marketplace bankable rather than merely functional, and it
is what the token would be a claim on.
