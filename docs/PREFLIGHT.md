# Pre-flight - what to test before going public

Everything below has been run against COTI mainnet at least once. This is the order to run it in,
what each step should print, and what it means when it does not.

The single most important operational fact is at the top of "What will break", so read that before
you announce anything.

---

## 0. Current state

| | |
| --- | --- |
| NodeaCompute | [`0xD057081D016766D55BeA5bD25c8ca1C7865EfC1d`](https://mainnet.cotiscan.io/address/0xD057081D016766D55BeA5bD25c8ca1C7865EfC1d) |
| NodeaCredits | [`0x4d61f8BB478e257E241E47A45A8F46B4a47f1876`](https://mainnet.cotiscan.io/address/0x4d61f8BB478e257E241E47A45A8F46B4a47f1876) |
| NodeaSLA | [`0xDfBd2961aAF90650fE3eF36c6fDB33Ce6bdc28c4`](https://mainnet.cotiscan.io/address/0xDfBd2961aAF90650fE3eF36c6fDB33Ce6bdc28c4) |
| NodeaPromptChannel | [`0xDe0f81161C2E54df2Ce627333153ae43eFA89C0b`](https://mainnet.cotiscan.io/address/0xDe0f81161C2E54df2Ce627333153ae43eFA89C0b) |

27 active nodes · 11 jobs settled or refunded · Router key configured.

---

## 1. Build and off-chain suite

```bash
npm run compile && npm test && npm run build
```

**Expect** `16 passing`, `4 pending`, `✓ Compiled successfully`. The 4 pending are the live COTI
tests, which skip unless you opt in — that is correct here.

**If the 4 run instead of skipping**, you have `NODEA_ALLOW_MAINNET_TESTS=1` set. They spend real
COTI and register a throwaway node in your live fleet.

## 2. The live suite

```bash
NODEA_ALLOW_MAINNET_TESTS=1 npm run test:live
```

**Expect** 4 passing in roughly 3 minutes, including a deliberate slash. It registers one test node
— retire it afterwards with `setNodeActive(id, false)` or it sits in your public fleet advertising
a model it does not serve.

## 3. Compute backend

```bash
npm run zerog:status     # catalog and the model your nodes resolve to
npm run zerog:test       # one real completion
```

**Expect** 31 models, and an actual sentence back in a few seconds.

| Failure | Meaning |
| --- | --- |
| `401` | Bad or missing `ZEROG_ROUTER_KEY` |
| `402` | Router balance empty — top up at [pc.0g.ai](https://pc.0g.ai) |
| `does not serve "…"` | A node advertises a model the Router dropped. Re-run `npm run fleet` |

## 4. The full lifecycle, headless

```bash
npm run node-daemon          # terminal 1, leave running
npm run agent -- "In two sentences: why does prompt privacy matter?" --tokens 60 --budget 5
```

**Expect**, in order: the fleet ranked with **no price column**; a prompt sealed into N chunks; an
escrow whose cost the agent decrypts *after* paying it; the daemon serving from a named model; a
real answer; `SLA MET`; a certificate minted.

**The cost is the moment that matters.** The agent never fetched the node's price and the number it
decrypts is `price × tokens` computed inside the circuit.

## 5. Expiry and refund

Open a job with no daemon running and a deadline ~200s out, wait, then reclaim. Verified: job #11
escrowed 0.00348 NDC, expired, refunded **in full**, balance restored exactly.

**Deadlines under ~180 seconds will revert.** The contract's 60-second minimum is measured when
`openJob` is *mined*, and the prompt and approval transactions land first. The SDK now refuses
early with an explanation rather than passing a bare `InvalidDeadline` through.

## 6. The console, in a browser

Desktop **and** a real phone. On the phone use the device, not a resized desktop window — macOS
Chrome clamps `--window-size` to ~485px, so a "390px" screenshot is a cropped desktop render.

Walk: **Create agent → Fund 0.3 COTI → Derive → Claim 500 → select a node → Hire node.**

| Check | Expect |
| --- | --- |
| Fleet loads | ~2.3s, 27 online sorted above retired, `encrypted` rate cards |
| Before Derive | Compute credits reads `sealed` |
| After Derive | The same call reads `500 NDC` |
| Agent mode | 3 transactions, **no** signature popups |
| Wallet mode | ~9 popups for a short prompt — one per 8-byte cell |
| Expand a settled job | Five sealed values decrypt; the answer shows what served it |
| Certificates | Only for an operator account; empty for an agent |

**Reload the page.** The agent identity and its AES key survive; you should not be asked to onboard
again.

---

## What will break in production

Ordered by how likely it is to bite.

### The daemon is a single point of failure, and silence costs reputation

All 27 nodes belong to one operator served by one daemon. If it stops, every job opened against
those nodes sits escrowed until the agent reclaims — **and each expiry counts as a breach against
the node**, permanently, in a public record.

There is no restart logic. An unhandled RPC error exits the process. Run it under systemd or pm2
with `Restart=always` before you publish anything, and watch that it is alive.

### Operator gas is consumed per job

`submitProof` is the expensive call. At ~0.005 COTI per settlement the operator's 1.70 COTI is
roughly 340 jobs. **If it runs dry mid-job the job stays escrowed and the node takes the breach.**
Alert well before zero.

### The Router balance is a second fuse

Empty balance means every job fails with 402 and every node breaches. Same failure shape as gas,
different account, and nothing in the app watches it.

### Anyone can register a node, and anyone can mint NDC

`registerNode` is permissionless and `claimFaucet` gives 500 NDC to any address, once. Both are
deliberate — see [`TOKENOMICS.md`](TOKENOMICS.md) — but it means a stranger can list a node that
advertises anything and never serves, or mint credits freely. Reputation is the only defence today,
and an unproven node still appears in the fleet.

### Untested at any scale

Every job so far has been sequential. Nothing has exercised two agents hiring at once, a daemon
with a queue, or the console under concurrent load. The daemon polls every 6 seconds and serves
strictly one job at a time.

### The browser agent key is a hot key

`localStorage`, one origin, no encryption. Fine for the amounts involved, wrong for anything else,
and it is gone if a visitor clears site data. The UI says so and offers a backup.

---

## Hosting

The app has only ever run on `localhost`. Going public means deploying it.

```bash
npx vercel
```

No environment variables are required: `deployments/cotiMainnet.json` is committed, so the
addresses ship with the build. Set `NEXT_PUBLIC_NODEA_*` only to point a deployment at different
contracts.

**Never put `NODEA_*` or `ZEROG_*` keys in the hosting environment.** The web app does not read
them — every private key in this project belongs to the CLI and the daemon on your own machine. A
key in a Vercel environment variable is a key in a build log.

After deploying, re-run **§6** against the public URL. A wallet behaves differently over HTTPS on a
real domain than over `http://localhost`.

---

## Go / no-go

Ship when all of these are true:

- [ ] §1–§5 pass
- [ ] The daemon runs under a supervisor that restarts it, and you have watched it restart
- [ ] Operator COTI and Router balances both have headroom, and you know where to check them
- [ ] §6 passes on the public URL, on a desktop and a real phone
- [ ] The test node from §2 is retired
- [ ] You can answer, out loud: *what is public here, and what is not?*

The last one is the one a stranger will ask first.
