# Demo script — under 3 minutes

For the submission video (`@COTINetwork`, link to the live app and this repo).

## Before you record

```bash
npm install && npm run compile
npm run keygen                  # paste into .env, fund all three at https://faucet.coti.io
npm run deploy:testnet
npm run seed
npm run dev                     # http://localhost:3000
```

Have four things open: the dashboard, a terminal, the node daemon in a second terminal, and one
COTI explorer tab on the `NodeaCompute` address.

---

## 0:00 — 0:25 · The problem, on screen

Open the dashboard. Read the headline, then point at the **fleet table**.

> "Three GPU nodes. You can see the model, the hardware, the region, the uptime each one
> committed to, and the record it has actually delivered. What you cannot see — anywhere, by
> anyone — is the price. On Nodea a rate card is encrypted state."

Point at the **Rate card** column reading `encrypted`.

## 0:25 — 0:50 · Two keys, not one

Click **Connect**, then **Derive AES key**.

> "A COTI account has two keys. One signs transactions. The second is derived on chain through
> AccountOnboard, and it is the only thing that can read your encrypted state."

Point at the credits row before deriving — it reads `sealed` — then after.

> "Same call, same bytes on chain. Before the key it's a ciphertext; after, it's 500 NDC. Nothing
> about the chain changed. The reader did."

## 0:50 — 1:35 · Hire a node

Type a prompt into the composer. Set workload and budget. Click **Hire node** and narrate the three
steps as they light up:

> "One: the prompt is encrypted in my browser for node three's key specifically, and posted to
> COTI's private messaging contract. Two: I approve a *ceiling* — and the allowance is itself a
> ciphertext. Three: the escrow opens.
>
> Notice I never fetched the price and never computed a cost. The garbled circuit multiplies the
> node's sealed rate by my sealed workload, checks the product against my sealed budget, and pulls
> exactly that much. I'm about to pay a price I have never seen."

## 1:35 — 2:10 · The node earns it

Cut to the node daemon terminal.

> "This is the GPU node. It decrypts the prompt with its own AES key — it's the only party that
> can — runs the inference, measures itself, and submits sealed proof."

Point at the verdict line.

> "Three conditions compared inside the circuit: uptime against its public promise, latency against
> its public promise, and delivered tokens against what I actually ordered. One bit comes out —
> SLA met. The payout is chosen with `mux` and stays encrypted."

## 2:10 — 2:40 · What each side can read

Back to the dashboard. Expand the job row. Click **decrypt** on cost, payout and refund.

> "Every one of these is a `ctUint256` on chain. They decrypt here, in this browser, because I'm a
> counterparty. For anyone else the contract reverts before the ciphertext even leaves it."

Switch to the explorer tab.

> "And here's the same job from outside. A transaction happened. There is not a number in it."

## 2:40 — 3:00 · Close

Scroll to the SLA certificate.

> "The node keeps a soulbound confidential receipt. Public: which job, and that it kept its SLA —
> that's its reputation, and it has to be legible. Encrypted inside: the telemetry, readable only
> by the operator that earned it.
>
> Five COTI privacy skills, one market. Nodea: agents buy compute without publishing what they
> bought."

---

## Backup take

If a live transaction is slow on camera, `npm run e2e` runs the same lifecycle as one narrated
script with every public and private value printed side by side — it cuts well as a screen
recording and needs no wallet interaction.

## Deliberately visible details

- The fleet table's `encrypted` rate card column — the missing column is the pitch.
- `sealed` → decrypted transition on the credits row.
- The `BudgetExceeded` path: set a budget of `0.01` and hire. The circuit rejects it without
  revealing either number, and the dashboard says so.
- `npm run node-daemon -- --degrade`: the same flow, ending in a slash and a breached certificate.
