# Nodea - complete project brief

*A self-contained reference. Everything here was verified against the live mainnet deployment and
the source tree on 2026-08-31. Paste the whole file into an assistant, then ask for whatever you
need built from it - pitch copy, a video script, an FAQ, a technical explainer, submission text.*

**Read the "Do not get these wrong" section at the bottom before generating anything.** Several
plausible-sounding claims about this project are false, and they are listed there.

---

## 1. The one-liner

**Nodea is an autonomous encrypted DeAI compute marketplace.** AI agents hire GPU nodes, transmit
prompts, and settle micro-payments on a public blockchain without publishing a single number an
adversary could trade on.

Longer version: it is a two-layer system. COTI carries privacy and settlement - the prompt, the
rate card, the budget, the amount paid, and the SLA measurements are all garbled ciphertext. 0G
carries the compute - the GPU that actually answers. An agent pays a node for real inference, and
neither the chain nor any observer learns what was asked, what it cost, or what the node earned.

It is live on COTI mainnet. Licence Apache-2.0.

---

## 2. The problem it solves

**For the buyer (an AI agent).** An agent that rents inference on a transparent chain leaks its
entire operating profile. Its prompts - the system instructions, retrieved context, and reasoning
that *are* the product - go on chain in the clear. Its payments reveal what it pays per token, how
many tokens it burns, which model it favours, and how much runway it has left. A competitor reads
that off a block explorer, copies the prompt, front-runs the strategy, and undercuts by one wei.

**For the seller (a GPU operator).** The mirror problem. An operator cannot publish a rate card
without inviting every rival to price just below it. The market then races to the bottom on price
instead of competing on the reliability buyers actually want.

**The deeper point.** Both problems have the same shape: the numbers are public when only the
facts need to be. Nodea moves the numbers into garbled circuits and leaves the facts on chain.

---

## 3. What is public and what is sealed

This table is the heart of the product. It is enforced by contract code, not policy.

| The chain publishes | The chain never sees |
| --- | --- |
| That a job happened, between which two addresses | The prompt, its instructions and context |
| The node's model, GPU class, region, SLA commitment | The node's price per token |
| Whether the node met that commitment | The agent's budget and ordered workload |
| Job state and timestamps (escrowed / settled / refunded) | The cost, the payout, the refund |
| That an SLA certificate was minted | Both parties' NDC balances |
| | The node's telemetry manifest (uptime, latency, tokens) |

Two enforcement layers back this. The **MPC layer** means an unentitled party holds bytes it has no
key for. The **contract layer** means it usually cannot even fetch those bytes - `jobCostFor`,
`jobPayoutFor`, `jobRefundFor`, `jobWorkloadFor`, `jobDeliveredFor` and `nodePriceForOperator` all
revert with `UnauthorizedViewer` for anyone who is not a counterparty.

**No event emitted by any Nodea contract carries a plaintext amount.**

Nodea does **not** claim anonymity. The transaction graph is visible: an observer who watches one
agent hire one node repeatedly learns the relationship, just not its terms.

---

## 4. The two declassified bits

Exactly two boolean values are deliberately decrypted on chain. Both are single
`MpcCore.decrypt(gtBool)` calls, both are named in the contract, and both are load-bearing.

**Bit 1 - affordability**, in `openJob`:

```solidity
if (!MpcCore.decrypt(MpcCore.le(gtCost, MpcCore.validateCiphertext(encMaxBudget)))) {
    revert BudgetExceeded();
}
```

This discloses nothing new. The transaction either succeeds or reverts, and an observer learns the
same single bit from that outcome either way. It reveals *whether* the cost fit the budget, never
what either number was.

**Bit 2 - the SLA verdict**, in `submitProof`:

```solidity
gtBool gtMet = _judge(...);       // uptime >= promise && latency <= promise && delivered >= ordered
slaMet = MpcCore.decrypt(gtMet);  // published, because reputation must be legible
_settle(jobId, gtMet);            // payout selected with mux, still sealed
```

This one is a genuine disclosure and a deliberate choice: a confidential compute marketplace where
reliability cannot be verified is a marketplace nobody can safely buy in. So the **verdict** is
public and the **measurements** are not. An observer learns that node #3 kept its promise on job
#41 - never what the workload was, how many tokens it produced, or what it was paid.

Note that `_settle` receives the still-encrypted `gtMet`, not the decrypted boolean. The payout is
selected inside the circuit with `mux`, and **both transfer legs always execute** - so a breached
job and a clean one leave an identical on-chain footprint, differing only in sealed amounts.

---

## 5. Architecture - four contracts

All Solidity 0.8.28, `evmVersion: paris` (COTI executes at the Paris fork level, so PUSH0 and
transient storage are unavailable). All comfortably inside the 24,576-byte limit.

### NodeaCompute (14.3 KB) - escrow and SLA arbiter

Holds the node registry and the job lifecycle. Every confidential quantity is stored as a
`SealedValue`: three ciphertexts of the same number.

```solidity
struct SealedValue {
    ctUint256 network;      // MpcCore.offBoard      - re-onboardable by this contract
    ctUint256 forClient;    // MpcCore.offBoardToUser(value, client)
    ctUint256 forOperator;  // MpcCore.offBoardToUser(value, operator)
}
```

Two design points worth calling out:

- **The prompt binding.** `openJob` calls `getMessageMetadata` on the prompt channel and requires
  `from == msg.sender && to == node.operator`, then marks the message consumed. An escrow cannot be
  attached to a prompt the node was never given, or to the same prompt twice. This is what makes
  the messaging integration structural rather than decorative.
- **Delivered volume is load-bearing.** `submitProof` compares the node's sealed delivered tokens
  against the sealed workload recorded at `openJob`. Without that comparison, tokens-generated
  would be a number the node writes into its own certificate with nothing checking it. With it, a
  node that bills for 100k tokens and returns 2k gets slashed by the circuit.

### NodeaCredits (13.6 KB) - confidential settlement

Extends COTI `PrivateERC20` at 6 decimals. The settlement asset is **NDC**. Balances, allowances
and transfers are all encrypted. A one-shot open allotment of 500 NDC is claimable by any address
once - the amount is identical for everyone, so claiming it leaks nothing.

The escrow moves value with `transferFromGT` / `transferGT`, which take an already-garbled
`gtUint256`. That is what lets NodeaCompute compute a cost inside the circuit and settle it without
ever wrapping it back into an input text - no plaintext round trip.

### NodeaSLA (7.1 KB) - confidential receipts

Extends COTI `PrivateERC721URIStorage`. **Soulbound**: `_update` reverts on any transfer between
two non-zero addresses, because reputation that can be sold is not reputation. Each certificate
carries an encrypted telemetry manifest readable only by the operator that owns it.

### NodeaPromptChannel (9.5 KB) - E2EE transport

A thin subclass of COTI's `PrivateMessaging` with a one-hour reward epoch. Prompts are stored as
`ctString` in three separately keyed views (network / sender / recipient). Message size is capped by
the base contract at 64 chunks x 3 cells x 8 bytes = **1,536 bytes**.

---

## 6. How a job runs, end to end

```
node     registerNode(model, gpu, region, promises, enc(price per token))
agent    promptChannel.sendMessage(node, enc(prompt))          -> messageId
agent    credits.approve(escrow, enc(maxBudget))
agent    openJob(nodeId, enc(tokens), enc(maxBudget), messageId, deadline)
           |- cost = sealed(price) x sealed(tokens)              garbled circuit
           |- require cost <= sealed(budget)                     declassified bit 1
           `- escrow cost, agent -> contract                     encrypted transfer
node     sendMessage(agent, enc(completion))                     the answer, sealed for the agent
node     submitProof(jobId, enc(tokens), enc(uptime), enc(latency), digest, enc(manifest))
           |- slaMet = uptime >= promise
           |         && latency <= promise
           |         && delivered >= ordered                     declassified bit 2
           |- payout = mux(slaMet, cost x 60%, cost)             never revealed
           `- mint confidential SLA certificate to the node
```

**The agent pays a price it never learns.** It surveys the fleet, ranks nodes on public reliability
evidence, and commits a sealed budget. The cost is computed inside the circuit from two sealed
numbers. The agent discovers what it paid only by decrypting its own copy afterwards.

**The node is paid an amount it discovers the same way.** The escrow is conserved: payout plus
refund always equals cost, and none of the three figures exists in plaintext anywhere on chain.

A breaching node forfeits 40% of the job's payment (`mux` selects `cost x 60%`).

### The return leg

The prompt goes in over NodeaPromptChannel; the completion comes back over the same channel, sealed
for the agent alone. That symmetry is the product - everything else in the protocol exists to make
paying for that answer safe.

The result carries a compact envelope, `NODEA2|<jobId>|<part>|<parts>|<backend>|<model>|<text>`,
because a pipe-delimited header costs fewer bytes than JSON and every framing byte is a byte of
answer that does not fit in 1,536. Longer completions split across messages rather than truncate,
and the agent reassembles by scanning its own inbox. The envelope is versioned, and the previous
format is still parsed on read.

The envelope carrying the backend and model that actually served the job is deliberate: which
backend a node uses is the operator's own business and can change between jobs, so it is a fact
about *that answer*, attested by the node that produced it, not a marketplace-level claim. Only the
agent that paid learns where its work ran.

---

## 7. Live mainnet state

Verified on 2026-08-31 by reading the contracts directly.

| Contract | Address |
| --- | --- |
| NodeaCompute | `0xD057081D016766D55BeA5bD25c8ca1C7865EfC1d` |
| NodeaCredits | `0x4d61f8BB478e257E241E47A45A8F46B4a47f1876` |
| NodeaSLA | `0xDfBd2961aAF90650fE3eF36c6fDB33Ce6bdc28c4` |
| NodeaPromptChannel | `0xDe0f81161C2E54df2Ce627333153ae43eFA89C0b` |

Explorer: `https://mainnet.cotiscan.io/address/<address>`

| Metric | Value |
| --- | --- |
| Nodes registered | 34 |
| Nodes active | 27 |
| Jobs opened | 11 |
| Jobs settled | 10 |
| Jobs refunded after expiry | 1 |
| Settled jobs where the SLA was met | 8 of 10 |
| Settled jobs slashed | 2 (deliberate under-delivery runs that exercise the circuit) |

**COTI Mainnet**: chain ID 2632500, RPC `https://mainnet.coti.io/rpc`, ~5s blocks, 120,000,000
block gas limit. COTI Testnet is chain ID 7082400. `AccountOnboard` lives at
`0x536A67f0cc46513E7d27a370ed1aF9FDcC7A5095` on both.

Deploying all four contracts costs roughly **0.02 COTI** at 2 gwei.

---

## 8. The compute layer

Nodea is a privacy and settlement layer, not a model host, so the GPU underneath is pluggable:

| Backend | Enabled by | What it is |
| --- | --- | --- |
| **0G Router** (in use) | `ZEROG_ROUTER_KEY` | One unified balance, OpenAI-compatible |
| 0G broker | `ZEROG_PRIVATE_KEY` | Per-provider ledger, 3 0G minimum to open one |
| HTTP | `NODEA_INFERENCE_URL` | Any OpenAI-compatible endpoint (vLLM, TGI, hosted) |
| local | none | Deterministic stand-in, runs offline with no keys |

**The 0G Router catalog, verified live on 2026-08-31: 31 models total - 27 chatbot, 2
video-generation, 1 speech-to-text, 1 text-to-image.**

`npm run fleet` registers every chat-capable Router model as a Nodea node. It is careful about two
things:

- **Only `chatbot` models are listed.** A node advertises its model inside the certificate it mints,
  so listing a video or speech model would be a claim it could never honour.
- **Each rate card is derived from real cost** - the model's own Router price times a margin -
  rather than invented. Prices span roughly a hundredfold, from `0gm-1.0-35b-a3b` at ~0.000008
  NDC/token to `claude-fable-5` at ~0.000801, which gives an agent a real choice to make. Hardware
  class, region and SLA promises are derived from where a model sits in that range, so a frontier
  model is not paired with a latency claim it could not meet.

Models currently listed as nodes include the GLM, Qwen, DeepSeek, Kimi, MiniMax, GPT, Claude and
0GM families.

**Four Router chat models are Anthropic-format only** - `claude-fable-5`, `claude-opus-4-8`,
`claude-opus-5`, `claude-sonnet-5` - and reject `/v1/chat/completions` outright. The catalog
declares this in `supported_formats`, so Nodea's Router client reads it and speaks whichever wire
format the model accepts: `max_tokens` required rather than optional, a content-block array rather
than a choices array, different usage field names. Reading the catalog is what keeps the strongest
models in the fleet instead of quietly dropping them.

**Why the two-layer split matters economically.** The 0G account belongs to the **node operator**,
not the agent. An agent hires a node and pays in encrypted NDC without ever learning what the node
spent on GPU. So the operator's margin - the gap between what it charges on COTI and what compute
cost it - stays as confidential as the prompt did. On a fully transparent chain both legs are
visible and that margin is trivially computable.

---

## 9. NDC - the credit, and what it becomes

**Today NDC is a metering unit and nothing more.** Anyone can mint 500 for the price of gas. That
is deliberate: the live mainnet deployment can be evaluated without waiting on anyone to distribute
tokens.

The demand is already structural - **you cannot hire compute on Nodea without holding NDC.** What
is missing is scarcity, and that is a switch already deployed but not yet thrown:
`setFaucetEnabled(false)`, admin-only, one transaction. Calling it stops free minting, leaves
existing balances untouched, and puts supply under `MINTER_ROLE` alone.

**The plan, stated plainly: after the current evaluation period, a real token launches with
liquidity, serving exactly the role NDC serves now** - the unit every job is priced and settled in.
Same function, same contracts, real supply.

**How a confidential credit trades on a public market.** The obvious objection is that an AMM must
read balances. It does not have to read *these* balances. COTI ships `PrivacyBridgeERC20` for
exactly this shape - a public ERC-20 bridged one-to-one into its private counterpart on COTI. The
same pattern already backs `PrivacyBridgeUSDCe`, `PrivacyBridgeWETH` and `PrivacyBridgegCoti`. So
the launch is two faces of one asset: a public ERC-20 for price discovery and liquidity, and the
deployed private NDC for hiring compute. Bridge in to spend, bridge out to trade. The market is
public; the per-job amounts are not.

**Where value would accrue**, in order of weight:

1. **Node staking against SLA breaches.** A node locks NDC to register; a breach slashes part of
   that stake. This repairs a real weakness in what exists today: forfeiting 40% of one job's
   payment is a weak deterrent for an operator that has over-promised. It also removes supply from
   circulation - every active node holds NDC it cannot spend.
2. **A protocol fee on settled jobs**, on the order of 1%, charged inside the garbled circuit
   alongside the existing payout/refund split, so it inherits the same confidentiality. It scales
   with genuine usage rather than speculation.
3. **Metering demand.** Once the faucet closes, the only way to get NDC is to acquire it.

---

## 10. Technology stack

- **Contracts**: Solidity 0.8.28, Hardhat, `@coti-io/coti-contracts`, OpenZeppelin
- **SDK**: TypeScript, one module per COTI privacy skill, written against a single `CotiSigner`
  interface that both COTI signer flavours satisfy - `Wallet` (private key, used by the agent
  runtime, node daemon and scripts) and `JsonRpcSigner` (browser wallet, used by the console). The
  same call path serves both, so nothing is demo-only.
- **Console**: Next.js 14 App Router, React, Tailwind, Zustand, framer-motion, `@coti-io/coti-ethers`
- **Runtimes**: an autonomous agent (`agent/run.ts`) and a GPU node daemon (`agent/node-daemon.ts`),
  two independent processes that talk only through encrypted on-chain messages
- **Compute**: 0G Compute Network via its Router

### The five COTI privacy skills, and where each one lives

| Skill | Where | What it does here |
| --- | --- | --- |
| `coti-account-setup` | `src/lib/nodea/account.ts` | Derives each participant's AES key through `AccountOnboard`. Without it an account can move value but cannot read its own balances. |
| `coti-private-messaging` | `NodeaPromptChannel.sol`, `messaging.ts` | Prompts sealed for one specific node, stored as `ctString` in three separately keyed views. |
| `coti-private-erc20` | `NodeaCredits.sol`, `credits.ts` | NDC settlement: encrypted balances, allowances and transfers. |
| `coti-private-nft` | `NodeaSLA.sol`, `sla.ts` | Soulbound confidential ERC-721 receipts with an encrypted telemetry manifest. |
| `coti-smart-contracts` | `NodeaCompute.sol`, `compute.ts` | The escrow: prices, judges and splits every job inside MPC. |

---

## 11. The console - two signer modes, and why

| Mode | Identity | Sealing a prompt |
| --- | --- | --- |
| **Agent** (default) | A key generated or imported into the browser | Signed locally, **no popups** |
| **Wallet** | MetaMask | One `personal_sign` per 8-byte cell |

Agent mode is **not** a workaround for the popup problem. Nodea's user *is* an agent - a program
that holds a key and acts on its own - so modelling that in the browser is the honest shape of the
product, and it runs the exact `Wallet` path the CLI and every script already use. Wallet mode
stays because a human should be able to drive it too, and because it demonstrates COTI's
`JsonRpcSigner` path working against a real browser extension.

The browser key is a hot key in `localStorage`, scoped by chain, in the same family as the session
keys agent infrastructure generally uses. The UI says so, and it can be exported or destroyed.

---

## 12. Non-obvious engineering findings

These are the hard-won facts. They are the most credible material in this brief because they could
only have been learned by shipping to mainnet, and several are not in COTI's documentation.

**1. Sealed ciphertext is scoped to the contract that produced it.** A `ctString` from
`MpcCore.offBoard` cannot be re-onboarded in a different contract - it reverts. Garbled *handles*
travel; sealed ciphertext does not. A purpose-built diagnostic contract (`MpcHopProbe.sol`) settled
this by measurement:

| Hop across a contract boundary | Result |
| --- | --- |
| `gtUint256` garbled handle | works |
| `gtString` garbled handle | works |
| `ctString` from `MpcCore.offBoard` | **reverts** |

So `NodeaSLA.issue()` takes a `gtString` - still in circuit - and the manifest is sealed only once
it reaches the key it is meant for. That is also cheaper, saving an offboard per 8-byte cell. This
cost a mainnet deployment to discover.

**2. `eth_estimateGas` is unreliable for MPC code.** During estimation the precompile
short-circuits - `decrypt` always returns `1`, so any branch gated on a decrypted value takes the
cheap path - and real execution then follows a more expensive one. Measured on mainnet:
`claimFaucet` estimated at 624,754 and used 679,471. Only 9% short, but ethers uses the estimate as
the limit with no buffer, so the transaction ran out of gas and burned the fee for nothing. Every
MPC-touching call therefore carries a generous fixed `gasLimit`. Unused gas is refunded and the
block limit is 120,000,000, so over-setting costs nothing.

**3. One wallet signature per 8 bytes.** COTI seals a string one 8-byte cell at a time, and every
cell carries its own input-text signature over `(signer, contract, selector, ciphertext)`. A private
key signs those locally and silently. A browser wallet cannot - `JsonRpcSigner` routes each cell
through `personal_sign`, so **sealing an N-byte prompt costs `ceil(N/8)` MetaMask popups**. A
153-byte prompt is twenty, plus one for the encrypted allowance and two for the sealed workload and
budget. There is no batching to reach for; the signatures are per-ciphertext by construction. The
console therefore states the count before the user commits and counts down while it runs.

**4. Naive UTF-8 chunking corrupts prompts.** COTI packs a string into 8-byte cells and
`PrivateMessaging` caps a chunk at 3 cells, so a prompt splits into 24-byte pieces. Chunks are
decrypted *independently* on the way out, so slicing at a fixed 24-byte stride cuts multi-byte
characters in half and the halves return as replacement characters. Nodea splits on code-point
boundaries instead, which keeps every chunk individually valid UTF-8. Pinned by tests with CJK,
Cyrillic, accented Latin and emoji.

**5. Decrypting all-zero ciphertext returns garbage, not zero.** An account that has never held
credits has all-zero ciphertext in storage. `decryptUint256` has no short-circuit for it and returns
a garbage 70-digit number. Every read of a possibly-unset sealed value checks for this first, which
is what makes a fresh operator's balance render as `0` rather than nonsense.

**6. The workload unit is tokens, and it is a floor.** The escrow multiplies two sealed numbers and
does not know their units, so the convention lives in the SDK - and the first one was wrong. Pricing
per *thousand* tokens floored a good 120-token answer to zero and slashed a node that had done the
work. Per-token pricing with the workload read as a **minimum the agent pays for** is the convention
that survives contact with a real model.

**7. Generation must never be capped at that minimum.** A reasoning model spends its first tokens
thinking and emits nothing visible, so a ceiling set to the floor truncates before any content
arrives - producing a job that settles as SLA MET with an empty answer. The ceiling exists only to
bound GPU spend and sits well above the floor.

**8. The two 0G balances are separate pools.** Depositing on the 0G web UI funds the **Router**, not
the SDK ledger. A node operator can hold thousands of 0G and still watch `addLedger` fail for want
of three. This is the single most confusing thing about integrating 0G Compute.

**9. `mux(bit, a, b)` selects `b` when the bit is true.** Getting that polarity backwards would pay
breaching nodes in full. The contract carries a comment saying so.

**10. Stack depth.** `submitProof` originally exceeded the EVM stack. It is split into `_judge`,
`_settle` and `_issueCertificate` rather than compiled with `viaIR`, which keeps build times and
generated bytecode predictable.

**11. COTI does not serve the `pending` block tag**, which breaks `hardhat-ethers`. Deployment runs
on plain `@coti-io/coti-ethers` instead.

**12. The escrow's 60-second minimum job duration is measured when `openJob` is mined**, and the
prompt and approval transactions land first. Deadlines under about 180 seconds therefore revert. The
SDK refuses early with an explanation rather than passing a bare `InvalidDeadline` through.

---

## 13. Known limits

Stated plainly, because a privacy claim with no stated limits is not a serious one.

- **Trust in the MPC network.** COTI's garbled-circuit soundness rests on the network operator,
  consensus and the precompile implementation. Solidity cannot re-prove it on chain.
- **Metadata and timing.** The transaction graph, timing and gas are visible.
- **Node-side plaintext.** A prompt is decrypted inside the node's process, because that is the only
  way to run inference on it. Nodea makes the transport and settlement confidential; it does not
  make the node itself trustless. Confidential-VM or TEE attestation is the natural next layer, and
  `attestationDigest` is the hook where it would bind in.
- **Self-reported telemetry.** A node reports its own uptime and latency. The circuit checks those
  claims against its public commitments and its delivered volume against what was ordered, and
  slashes on failure - but it cannot independently measure a node. That is an oracle problem, not a
  privacy one.
- **Prompt size.** One on-chain message holds 1,536 bytes. Larger workloads split across jobs.
- **AES key custody.** Derived through `AccountOnboard` and cached in `localStorage`, scoped by
  address and chain. It never reaches a server - there is no Nodea backend - but anyone with access
  to the browser profile has it.
- **NDC is not scarce yet.** See section 9.
- **Permissionless registration.** Anyone can register a node advertising anything, and anyone can
  mint NDC once. Both are deliberate, but it means an unproven node still appears in the fleet.
  Reputation is the only defence today.
- **Untested at scale.** Every job so far has been sequential. Nothing has exercised two agents
  hiring at once, a daemon with a queue, or the console under concurrent load. The daemon polls
  every 6 seconds and serves strictly one job at a time.
- **Single daemon.** All active nodes belong to one operator served by one daemon process. If it
  stops, jobs sit escrowed until reclaimed, and each expiry counts as a permanent public breach
  against the node.

---

## 14. Operations

The console is a static Next.js build requiring **no environment variables** - contract addresses
ship with the build. No private key ever belongs in a hosting environment; the web app does not read
one.

The node daemon runs on the operator's own machine under systemd or Docker, with a dedicated
unprivileged user, hard memory and CPU ceilings, and `ProtectSystem=strict`. It **binds no port** -
it dials out and never listens - so it can share a machine with other services without colliding.
It retries a failing job three times before abandoning it, backs off 30 seconds on an RPC error
rather than exiting, and holds exactly one key: the node operator's.

Two balances have to be watched, because both produce the same failure - jobs stall escrowed and
every node takes a breach. The operator's COTI gas (`submitProof` is the expensive call, roughly
0.005 COTI per settlement) and the 0G Router balance. A keyless cron script watches the first over
public JSON-RPC; 0G exposes no public endpoint for the second.

---

## 15. Glossary

- **COTI V2** - an EVM chain (Geth fork) whose validators run garbled-circuit MPC, exposed to
  Solidity through a precompile and the `MpcCore` library.
- **Garbled circuit** - a cryptographic construction that evaluates a function over encrypted inputs
  without decrypting them.
- **`gtUint256` / `gtString`** - a *garbled handle*: a value live inside the circuit during a
  transaction. Can be passed between contracts.
- **`ctUint256` / `ctString`** - *sealed ciphertext at rest*, in storage. Scoped to the contract that
  produced it.
- **`itUint256` / `itString`** - *input text*: a ciphertext plus a signature binding it to
  `(signer, contract, selector)`. How a user submits a private value.
- **`offBoard` / `offBoardToUser`** - seal a garbled handle under the network key, or under one
  user's AES key.
- **`AccountOnboard`** - the COTI system contract that derives a user's AES key. An RSA keypair is
  generated, two RSA-encrypted shares come back, and XOR-ing them yields the key.
- **`mux(bit, a, b)`** - in-circuit selection. Returns `b` when the bit is true.
- **NDC** - Nodea Compute Credit, the confidential ERC-20 every job is priced and settled in.
- **SLA certificate** - a soulbound confidential ERC-721 minted to a node on settlement, carrying an
  encrypted telemetry manifest.
- **0G Compute Network** - a decentralised GPU marketplace. Its Router is a unified,
  OpenAI-compatible endpoint over many providers.

---

## 16. Do not get these wrong

Common false claims about this project. Every one of these is wrong.

- ❌ "Nodea hides who is transacting." It hides **contents and amounts, not the graph.** Sender and
  recipient addresses are public.
- ❌ "Nodea is trustless end to end." The node decrypts the prompt in its own process to run
  inference. TEE attestation is a *future* layer, not a shipped one.
- ❌ "Nothing is revealed on chain." **Exactly two bits are**, deliberately: affordability and the
  SLA verdict. Both are argued for in section 4. Claiming zero disclosure is both false and weaker
  than the real design.
- ❌ "NDC is a scarce token with a market." It is currently **freely mintable, 500 per address**, by
  design. The real token is stated as a plan, not a fact.
- ❌ "Nodea runs its own GPUs / is a model host." It is a **privacy and settlement layer**. The
  compute is 0G's, and the backend is pluggable.
- ❌ "The SLA is verified by the protocol." The circuit checks self-reported telemetry against public
  commitments and against delivered volume. It **cannot independently measure a node.**
- ❌ "It uses zero-knowledge proofs / FHE." It uses **garbled-circuit MPC** on COTI. Different
  primitive - do not substitute the buzzword.
- ❌ "Agent mode exists because MetaMask popups were annoying." It exists because **Nodea's user is a
  program**. The popup count is a consequence of COTI's per-cell signing, explained honestly in the
  UI, and wallet mode still works.
- ❌ Do not invent metrics. The verified numbers are in section 7. If a number is not in this brief,
  it has not been measured.
- ❌ Do not name any specific competition, event or judging body. Refer to "the current evaluation
  period" or similar if context requires it.

---

## 17. Suggested prompts to use with this brief

- "Write a 90-second demo video script that shows the privacy claim rather than asserting it."
- "Turn section 12 into a technical blog post for developers building on COTI."
- "Draft an FAQ answering the hardest sceptical questions a reviewer would ask."
- "Write the elevator pitch three ways: for a cryptographer, a founder, and a non-technical reader."
- "What is the strongest argument *against* this project, and how would you answer it?"
