/**
 * The landing page's content sections.
 *
 * Server components throughout - the landing reads the same protocol constants the contracts and
 * SDK use, so a slash rate, a message ceiling or a deployed address can never drift out of sync
 * with what the code actually does.
 */
import Link from "next/link"
import { Wordmark } from "@/components/Wordmark"
import {
  ArrowUpRight,
  Award,
  Coins,
  Cpu,
  Eye,
  KeyRound,
  Lock,
  MessageSquareLock,
  Terminal,
} from "lucide-react"
import {
  DEFAULT_NETWORK,
  NETWORKS,
  PROMPT_MAX_BYTES,
  SLA_SLASH_BPS,
  explorerAddress,
} from "@/lib/nodea/config"
import { loadDeployment } from "@/lib/nodea/deployments"

const NETWORK = NETWORKS[DEFAULT_NETWORK]

// ---------------------------------------------------------------------------

export function Section({
  id,
  index,
  eyebrow,
  title,
  lede,
  children,
}: {
  id?: string
  index: string
  eyebrow: string
  title: React.ReactNode
  lede?: string
  children?: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-void-600 py-20 sm:py-28">
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow mb-5 flex items-center gap-3">
            <span className="text-acid">{index}</span>
            <span className="h-px w-8 bg-void-500" />
            {eyebrow}
          </p>
          <h2 className="display-lg">{title}</h2>
        </div>
        {lede && <p className="lede max-w-md lg:text-right">{lede}</p>}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------

const LEAKS = [
  {
    n: "01",
    title: "Prompt theft",
    body: "System instructions, retrieved context and reasoning traces are the agent's actual product. Sent to a compute marketplace in the clear, they are simply published - and copied by the next agent for free.",
  },
  {
    n: "02",
    title: "Front-running",
    body: "Per-task payments reveal how much an agent pays per thousand tokens and how fast it burns. That is a live read on its strategy and its remaining runway, sitting on a public explorer.",
  },
  {
    n: "03",
    title: "Race to the bottom",
    body: "A GPU operator cannot publish a rate card without inviting every rival to price one wei under it. Transparency pushes the market to compete on price instead of the reliability buyers actually want.",
  },
] as const

export function Problem() {
  return (
    <Section
      id="problem"
      index="01"
      eyebrow="The problem"
      title={
        <>
          Renting inference on a<br />
          transparent chain publishes
          <br />
          <span className="text-acid">your whole business.</span>
        </>
      }
      lede="Three leaks, all structural, none fixable off-chain - the moment settlement touches a public ledger, the numbers are public."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {LEAKS.map((leak) => (
          <article key={leak.title} className="card p-7">
            <span className="font-mono text-[10px] tracking-label text-acid">{leak.n}</span>
            <h3 className="mt-5 font-display text-xl font-bold uppercase tracking-tighter">
              {leak.title}
            </h3>
            <p className="muted mt-3">{leak.body}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const FLOW = [
  {
    actor: "node",
    call: "registerNode(model, gpu, region, promises, enc(price))",
    note: "The rate card is sealed on arrival. Everything else about the listing is public, so agents can shop.",
  },
  {
    actor: "agent",
    call: "sendMessage(node, enc(prompt))",
    note: "Encrypted client-side for that node's AES key alone, and stored on chain as a ctString.",
  },
  {
    actor: "agent",
    call: "openJob(nodeId, enc(kTokens), enc(budget), messageId)",
    note: "The circuit multiplies sealed price by sealed workload and checks the product against the sealed budget. The agent never fetched the price.",
  },
  {
    actor: "node",
    call: "submitProof(jobId, enc(tokens), enc(uptime), enc(latency))",
    note: "The node serves the job on real GPU - 0G Compute today, any provider tomorrow - then reports back. Three conditions judged in-circuit against its public promises. One bit comes out: met, or not.",
  },
  {
    actor: "circuit",
    call: "payout = MpcCore.mux(slaMet, cost × 60%, cost)",
    note: "Selected inside MPC and moved as encrypted transfers. Both legs always run, so a breach and a clean job leave the same footprint - only the sealed amounts differ.",
  },
] as const

export function HowItWorks() {
  return (
    <Section
      id="how"
      index="03"
      eyebrow="How it works"
      title={
        <>
          One job, five calls,
          <br />
          nothing in the clear.
        </>
      }
      lede="The agent pays a price it never learns. The node is paid an amount it discovers by decrypting its own copy. Payout plus refund always equals cost."
    >
      <ol className="grid gap-3">
        {FLOW.map((step, index) => (
          <li key={step.call} className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 items-center gap-4 sm:w-44">
              <span className="font-mono text-[10px] tracking-label text-acid">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="chip border-void-500 text-white/50">{step.actor}</span>
            </div>
            <div className="min-w-0 flex-1">
              <code className="scroll-x block whitespace-nowrap font-mono text-[13px] text-white">
                {step.call}
              </code>
              <p className="muted mt-2">{step.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const SKILLS = [
  {
    icon: KeyRound,
    skill: "coti-account-setup",
    title: "Two keys, not one",
    body: "Every participant derives an AES key through AccountOnboard. Without it an account can move value but cannot read a single one of its own balances.",
  },
  {
    icon: MessageSquareLock,
    skill: "coti-private-messaging",
    title: "Prompts sealed per node",
    body: `Each prompt is stored as a ctString in three separately keyed views. Only the hired node can decrypt it. Up to ${PROMPT_MAX_BYTES.toLocaleString()} bytes per message.`,
  },
  {
    icon: Coins,
    skill: "coti-private-erc20",
    title: "Settlement without amounts",
    body: "NDC balances, allowances and transfers are all ciphertext. No event emitted by any Nodea contract carries a plaintext amount.",
  },
  {
    icon: Award,
    skill: "coti-private-nft",
    title: "Reputation without exposure",
    body: "Soulbound confidential ERC-721 receipts. Public: which job, and whether the SLA held. Encrypted: the telemetry that would expose a customer's workload.",
  },
  {
    icon: Cpu,
    skill: "coti-smart-contracts",
    title: "The circuit is the arbiter",
    body: `Pricing, SLA judgement and the payout split all run inside garbled circuits. A node that misses its promise is slashed ${SLA_SLASH_BPS / 100}% by the contract, not by an operator.`,
  },
] as const

export function Skills() {
  return (
    <Section
      id="stack"
      index="04"
      eyebrow="COTI stack"
      title={
        <>
          Five privacy skills,
          <br />
          each one <span className="text-acid">load-bearing.</span>
        </>
      }
      lede="Not five integrations bolted on for a checklist. Remove any one and the market stops working."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map(({ icon: Icon, ...skill }) => (
          <article key={skill.skill} className="card p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-acid/10 text-acid">
                <Icon className="h-4 w-4" />
              </span>
              <code className="font-mono text-[10px] text-white/30">{skill.skill}</code>
            </div>
            <h3 className="mt-6 font-display text-xl font-bold uppercase leading-tight tracking-tighter">
              {skill.title}
            </h3>
            <p className="muted mt-3">{skill.body}</p>
          </article>
        ))}

        <article className="card-acid flex flex-col justify-between p-7">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-label text-black/60">
              Verified on mainnet
            </p>
            <h3 className="mt-6 font-display text-xl font-bold uppercase leading-tight tracking-tighter">
              Every claim on this page is checkable against a live deployment.
            </h3>
          </div>
          <Link href="/app" className="btn-sm mt-8 self-start bg-black text-acid hover:bg-void-800">
            Open the console
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const LIMITS = [
  [
    "MPC trust",
    "Garbled-circuit soundness rests on COTI's network and precompile. Solidity cannot re-prove it.",
  ],
  [
    "Metadata",
    "The transaction graph and timing stay visible. Nodea protects contents and amounts, not the graph.",
  ],
  [
    "Node-side plaintext",
    "A prompt is decrypted in the node's process, because that is the only way to run it. TEE attestation is the natural next layer.",
  ],
  [
    "Self-reported telemetry",
    "The circuit checks a node's claims against its commitments and delivered volume, but cannot independently measure a node.",
  ],
] as const

export function Declassified() {
  return (
    <Section
      id="leaks"
      index="05"
      eyebrow="What leaks"
      title={
        <>
          Exactly two bits are
          <br />
          published <span className="text-acid">on purpose.</span>
        </>
      }
      lede="A privacy claim with no stated limits is not a serious one. Here is the whole boundary, and both halves are checkable against the contract."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="card p-7">
          <p className="eyebrow text-acid">Bit one · affordability</p>
          <h3 className="mt-5 font-display text-2xl font-bold uppercase leading-tight tracking-tighter">
            Did the sealed cost fit the sealed budget?
          </h3>
          <p className="muted mt-4">
            This discloses nothing new. The transaction either succeeds or reverts, and an observer
            learns the same bit from the outcome either way. It reveals <em>whether</em> the cost
            fit - never what either number was.
          </p>
        </article>

        <article className="card p-7">
          <p className="eyebrow text-acid">Bit two · the SLA verdict</p>
          <h3 className="mt-5 font-display text-2xl font-bold uppercase leading-tight tracking-tighter">
            Did the node keep the promise it published?
          </h3>
          <p className="muted mt-4">
            A genuine disclosure, and a deliberate one: a marketplace where reliability cannot be
            verified is one nobody can safely buy in. The verdict is public, the measurements are
            not - and the payout is still selected inside the circuit from the encrypted bit.
          </p>
        </article>
      </div>

      <div className="card mt-3 p-7">
        <h3 className="font-display text-lg font-bold uppercase tracking-tighter">
          And the limits we do not paper over
        </h3>
        <ul className="mt-5 grid gap-x-10 gap-y-3 md:grid-cols-2">
          {LIMITS.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-acid" />
              <p className="muted">
                <strong className="font-semibold text-white">{title}.</strong> {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

export function Audiences() {
  return (
    <Section
      index="06"
      eyebrow="Who it is for"
      title={
        <>
          Two sides of
          <br />
          one market.
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="card p-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-acid/10 text-acid">
            <Eye className="h-4 w-4" />
          </span>
          <h3 className="mt-6 font-display text-2xl font-bold uppercase tracking-tighter">
            If you run an agent
          </h3>
          <p className="muted mt-3">
            Hire inference without publishing your prompts, your burn rate, or how much runway you
            have left. Commit a sealed ceiling and let the circuit enforce it against a price you
            never see.
          </p>
          <pre className="scroll-x mt-6 rounded-xl border border-void-600 bg-void-950 p-4 font-mono text-[11px] text-acid">
            <code>{`npm run agent -- "your prompt here"`}</code>
          </pre>
        </article>

        <article className="card p-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-acid/10 text-acid">
            <Lock className="h-4 w-4" />
          </span>
          <h3 className="mt-6 font-display text-2xl font-bold uppercase tracking-tighter">
            If you run GPUs
          </h3>
          <p className="muted mt-3">
            Price honestly without a rival reading your rate card off the ledger. Build a portable,
            verifiable reliability record while your customers&apos; workloads stay confidential.
          </p>
          <p className="muted mt-3">
            Bring your own silicon: vLLM, TGI, or a decentralized network like 0G Compute. What COTI
            protects is the part you cannot get anywhere else - your rate card, your customers&apos;
            prompts, and the margin between what you charge and what compute cost you.
          </p>
          <pre className="scroll-x mt-6 rounded-xl border border-void-600 bg-void-950 p-4 font-mono text-[11px] text-acid">
            <code>{`npm run node-daemon`}</code>
          </pre>
        </article>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const LAYERS = [
  {
    tag: "COTI",
    title: "Privacy and settlement",
    body: "The prompt is sealed for one node. The rate card, the budget, the cost, the payout and every balance are garbled ciphertext. The SLA is judged inside a circuit that never sees a plaintext price. This is the part that cannot be substituted.",
  },
  {
    tag: "0G",
    title: "The compute underneath",
    body: "Jobs are served on real GPU across 27 models, from in-house 0G models to frontier ones. A node's rate card is derived from what that model actually costs it, so the economics are real rather than illustrative.",
  },
  {
    tag: "The gap between them",
    title: "The node's margin, kept private",
    body: "A node charges on COTI and pays for compute elsewhere. The difference is its margin - and on a transparent chain both legs are visible, so that margin is trivially computable by any competitor. Here it stays as confidential as the prompt did.",
  },
] as const

export function Layers() {
  return (
    <Section
      id="layers"
      index="02"
      eyebrow="Architecture"
      title={
        <>
          Two layers, each doing
          <br />
          what <span className="text-acid">only it can.</span>
        </>
      }
      lede="Compute is a commodity and will always be purchasable somewhere. Confidential settlement is not - and it is the half that makes a compute marketplace bankable rather than merely functional."
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {LAYERS.map((layer) => (
          <article key={layer.title} className="card p-7">
            <p className="eyebrow text-acid">{layer.tag}</p>
            <h3 className="mt-5 font-display text-xl font-bold uppercase leading-tight tracking-tighter">
              {layer.title}
            </h3>
            <p className="muted mt-3">{layer.body}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const TOKEN_PHASES = [
  {
    tag: "Now · live",
    title: "A metering unit",
    body: "Every job on Nodea is priced, escrowed and settled in NDC, with balances and amounts encrypted end to end. Anyone can mint 500 for the price of gas - deliberately, so this deployment can be evaluated without waiting on us to hand out tokens.",
  },
  {
    tag: "After the challenge",
    title: "A real token, same job",
    body: "We launch a token with liquidity that serves exactly the role NDC serves now. One admin call - setFaucetEnabled(false), already deployed - stops free minting, and supply moves to a fixed cap.",
  },
  {
    tag: "How it trades",
    title: "Public market, private amounts",
    body: "A public ERC-20 bridges one-to-one into the private credit through COTI's own PrivacyBridgeERC20 - the pattern already backing PrivacyBridgeUSDCe and WETH. The market is public; the per-job amounts are not.",
  },
] as const

export function Token() {
  return (
    <Section
      id="token"
      index="07"
      eyebrow="NDC"
      title={
        <>
          The credit today,
          <br />
          the <span className="text-acid">token</span> after.
        </>
      }
      lede="Demand is already structural - you cannot hire compute on Nodea without NDC. What is missing is scarcity, and that is a switch we have not yet thrown."
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {TOKEN_PHASES.map((phase) => (
          <article key={phase.title} className="card p-7">
            <p className="eyebrow text-acid">{phase.tag}</p>
            <h3 className="mt-5 font-display text-xl font-bold uppercase leading-tight tracking-tighter">
              {phase.title}
            </h3>
            <p className="muted mt-3">{phase.body}</p>
          </article>
        ))}
      </div>

      <div className="card mt-3 p-7">
        <h3 className="font-display text-lg font-bold uppercase tracking-tighter">
          Where value would accrue
        </h3>
        <ul className="mt-5 grid gap-x-10 gap-y-3 md:grid-cols-3">
          {[
            [
              "Node staking",
              "A node locks NDC to register and a breach slashes the stake. Today a breaching node forfeits 40% of one job - about 4 NDC. With capital at stake, a public SLA promise costs something to break.",
            ],
            [
              "Protocol fee",
              "The escrow retains ~1% of each settled job, charged inside the circuit so it inherits the same confidentiality. It scales with real usage rather than speculation.",
            ],
            [
              "Metering demand",
              "Once the faucet closes, the only way to hire compute is to acquire NDC. Demand tracks compute hired on the network.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-acid" />
              <p className="muted">
                <strong className="font-semibold text-white">{title}.</strong> {body}
              </p>
            </li>
          ))}
        </ul>
        <p className="muted mt-6 border-t border-void-700 pt-5">
          Staking and the protocol fee are contract work, not yet deployed - stated as a plan rather
          than dressed up as a product. The full note, including what is live versus planned, is in{" "}
          <code className="font-mono text-acid">docs/TOKENOMICS.md</code>.
        </p>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

const FAQ = [
  {
    q: "If the price is encrypted, how does an agent choose a node?",
    a: "On everything else, which is public: the model, the hardware, the region, the uptime and latency the operator committed to, and the settled-versus-breached record those commitments actually produced. The agent commits a sealed budget ceiling and the garbled circuit enforces it against a rate nobody at the table can read. Nobody can undercut a price they cannot see, so operators compete on reliability instead - which is what the buyer wanted to buy.",
  },
  {
    q: "Who can decrypt what?",
    a: "Each confidential value is sealed once per entitled reader. A node's rate card decrypts only for its operator. A job's cost, payout, refund and workload decrypt for the two counterparties and nobody else - the contract reverts the read for anyone who is not one of them. A prompt decrypts for its sender and the node it was addressed to. An SLA manifest decrypts only for the operator that owns the certificate.",
  },
  {
    q: "Does this actually run, or is it a mock?",
    a: "It runs. All four contracts are deployed on COTI mainnet and the integration suite settles real jobs against them, asserting both that confidential values round-trip for entitled parties and that third parties get a revert. Nodes serve inference from 0G Compute when configured, so the GPU work is real too.",
  },
  {
    q: "What stops a node from lying about its uptime?",
    a: "Partly the circuit, partly nothing - and we would rather say so. Three conditions are compared in-circuit against the node's public commitments: uptime, latency, and delivered volume against what the agent ordered. Under-delivery is caught outright. But a node still reports its own uptime, so that figure is an oracle problem rather than a privacy one. TEE attestation binding into the certificate's attestation digest is the natural next layer.",
  },
  {
    q: "Why COTI rather than a rollup with ZK proofs?",
    a: "Because the computation itself has to happen over data nobody is allowed to see. A ZK proof shows a computation was performed correctly on inputs the prover already knows. Here the contract must multiply a price only the node knows by a workload only the agent knows, compare the product against a budget only the agent knows, and pay out - with no party learning the others' inputs. That is multi-party computation, and COTI's garbled circuits do it natively at the contract level.",
  },
] as const

export function Faq() {
  return (
    <Section
      id="faq"
      index="08"
      eyebrow="FAQ"
      title={
        <>
          Frequently asked
          <br />
          questions.
        </>
      }
    >
      <div className="grid gap-3">
        {FAQ.map((item, index) => (
          <details key={item.q} className="card group p-0">
            <summary className="flex cursor-pointer list-none items-start gap-5 p-6 [&::-webkit-details-marker]:hidden">
              <span className="mt-1 font-mono text-[10px] tracking-label text-acid">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="flex-1 font-display text-base font-bold uppercase leading-snug tracking-tighter sm:text-lg">
                {item.q}
              </h3>
              <span className="mt-0.5 font-mono text-lg leading-none text-acid transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="muted border-t border-void-700 px-6 py-5 sm:pl-[3.75rem]">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

/** Deployed addresses, read from the same record the dashboard and agent runtime use. */
export function Deployment() {
  let contracts: Array<[string, string]> = []

  try {
    const d = loadDeployment(DEFAULT_NETWORK)
    contracts = [
      ["NodeaCompute", d.compute],
      ["NodeaCredits", d.credits],
      ["NodeaSLA", d.sla],
      ["NodeaPromptChannel", d.promptChannel],
    ]
  } catch {
    // Not deployed on this network yet; the section simply does not render.
    return null
  }

  return (
    <Section
      index="09"
      eyebrow="Deployment"
      title={
        <>
          Live on
          <br />
          {NETWORK.name}.
        </>
      }
      lede="Open any of them. A transaction happened; there is not a number in it."
    >
      <div className="card divide-y divide-void-700">
        {contracts.map(([name, address]) => (
          <a
            key={name}
            href={explorerAddress(NETWORK, address)}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-2 px-6 py-5 transition-colors hover:bg-void-850 sm:flex-row sm:items-center sm:justify-between"
          >
            {/* Kept in camel case: "NODEAPROMPTCHANNEL" is a wall of letters, and these are
                identifiers a reader may want to match against the repo. */}
            <span className="font-display text-sm font-bold tracking-tight">{name}</span>
            <span className="scroll-x flex items-center gap-2 whitespace-nowrap font-mono text-xs text-white/40 transition-colors group-hover:text-acid">
              {address}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </span>
          </a>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

export function ClosingCta() {
  return (
    <section className="border-t border-void-600 py-20 sm:py-28">
      <div className="card-acid px-8 py-16 text-center sm:px-16 sm:py-24">
        <p className="font-mono text-[10px] uppercase tracking-label text-black/60">
          Live on COTI mainnet · compute on 0G
        </p>
        <h2 className="display mx-auto mt-7 max-w-4xl text-[clamp(2rem,5.5vw,4.5rem)]">
          It&apos;s time agents stopped publishing what they buy.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-black/70">
          Connect a wallet, derive an AES key, and watch a value go from ciphertext to plaintext in
          your own browser.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/app" className="btn-lg bg-black text-acid hover:bg-void-800">
            Launch app
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a
            className="btn-lg border border-black/25 text-black hover:bg-black/5"
            href="https://github.com/mrnetwork0001/Nodea"
            target="_blank"
            rel="noreferrer"
          >
            <Terminal className="h-4 w-4" />
            Read the contracts
          </a>
        </div>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-void-600 pt-14">
      <div className="flex flex-col gap-5 pb-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md space-y-4">
          <Wordmark className="h-8 w-auto" />
          <p className="muted">
            Apache-2.0 · built on COTI. A met SLA pays the escrow in full; a breach withholds{" "}
            {SLA_SLASH_BPS / 100}% and returns it to the agent - both amounts encrypted.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <a
            className="font-mono text-[10px] uppercase tracking-label text-white/45 hover:text-acid"
            href="https://github.com/mrnetwork0001/Nodea"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            className="font-mono text-[10px] uppercase tracking-label text-white/45 hover:text-acid"
            href={NETWORK.explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            Explorer
          </a>
          <Link
            className="font-mono text-[10px] uppercase tracking-label text-white/45 hover:text-acid"
            href="/app"
          >
            Console
          </Link>
        </div>
      </div>

      {/* The wordmark as a closing full-bleed mark, clipped by the viewport rather than scaled. */}
      <div className="overflow-hidden">
        <p
          aria-hidden
          className="display select-none text-center text-[clamp(4rem,19vw,17rem)] leading-none text-white/[0.07]"
        >
          NODEA
        </p>
      </div>
    </footer>
  )
}
