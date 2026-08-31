# Demo script - three minutes

A timed walkthrough for a recorded demo. Narration is written to be read aloud at a normal pace;
each beat's word count fits its slot with room to breathe.

Two cuts exist, depending on who is watching. **Privacy-first** (below) leads with the sealed
values and the two declassified bits, and treats the GPU as commodity. **Compute-first** swaps
beats 3 and 5: lead with 27 real models and a live inference from a frontier model, and treat the
confidentiality as what makes paying for it safe. Same footage, different order.

---

## Never on screen

Check before you hit record, not after you upload.

- **`.env`** - three private keys in one file. Close the tab. If it is open in your editor, quit
  the editor.
- **`/etc/nodea/nodea.env`** on the VPS, and any `cat` or `nano` of it.
- **The 0G Router key**, including in `npm run zerog:status` output.
- **Your browser's other tabs**, and any password manager.

Safe to show: every contract address, the operator's address, `cotiscan`, and the whole daemon
journal. Those are public by design - that is the point of the demo.

## Setup

Four things open, arranged so you can cut between them without hunting:

1. The deployed site, on the landing page
2. A second tab on the same site at `/app`, with the AES key already derived and NDC already claimed
3. A terminal SSH'd to the VPS running `sudo journalctl -u nodea-daemon -f`
4. A tab on `mainnet.cotiscan.io` at the `NodeaCompute` address

**Pre-stage a settled job.** Hire a node before you record and let it settle. A live hire takes
60-90 seconds end to end - inference alone is ~20s, and the answer comes back as three separate
sealed transactions. You will start a *second* hire on camera and cut away from it; the settled one
is what you return to. Trying to do this in one unbroken take is how a three-minute demo becomes
five.

Terminal at 16pt or larger. Record at 1080p or better; the ciphertext has to be legible.

---

## 0:00 - 0:20 · The problem

Open on the landing hero.

> "An AI agent renting GPU on a public chain publishes its strategy. The prompt is the product.
> What it pays, which model it prefers, how much runway is left - a competitor reads it off a
> block explorer.
>
> Nodea makes none of that visible. Live on COTI mainnet."

## 0:20 - 0:40 · The fleet

Cut to `/app`. Scroll the fleet table slowly.

> "Twenty-seven nodes, each running a real model on real GPU. You see the model, the hardware, the
> region, the uptime it promised, and the record it has delivered.
>
> What you cannot see - by anyone - is the price."

Point at the rate card column reading `encrypted`.

> "A rate card here is encrypted state. Not hidden by the interface. Encrypted on chain."

## 0:40 - 1:00 · Two keys

Point at the credits row **before** deriving, reading `sealed`. Then derive, and point again.

> "A COTI account has two keys. One signs transactions. The second is derived on chain through
> AccountOnboard, and it alone reads your encrypted state.
>
> Same call, same bytes on chain. Before the key: ciphertext. After: five hundred credits. Nothing
> on chain changed. The reader did."

## 1:00 - 1:30 · Hire

Select a node. Type a short prompt. Click **Hire node** and narrate the three steps as they light.

> "The prompt is encrypted in my browser for this node's key specifically, and posted to COTI's
> private messaging contract. Then I approve a ceiling - and the allowance is itself a ciphertext.
> Then the escrow opens.
>
> I never fetched this node's price. I never computed a cost. A garbled circuit multiplies the
> node's sealed rate by my sealed workload, checks the product against my sealed budget, and moves
> exactly that much. I am about to pay a price I have never seen."

**Cut here.** Do not film the wait.

## 1:30 - 2:00 · The node earns it

Cut to the VPS terminal, on the settled job you pre-staged.

> "This is the node, on a server that is not my laptop. It decrypts the prompt with its own key -
> it is the only party that can - runs the inference on a frontier model, measures itself, and
> submits sealed proof."

Point at the verdict line.

> "Three things compared inside the circuit: uptime against its public promise, latency against its
> public promise, and tokens delivered against what I actually ordered. One bit comes out. The
> payout is selected with `mux` and never leaves the circuit in the clear."

## 2:00 - 2:30 · What you paid for

Back to `/app`. Expand the settled job. Let the answer render.

> "And here is what the whole thing was for. The model's answer, sealed for me alone, travelling
> back down the same encrypted channel the prompt went out on."

Point at the provenance line, then the amounts.

> "It tells me which model produced it. And these - cost, payout, refund - decrypt here, in this
> browser, because I am a counterparty to this job. For anyone else the contract reverts before the
> ciphertext leaves it."

## 2:30 - 2:50 · The same job, from outside

Switch to the explorer tab. Scroll the transaction.

> "This is that identical job from the outside. A transaction happened, between two addresses, and
> a node kept its SLA. There is not a number in it. No price, no budget, no payout, no balance -
> and no prompt."

## 2:50 - 3:00 · Close

Scroll to the certificate, or back to the hero.

> "Encrypted prompts, encrypted settlement, and an SLA judged inside a garbled circuit that never
> sees a plaintext price. Live on mainnet. Nodea."

---

## The strongest thing you can show

If a reviewer only remembers one shot, make it **2:30** - the explorer next to the console, same
job, one readable and one not. Everything else is a claim. That is evidence.

The second strongest is a real breach. Job #12 in this deployment breached honestly: the node
served the job correctly but missed its latency promise, and lost 40% of the payment for it. That
record is permanent and public and cannot be edited. A marketplace whose reputation system has
never marked anyone down has not demonstrated one.

## Backup takes

If a live hire is slow or a wallet misbehaves on camera:

```bash
npm run e2e
```

The whole lifecycle as one narrated script, every public and private value printed side by side, no
wallet interaction. It cuts well and cannot fail on stage.

```bash
npm run node-daemon -- --degrade
```

Same flow, ending in a slash and a breached certificate - for when the point being made is that the
SLA is real.

## Details worth lingering on

- The `encrypted` rate card column. **The missing column is the pitch.**
- The `sealed` -> decrypted transition on the credits row.
- The `BudgetExceeded` path: set a budget of `0.01` and hire. The circuit refuses without revealing
  either number, and the console says exactly that.
- The daemon's `to first chunk` line. Latency is judged on responsiveness, not on how much work was
  ordered - a fixed promise cannot fairly be held against a number that grows with order size.
