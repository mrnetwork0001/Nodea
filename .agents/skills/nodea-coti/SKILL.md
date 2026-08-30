---
name: nodea-coti
description: Architecture, COTI privacy primitives, and working rules for Nodea — the encrypted DeAI compute marketplace built for the COTI Web4 Vibe Code Challenge.
---

# Nodea — working rules

Use this when developing, reviewing or extending **Nodea**: autonomous encrypted DeAI compute on
COTI. Full detail lives in [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) and
[`docs/PRIVACY.md`](../../../docs/PRIVACY.md); this file is the short version plus the rules that
are easy to violate by accident.

## Shape

- **Contracts**: `NodeaCompute` (escrow + SLA arbiter), `NodeaCredits` (PrivateERC20),
  `NodeaSLA` (soulbound PrivateERC721), `NodeaPromptChannel` (PrivateMessaging).
- **SDK**: `src/lib/nodea/` — one module per COTI privacy skill, written against a single
  `CotiSigner` interface so `Wallet` and browser `JsonRpcSigner` share every code path.
- **Runtimes**: `agent/run.ts` (hiring agent), `agent/node-daemon.ts` (GPU node).
- **Stack**: Solidity 0.8.28 (`evmVersion: paris`), TypeScript, Next.js 14, `@coti-io/coti-ethers`.

## Rules that are easy to break

1. **Never materialise a confidential value in plaintext on chain.** Not in storage, not in an
   event, not in a revert string. Amounts move as `gtUint256` and rest as `ctUint256`.

2. **`MpcCore.decrypt` is a budgeted resource.** There are exactly two declassifications in the
   protocol — affordability in `openJob`, SLA verdict in `submitProof` — and both are justified in
   `docs/PRIVACY.md`. Adding a third needs the same justification.

3. **Seal for every entitled reader, at write time.** Use `_seal()`, which produces the network
   copy plus one per counterparty. A value offboarded only to the network is unreadable by humans
   forever.

4. **Input texts do not survive a contract hop.** A COTI `itUint256`/`itString` signature is bound
   to `(signer, contract, selector)`. To pass a sealed value between contracts, `offBoard` it to a
   `ctString`/`ctUint256` and `onBoard` it on the other side — see `NodeaSLA.issue`.

5. **Sign every input text under the selector it will actually be submitted with.** The selectors
   are exported as constants in `compute.ts`, `credits.ts` and `messaging.ts`. Regenerate them from
   the ABI if a signature changes; a stale selector fails validation inside the precompile with an
   unhelpful revert.

6. **Chunk prompts on code-point boundaries, never on a fixed byte stride.** Chunks are decrypted
   independently, so a split multi-byte character comes back as replacement characters. `chunkPrompt`
   handles this; `test/nodea.test.ts` pins it.

7. **Do not test garbled circuits on a local network.** There is no MPC precompile there, so the
   test proves nothing. Circuit behaviour belongs in `test/integration.test.ts`, which runs against
   live COTI and skips itself without keys or a deployment.

8. **Watch the stack.** `NodeaCompute` is near the EVM stack limit. Prefer splitting a function
   into private helpers over enabling `viaIR`.

## Submission checklist

- Public repo, Apache-2.0.
- Contracts deployed on COTI testnet, addresses recorded in `deployments/`.
- Public X post tagging `@COTINetwork` with the live app link and a sub-3-minute demo video
  (script in [`docs/DEMO.md`](../../../docs/DEMO.md)).
