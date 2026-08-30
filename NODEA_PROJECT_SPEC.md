# Nodea - project specification

**Autonomous encrypted DeAI compute.** AI agents hire GPU nodes, transmit prompts, and settle
micro-payments without publishing a single number an adversary could trade on.

Licence: Apache-2.0 · Author: Ifeanyichukwu Onwo (`mrnetwork`)

---

## The problem

An AI agent that rents inference on a transparent chain leaks its entire operating profile. Its
prompts - the system instructions, retrieved context and reasoning that *are* the product - go on
chain in the clear. Its payments reveal what it pays per token, how fast it burns, which model it
favours, and how much runway it has left. Competitors read that off a block explorer and front-run
it, copy the prompt, and undercut the provider by one wei.

Providers have the mirror problem. A GPU operator cannot publish a rate card without inviting every
rival to price just below it, so the market races to the bottom on price instead of competing on
the reliability buyers actually want.

## The architecture

Two layers, each doing what only it can.

| | Layer | Carries |
| --- | --- | --- |
| **Privacy & settlement** | COTI | Prompt, rate card, budget, cost, payout, refund, balances, SLA arbitration - all garbled ciphertext |
| **Compute** | 0G | The GPU that actually answers, across 27 models |

The split is the product. Compute is a commodity and will always be purchasable somewhere;
confidential settlement is not, and it is the half that makes a compute marketplace bankable rather
than merely functional. The gap between what a node charges on COTI and what it pays for compute is
its margin - and on a transparent chain both legs are visible, so that margin is trivially
computable by a competitor.

## Contracts

| Contract | Role |
| --- | --- |
| `NodeaCompute` | Escrow and SLA arbiter. Prices, judges and splits every job inside garbled circuits. |
| `NodeaCredits` | Confidential settlement asset (`PrivateERC20`). Encrypted balances and transfers. |
| `NodeaSLA` | Soulbound confidential ERC-721 receipts with an encrypted telemetry manifest. |
| `NodeaPromptChannel` | E2EE transport for prompts in and completions back. |

## The privacy boundary

Exactly two bits are declassified, both by a single `MpcCore.decrypt` and both justified in
[`docs/PRIVACY.md`](docs/PRIVACY.md): whether the sealed cost fit the sealed budget, and whether the
node kept the SLA it published. Everything else stays sealed, and no event emitted by any Nodea
contract carries a plaintext amount.

## Reference

- [`README.md`](README.md) - overview and quick start
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - design decisions and the constraints behind them
- [`docs/PRIVACY.md`](docs/PRIVACY.md) - the full threat model, including what is *not* protected
- [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) - what NDC is, and what it becomes
- [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) - a timed demo script
