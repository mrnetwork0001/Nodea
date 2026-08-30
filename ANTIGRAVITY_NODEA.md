# Nodea - development directives

Persistent context for anyone (human or agent) working on this repository.

## What this is

Autonomous encrypted DeAI compute. Confidential settlement on COTI, inference on 0G. The full
specification is [`NODEA_PROJECT_SPEC.md`](NODEA_PROJECT_SPEC.md); the design decisions and the
constraints behind them are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Working rules

The rules that are easy to break by accident live in
[`.agents/skills/nodea-coti/SKILL.md`](.agents/skills/nodea-coti/SKILL.md). Read them before
touching contracts or the SDK. The short version:

1. Never materialise a confidential value in plaintext on chain - not in storage, not in an event,
   not in a revert string.
2. `MpcCore.decrypt` is a budgeted resource. There are exactly two declassifications in the
   protocol; a third needs the same justification the first two carry.
3. Only garbled *handles* survive a contract hop. Sealed ciphertext is contract-scoped.
4. Never trust `eth_estimateGas` for MPC calls - the precompile short-circuits during estimation.
5. Do not test garbled circuits on a local network. There is no precompile there, so the test
   proves nothing.

## Key files

| Path | What it is |
| --- | --- |
| `contracts/` | The four Solidity contracts |
| `src/lib/nodea/` | TypeScript SDK, one module per COTI privacy skill |
| `agent/` | Autonomous hiring agent, GPU node daemon, inference backends |
| `scripts/` | Deploy, fund, seed, fleet registration, narrated end-to-end demo |
| `deployments/` | Live addresses, read by both the dashboard and the runtimes |
