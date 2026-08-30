# Privacy model

Nodea does not claim to hide everything. It claims to hide the things an adversary can trade on,
and to publish the things a market needs to function. This document states exactly where that line
falls, so the claim can be checked against the contracts rather than taken on faith.

## What stays confidential

Each of these is a COTI garbled value (`gtUint256` in circuit, `ctUint256` in storage), written by
`MpcCore.offBoard` / `offBoardToUser` and never decrypted on chain:

| Value | Contract | Who can read it |
| --- | --- | --- |
| Node price per 1k tokens | `NodeaCompute._nodePrice` | The node operator |
| Workload ordered | `NodeaCompute._jobWorkload` | Agent and node operator |
| Workload delivered | `NodeaCompute._jobDelivered` | Agent and node operator |
| Escrowed cost | `NodeaCompute._jobCost` | Agent and node operator |
| Payout | `NodeaCompute._jobPayout` | Agent and node operator |
| Refund | `NodeaCompute._jobRefund` | Agent and node operator |
| NDC balances and allowances | `NodeaCredits` (COTI `PrivateERC20`) | The account itself |
| Prompt text | `NodeaPromptChannel` (COTI `PrivateMessaging`) | Sender and the addressed node |
| SLA telemetry manifest | `NodeaSLA` encrypted token URI | The operator that owns the token |

Two enforcement layers back this up. The MPC layer means an unentitled party holds bytes it has no
key for. The contract layer means it usually cannot even fetch those bytes: `nodePriceForOperator`,
`jobCostFor`, `jobPayoutFor`, `jobRefundFor`, `jobWorkloadFor` and `jobDeliveredFor` all revert with
`UnauthorizedViewer` for anyone who is not a counterparty, and COTI's `PrivateMessaging` reverts the
same way on a message you are not party to.

Notably, **no event emitted by any Nodea contract carries a plaintext amount.**

## What is deliberately public

- **That a job happened**, and between which two addresses. Nodea does not attempt sender or
  recipient anonymity; it protects the contents and the amounts, not the graph.
- **Node listings**: model, GPU class, region, and the uptime and latency the operator publicly
  committed to. An agent has to be able to shop.
- **Job state** and timestamps: escrowed, settled, or reclaimed.
- **Certificate metadata**: which job, which client, what uptime was promised, and the SLA verdict.

## The two declassified bits

Both are single `MpcCore.decrypt(gtBool)` calls, and both are load-bearing.

**1. Affordability**, in `openJob`:

```solidity
if (!MpcCore.decrypt(MpcCore.le(gtCost, MpcCore.validateCiphertext(encMaxBudget)))) {
    revert BudgetExceeded();
}
```

This discloses nothing new. The transaction either succeeds or reverts, and an observer learns the
same single bit from that outcome either way. Crucially it reveals *whether* the cost fit, not what
either number was — an observer who sees a revert learns that this agent could not afford this
node at this workload, and nothing more.

**2. SLA outcome**, in `submitProof`:

```solidity
gtBool gtMet = _judge(...);          // uptime >= promise && latency <= promise && delivered >= ordered
slaMet = MpcCore.decrypt(gtMet);     // published, because reputation must be legible
_settle(jobId, gtMet);               // payout selected with mux, still sealed
```

This one is a genuine disclosure and a deliberate design choice. A confidential compute marketplace
where reliability cannot be verified is a marketplace nobody can safely buy in. So the *verdict*
is public and the *measurements* are not: an observer learns that node #3 kept its promise on job
#41, never what the workload was, how many tokens it produced, or what it was paid.

Note that `_settle` takes the still-encrypted `gtMet`, not the decrypted boolean. The payout is
selected inside the circuit with `mux`, and both transfer legs always execute — so a breached job
and a clean one leave an identical on-chain footprint, differing only in sealed amounts.

## Known limits

Stated plainly, because a privacy claim with no stated limits is not a serious one.

- **Trust in the MPC network.** COTI's garbled-circuit soundness rests on the network operator,
  consensus and the precompile implementation. Solidity cannot re-prove it on chain. This is
  inherited from COTI and documented in `IPrivateERC20`.
- **Metadata and timing.** Transaction graph, timing and gas are visible. An observer who watches
  one agent hire one node repeatedly learns the *relationship*, just not its terms.
- **Node-side plaintext.** A prompt is decrypted inside the node's process, because that is the
  only way to run inference on it. Nodea makes the transport and settlement confidential; it does
  not make the node itself trustless. Confidential-VM or TEE attestation is the natural next layer,
  and `attestationDigest` is the hook where it would bind in.
- **Self-reported telemetry.** A node reports its own uptime and latency. The circuit checks those
  claims against its public commitments and its delivered volume against what was ordered, and
  slashes on failure — but it cannot independently measure a node. That is an oracle problem, not a
  privacy one.
- **Prompt size.** One on-chain message holds 1,536 bytes (`MAX_CHUNKS_PER_MESSAGE` x
  `MAX_CHUNK_CELLS` x 8), a limit inherited from COTI's `PrivateMessaging`. Larger workloads need
  to be split across jobs.
- **AES key custody.** The key is derived through `AccountOnboard` and cached in `localStorage` in
  the browser, scoped by address and chain. It never reaches a server — there is no Nodea backend —
  but anyone with access to the browser profile has it.
- **NDC is not scarce.** `claimFaucet` mints a fixed allotment to any address once, so NDC meters
  compute rather than storing value. This is an economic property, not a privacy one, but it is
  worth stating next to them: an operator's encrypted earnings are denominated in a token anyone
  can mint. `setFaucetEnabled(false)` closes the allotment when that trade stops being the right
  one — see [`TOKENOMICS.md`](TOKENOMICS.md) for the launch that follows it.

## Verifying the claims yourself

`npm run test:live` runs against a real deployment and asserts both directions: that each
confidential value round-trips for the parties entitled to it, and that a third party's read
reverts. `npm run e2e` prints the same lifecycle with every public and private value side by side.
