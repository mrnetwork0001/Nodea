# Architecture

Four contracts, one SDK, two runtimes. The design constraint that shapes everything: a value that
is confidential must never be materialised in plaintext on chain — not in storage, not in an
event, not in a revert string.

## Contracts

```
                    ┌──────────────────────┐
   agent ──────────►│ NodeaPromptChannel   │  COTI PrivateMessaging
   (enc prompt)     │  ctString x3 views   │  network / sender / recipient keys
                    └──────────┬───────────┘
                               │ messageId
                               ▼
  ┌────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
  │ NodeaCredits   │◄─┤   NodeaCompute       ├─►│ NodeaSLA         │
  │ PrivateERC20   │  │   escrow + arbiter   │  │ PrivateERC721    │
  │ enc balances   │  │   garbled circuits   │  │ enc token URI    │
  └────────────────┘  └──────────────────────┘  └──────────────────┘
       transferGT            gtUint256                issue(ctString)
       transferFromGT        MpcCore ops              soulbound
```

### `NodeaCompute` — the escrow and SLA arbiter

Holds the node registry and the job lifecycle. Every confidential quantity is stored as a
`SealedValue`: three ciphertexts of the same number, keyed for the network (so the contract can
re-onboard it later), for the agent, and for the node operator.

```solidity
struct SealedValue {
    ctUint256 network;      // MpcCore.offBoard    — re-onboardable by this contract
    ctUint256 forClient;    // MpcCore.offBoardToUser(value, client)
    ctUint256 forOperator;  // MpcCore.offBoardToUser(value, operator)
}
```

`_seal()` produces all three in one pass. Every viewer-scoped read (`jobCostFor`, `jobPayoutFor`, …)
hands back the copy matching `msg.sender` and reverts with `UnauthorizedViewer` otherwise.

Two design points worth calling out:

**The prompt binding.** `openJob` calls `getMessageMetadata` on the prompt channel and requires
`from == msg.sender && to == node.operator`, then marks the message consumed. An escrow cannot be
attached to a prompt the node was never given, or to the same prompt twice. This is what makes the
messaging integration structural rather than decorative.

**Delivered volume is load-bearing.** `submitProof` compares the node's sealed `deliveredKTokens`
against the sealed `_jobWorkload` recorded at `openJob`. Without it, `encTokensGenerated` would be
a number the node writes into its own certificate with nothing checking it; with it, a node that
bills for 100k tokens and returns 2k gets slashed by the circuit.

### `NodeaCredits` — confidential settlement

Extends COTI `PrivateERC20` at 6 decimals, plus a one-shot open allotment — the amount is identical
for everyone, so claiming it leaks nothing, and every subsequent movement is encrypted.

The allotment is claimable by anyone, which makes NDC a metering unit for compute rather than a
scarce asset: a node operator's earnings are denominated in something any address can mint once.
That is the right trade for an evaluatable demo, and `setFaucetEnabled(false)` closes it whenever
supply should sit under `MINTER_ROLE` alone.

The escrow moves value with `transferFromGT` / `transferGT`, which take an already-garbled
`gtUint256`. That is what lets `NodeaCompute` compute a cost inside the circuit and settle it
without ever wrapping it back into an input text — no plaintext round trip.

### `NodeaSLA` — confidential receipts

Extends COTI `PrivateERC721URIStorage`. Soulbound: `_update` reverts on any transfer between two
non-zero addresses, because reputation that can be sold is not reputation.

`issue()` takes a `gtString` — a garbled *handle*, still in circuit — and both alternatives are
ruled out by measurement rather than taste:

- An `itString` cannot be forwarded between contracts. Its signature is bound to the original
  `(signer, contract, selector)` triple, so re-submitting it in `NodeaSLA` fails on all three.
- A `ctString` sealed with `MpcCore.offBoard` is **scoped to the contract that produced it**.
  Re-onboarding one elsewhere reverts.

That second point cost a mainnet deployment to discover. `contracts/probe/MpcHopProbe.sol` is the
diagnostic that settled it, and its result is worth stating plainly because it is not in COTI's
documentation:

| Hop across a contract boundary | Result |
| --- | --- |
| `gtUint256` garbled handle | works |
| `gtString` garbled handle | works |
| `ctString` from `MpcCore.offBoard` | **reverts** |

So garbled handles travel and sealed ciphertext does not. The manifest stays in circuit for the
hop and is sealed only once it reaches the key it is meant for — which is also cheaper, saving an
offboard per 8-byte cell.

### `NodeaPromptChannel` — E2EE transport

A thin subclass of COTI's `PrivateMessaging` with a one-hour reward epoch. Message size is capped
by the base contract at 64 chunks x 3 cells x 8 bytes = 1,536 bytes.

## SDK — `src/lib/nodea/`

One module per COTI skill, all written against a single `CotiSigner` interface that both COTI
signer flavours satisfy: `Wallet` (private key — used by the agent runtime, node daemon and
scripts) and `JsonRpcSigner` (browser wallet — used by the dashboard). The same call path serves
both, so nothing is demo-only.

| Module | Responsibility |
| --- | --- |
| `account.ts` | Wallet construction, `AccountOnboard` AES derivation, browser key cache |
| `messaging.ts` | Prompt chunking, sealing, sending, decrypting |
| `credits.ts` | Faucet, encrypted approve/transfer, local balance decryption |
| `compute.ts` | Node registry, job lifecycle, sealed-amount decryption |
| `sla.ts` | Certificate reads and manifest decryption |
| `contracts.ts` | Contract binding and ciphertext normalisation at the ethers boundary |
| `reputation.ts` | Ranking a fleet you cannot price |
| `abi.ts` | Generated from Hardhat artifacts by `npm run compile` |

### The chunking problem

COTI packs a string into 8-byte `ctUint64` cells, and `PrivateMessaging` caps a chunk at 3 cells.
So a prompt must be split into 24-byte pieces — but the naive split is wrong. Chunks are decrypted
*independently* on the way out, so slicing UTF-8 at a fixed 24-byte stride cuts multi-byte
characters in half and the halves come back as replacement characters. `chunkPrompt` splits on
code-point boundaries instead, which keeps every chunk individually valid UTF-8 and makes the round
trip lossless for any input. `test/nodea.test.ts` pins this with CJK, Cyrillic, accented Latin and
emoji.

## Runtimes

**`agent/run.ts`** — surveys the public fleet, ranks it on reliability evidence (it cannot see
prices), seals a prompt for the winner, escrows an encrypted fee, waits for settlement, and
decrypts its own copy of the result.

**`agent/node-daemon.ts`** — polls for escrowed jobs on its nodes, decrypts each prompt with its
own AES key, runs inference, and submits sealed proof. `--degrade` makes it under-deliver so the
in-circuit slashing is visible end to end.

`agent/inference.ts` is the seam where a real operator plugs in vLLM, TGI, or any
OpenAI-compatible endpoint via `NODEA_INFERENCE_URL`.

## Gas on COTI

`eth_estimateGas` is not reliable for MPC code, and `src/lib/nodea/gas.ts` exists because of it.
During estimation the precompile short-circuits — `decrypt` always returns `1`, so any branch
gated on a decrypted value takes the cheap path — and real execution then follows a more
expensive one.

Measured on mainnet: `claimFaucet` estimated at 624,754 and used 679,471. Only 9% short, but
ethers uses the estimate as the limit with no buffer, so the transaction ran out of gas and burned
the fee for nothing. Every MPC-touching call therefore carries a generous fixed `gasLimit`. Unused
gas is refunded, and COTI's block limit is 120,000,000, so over-setting costs nothing.

## Reading empty ciphertext

An account that has never held credits has all-zero ciphertext in storage. Decrypting that does
**not** yield zero — `decryptUint256` has no short-circuit for it and returns a garbage 70-digit
number. Every read of a possibly-unset sealed value checks `isZeroCtUint256` first, which is what
makes a fresh operator's balance render as `0` rather than nonsense.

## Build notes

- **Solidity 0.8.28, `evmVersion: paris`.** COTI executes at the Paris fork level; PUSH0 and
  transient storage are unavailable.
- **Stack depth.** `submitProof` originally exceeded the EVM stack; it is split into `_judge`,
  `_settle` and `_issueCertificate` rather than compiled with `viaIR`, which keeps build times and
  generated bytecode predictable.
- **Deployed sizes.** NodeaCompute 14.3 KB, NodeaCredits 13.6 KB, NodeaPromptChannel 9.5 KB,
  NodeaSLA 7.1 KB — all comfortably inside the 24,576-byte limit.
- **Two tsconfigs.** Next.js needs `moduleResolution: bundler`; Hardhat's ts-node needs CommonJS.
  `tsconfig.hardhat.json` serves the contracts pipeline, scripts, tests and agent runtime.
