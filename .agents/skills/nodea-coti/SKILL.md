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

4. **Only garbled handles survive a contract hop.** Measured on mainnet with
   `contracts/probe/MpcHopProbe.sol`: `gtUint256` and `gtString` cross a contract boundary fine;
   an `itString`/`itUint256` fails validation (its signature is bound to the original
   `(signer, contract, selector)`), and a `ctString` from `MpcCore.offBoard` **reverts on
   `onBoard` in a different contract** — sealed ciphertext is contract-scoped. Pass the handle and
   seal it at the destination, as `NodeaSLA.issue` does.

5. **Never trust `eth_estimateGas` for MPC calls.** The precompile short-circuits during
   estimation, so the estimate undershoots real execution. Use the fixed limits in
   `src/lib/nodea/gas.ts`; unused gas is refunded and the block limit is 120M.

6. **Check `isZeroCtUint256` before decrypting anything that might be unset.** All-zero storage
   decrypts to a garbage 70-digit number, not to zero.

7. **Sign every input text under the selector it will actually be submitted with.** The selectors
   are exported as constants in `compute.ts`, `credits.ts` and `messaging.ts`. Regenerate them from
   the ABI if a signature changes; a stale selector fails validation inside the precompile with an
   unhelpful revert.

8. **Chunk prompts on code-point boundaries, never on a fixed byte stride.** Chunks are decrypted
   independently, so a split multi-byte character comes back as replacement characters. `chunkPrompt`
   handles this; `test/nodea.test.ts` pins it.

9. **Do not test garbled circuits on a local network.** There is no MPC precompile there, so the
   test proves nothing. Circuit behaviour belongs in `test/integration.test.ts`, which runs against
   live COTI and skips itself without keys or a deployment.

10. **Watch the stack.** `NodeaCompute` is near the EVM stack limit. Prefer splitting a function
   into private helpers over enabling `viaIR`.

## Submission checklist

- Public repo, Apache-2.0.
- Contracts deployed on COTI mainnet, addresses recorded in `deployments/`.
- Public X post tagging `@COTINetwork` with the live app link and a sub-3-minute demo video
  (script in [`docs/DEMO.md`](../../../docs/DEMO.md)).
