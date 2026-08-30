# Nodea

**Autonomous encrypted DeAI compute on COTI.** AI agents hire GPU nodes, transmit prompts, and
settle micro-payments without publishing a single number that an adversary could trade on.

> Built for the [COTI Web4 Vibe Code Challenge: Agent Edition](https://stay.coti.io/vibe-coding).
> Track: Agent Infrastructure. Licence: Apache-2.0.

---

## The problem

An AI agent that rents inference on a transparent chain leaks its entire operating profile.
Its prompts — the system instructions, retrieved context, and reasoning that *are* the product —
go on chain in the clear. Its payments reveal what it pays per thousand tokens, how many tokens it
burns, which model it favours, and how much runway it has left. Competitors read that off a block
explorer and front-run it, copy the prompt, and undercut the provider by one wei.

Providers have the mirror problem. A GPU operator cannot publish a rate card without inviting
every rival to price just below it, so the market races to the bottom on price instead of
competing on the reliability buyers actually want.

## What Nodea does

Nodea moves the *numbers* into COTI's garbled circuits and leaves only the *facts* on chain.

| The chain publishes | The chain never sees |
| --- | --- |
| That a job happened, between which two addresses | The prompt, its instructions and context |
| The node's model, hardware, region, SLA commitment | The node's price per 1k tokens |
| Whether the node met that commitment | The agent's budget and ordered workload |
| That an SLA certificate was minted | The cost, payout, refund, and both balances |

NDC — the credit every job is priced and settled in — is freely mintable today, so this deployment
can be evaluated without waiting on us to distribute tokens. **After the challenge we launch a real
token with liquidity that serves exactly the role NDC serves now.** See
[`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) for how, and for what is live versus planned.

Exactly **two bits** are deliberately declassified, and both are named in the contract:
whether the sealed cost fit the sealed budget (which a revert would reveal anyway), and whether
the node kept the SLA it published (because a reputation nobody can read is not a reputation).
Everything else stays sealed. See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the full threat model.

---

## The five COTI privacy skills, and where each one lives

| Skill | Where | What it does here |
| --- | --- | --- |
| `coti-account-setup` | [`src/lib/nodea/account.ts`](src/lib/nodea/account.ts) | Derives each participant's AES key through `AccountOnboard`. Without it an account can move value but cannot read its own balances. |
| `coti-private-messaging` | [`contracts/NodeaPromptChannel.sol`](contracts/NodeaPromptChannel.sol), [`src/lib/nodea/messaging.ts`](src/lib/nodea/messaging.ts) | Prompts sealed for one specific node, stored as `ctString` in three separately keyed views. |
| `coti-private-erc20` | [`contracts/NodeaCredits.sol`](contracts/NodeaCredits.sol), [`src/lib/nodea/credits.ts`](src/lib/nodea/credits.ts) | NDC settlement asset: encrypted balances, allowances and transfers. |
| `coti-private-nft` | [`contracts/NodeaSLA.sol`](contracts/NodeaSLA.sol), [`src/lib/nodea/sla.ts`](src/lib/nodea/sla.ts) | Soulbound confidential ERC-721 receipts with an encrypted telemetry manifest. |
| `coti-smart-contracts` | [`contracts/NodeaCompute.sol`](contracts/NodeaCompute.sol), [`src/lib/nodea/compute.ts`](src/lib/nodea/compute.ts) | The escrow: prices, judges and splits every job inside MPC. |

---

## How a job runs

```
node     registerNode(model, gpu, region, promises, enc(price/1k))
agent    promptChannel.sendMessage(node, enc(prompt))              -> messageId
agent    credits.approve(escrow, enc(maxBudget))
agent    openJob(nodeId, enc(tokens), enc(maxBudget), messageId, deadline)
           |- cost = sealed(price/token) x sealed(min tokens)        garbled circuit
           |- require cost <= sealed(budget)                         1 declassified bit
           `- escrow cost, agent -> contract                         encrypted transfer
node     sendMessage(agent, enc(completion))                     the answer, sealed for the agent
node     submitProof(jobId, enc(tokens), enc(uptime), enc(latency), digest, enc(manifest))
           |- slaMet = uptime >= promise                             garbled circuit
           |         && latency <= promise
           |         && delivered >= ordered                         1 declassified bit
           |- payout = mux(slaMet, cost x 60%, cost)                 never revealed
           `- mint confidential SLA certificate to the node
```

The agent pays a price it never learns. The node is paid an amount it discovers only by decrypting
its own copy. The escrow is conserved — payout plus refund always equals cost — and none of the
three figures exists in plaintext anywhere on chain.

---

## Quick start

```bash
npm install
npm run compile          # contracts + regenerated ABIs
npm test                 # off-chain unit tests (live tests self-skip)
npm run dev              # dashboard at http://localhost:3000
```

### Deploy to COTI mainnet

Nodea targets mainnet. Deploying all four contracts costs roughly **0.02 COTI**
at 2 gwei; budget ~0.5 COTI across the three accounts to cover deployment,
onboarding and a seeded demo.

```bash
npm run keygen           # prints three identities; paste them into .env
#   fund all three — mainnet has no faucet
npm run deploy           # deploys 4 contracts and wires permissions
npm run seed             # registers a starter fleet, funds the agent
npm run fleet            # lists every 0G Router chat model as a node (27 of them)
```

To work for free instead, set `NODEA_NETWORK=cotiTestnet` in `.env`, fund the
addresses from the [COTI faucet](https://faucet.coti.io), and use
`npm run deploy:testnet`.

### Funding a browser agent

The console can mint an agent identity that signs locally, so hiring costs no wallet approvals.
It needs COTI for gas before it can onboard. Its address is on screen; send from any wallet, or
from the deployer:

```bash
npm run fund -- --to 0xYourAgentAddress 0.3
```

### See it work

```bash
npm run e2e              # the whole lifecycle in one narrated script
```

### Two autonomous processes, talking through encrypted on-chain messages

```bash
npm run node-daemon                 # terminal 1 — GPU node: decrypt, infer, prove
npm run agent -- "your prompt"      # terminal 2 — agent: select, seal, escrow, settle
npm run node-daemon -- --degrade    # under-deliver, and watch the circuit slash it
```

### Real compute behind a node

Nodea is a privacy and settlement layer, not a model host, so the GPU underneath is pluggable:

| Backend | Enabled by | What it is |
| --- | --- | --- |
| **0G Router** | `ZEROG_ROUTER_KEY` | One unified balance, 31 models, OpenAI-compatible |
| 0G broker | `ZEROG_PRIVATE_KEY` | Per-provider ledger; more control, 3 0G to open one |
| HTTP | `NODEA_INFERENCE_URL` | Any OpenAI-compatible endpoint (vLLM, TGI, hosted) |
| local | none of the above | Deterministic stand-in — runs offline with no keys |

The Router is the easy path: deposit 0G and create a key at
[pc.0g.ai](https://pc.0g.ai), then set `ZEROG_ROUTER_KEY`.

> **The two 0G balances are separate pools.** Depositing on the web UI funds the *Router*, not the
> SDK ledger. A node can hold thousands of 0G and still see `addLedger` fail for want of three.

```bash
npm run zerog:status     # models, or ledger balance and providers
npm run zerog:test       # one real inference, end to end
```

The 0G account belongs to the **node operator**, not the agent. An agent hires a node and pays in
encrypted NDC without ever learning what the node spent on GPU — so the operator's margin, the gap
between what it charges on COTI and what compute cost it, stays as confidential as the prompt did.
On a transparent chain both legs are visible and that margin is trivially computable.

That is the division of labour: COTI is the part that cannot be substituted, and the silicon is.

---

## Repository

```
contracts/            NodeaCredits, NodeaSLA, NodeaPromptChannel, NodeaCompute
src/lib/nodea/        TypeScript SDK — one module per COTI privacy skill
src/app, src/components   Next.js 14 dashboard
agent/                Autonomous agent runtime and GPU node daemon
scripts/              Deploy, seed, narrated end-to-end demo, keygen
test/                 Off-chain unit tests + live COTI integration suite
docs/                 Architecture, privacy model, tokenomics, demo script
```

## Testing

`npm test` runs the off-chain suite: prompt packing against COTI's 8-byte cell format (including
the multi-byte UTF-8 case that naive slicing corrupts), credit arithmetic, the manifest codec, and
the reputation scoring an agent uses to rank a fleet it cannot price.

Anything involving a garbled circuit is tested against live COTI, because the MPC precompile exists
there and nowhere else — a Hardhat network would let a meaningless test pass. Those live tests skip
themselves until you have keys and a deployment:

```bash
npm run test:live:testnet   # free
npm run test:live           # follows NODEA_NETWORK
```

The suite registers nodes and settles jobs rather than only reading, so on mainnet it spends real
COTI and leaves test listings in the live registry. Pointing it at mainnet therefore takes a second
opt-in — `NODEA_ALLOW_MAINNET_TESTS=1` — beyond simply having keys.

They assert both halves of the claim: that confidential values round-trip for the parties entitled
to them, and that a third party gets a revert.

## Networks

| | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| **COTI Mainnet** (default) | 2632500 | `https://mainnet.coti.io/rpc` | [mainnet.cotiscan.io](https://mainnet.cotiscan.io) |
| COTI Testnet | 7082400 | `https://testnet.coti.io/rpc` | [testnet.cotiscan.io](https://testnet.cotiscan.io) |

`AccountOnboard` lives at the same address on both, so the only differences are the chain id, the
RPC, the explorer — and the fact that mainnet gas is real. Select with `NODEA_NETWORK` (scripts) or
`NEXT_PUBLIC_NODEA_NETWORK` (dashboard).

### Live on COTI mainnet

| Contract | Address |
| --- | --- |
| NodeaCompute | [`0xD057081D016766D55BeA5bD25c8ca1C7865EfC1d`](https://mainnet.cotiscan.io/address/0xD057081D016766D55BeA5bD25c8ca1C7865EfC1d) |
| NodeaCredits | [`0x4d61f8BB478e257E241E47A45A8F46B4a47f1876`](https://mainnet.cotiscan.io/address/0x4d61f8BB478e257E241E47A45A8F46B4a47f1876) |
| NodeaSLA | [`0xDfBd2961aAF90650fE3eF36c6fDB33Ce6bdc28c4`](https://mainnet.cotiscan.io/address/0xDfBd2961aAF90650fE3eF36c6fDB33Ce6bdc28c4) |
| NodeaPromptChannel | [`0xDe0f81161C2E54df2Ce627333153ae43eFA89C0b`](https://mainnet.cotiscan.io/address/0xDe0f81161C2E54df2Ce627333153ae43eFA89C0b) |

Addresses are recorded in [`deployments/`](deployments/) and read by both the dashboard and the
agent runtime.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
