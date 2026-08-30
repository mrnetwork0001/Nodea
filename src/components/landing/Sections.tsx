/**
 * The landing page's content sections.
 *
 * All server components — the landing page reads the same protocol constants the contracts and SDK
 * use, so a slash rate or a message ceiling can never drift out of sync with what the code does.
 */
import Link from "next/link"
import { ArrowRight, Award, Coins, Cpu, KeyRound, MessageSquareLock, Terminal } from "lucide-react"
import { DEFAULT_NETWORK, NETWORKS, PROMPT_MAX_BYTES, SLA_SLASH_BPS } from "@/lib/nodea/config"

// ---------------------------------------------------------------------------

export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id?: string
  eyebrow: string
  title: string
  lede?: string
  children?: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-ink-800/60 py-16">
      <p className="label mb-3 text-seal-400/80">{eyebrow}</p>
      <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
        {title}
      </h2>
      {lede && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">{lede}</p>}
      {children && <div className="mt-8">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------

const LEAKS = [
  {
    title: "Prompt theft",
    body: "System instructions, retrieved context and reasoning traces are the agent's actual product. Sent to a compute marketplace in the clear, they are simply published — and copied by the next agent for free.",
  },
  {
    title: "Front-running",
    body: "Per-task payments reveal how much an agent pays per thousand tokens and how fast it burns. That is a live read on its strategy and its remaining runway, sitting on a public explorer.",
  },
  {
    title: "A race to the bottom",
    body: "A GPU operator cannot publish a rate card without inviting every rival to price one wei under it. Transparency pushes the market to compete on price instead of the reliability buyers actually want.",
  },
] as const

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Renting inference on a transparent chain publishes your whole business."
      lede="Three leaks, all structural, none fixable with off-chain tricks — the moment settlement touches a public ledger, the numbers are public."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {LEAKS.map((leak) => (
          <article key={leak.title} className="panel p-5">
            <h3 className="text-sm font-semibold text-slate-100">{leak.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{leak.body}</p>
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
    note: "Three conditions judged in-circuit against the node's public promises. One bit comes out: met, or not.",
  },
  {
    actor: "circuit",
    call: "payout = MpcCore.mux(slaMet, cost × 60%, cost)",
    note: "Selected inside MPC and moved as encrypted transfers. Both legs always run, so a breach and a clean job leave the same footprint — only the sealed amounts differ.",
  },
] as const

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="One job, five calls, nothing in the clear."
      lede="The agent pays a price it never learns. The node is paid an amount it discovers by decrypting its own copy. Payout plus refund always equals cost — and none of the three exists in plaintext anywhere on chain."
    >
      <ol className="space-y-2">
        {FLOW.map((step, index) => (
          <li key={step.call} className="panel flex gap-4 p-4">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-[11px] text-slate-300">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="label text-clear-400/80">{step.actor}</span>
                <code className="scroll-x whitespace-nowrap font-mono text-xs text-slate-200">
                  {step.call}
                </code>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{step.note}</p>
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
      id="skills"
      eyebrow="COTI stack"
      title="Five privacy skills, each one load-bearing."
      lede="Not five integrations bolted on for a checklist. Remove any one and the market stops working: without sealed messaging the prompt leaks, without sealed settlement the budget leaks, without the circuit there is nobody to arbitrate an SLA that neither party can see."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map(({ icon: Icon, ...skill }) => (
          <article key={skill.skill} className="panel p-5">
            <Icon className="h-4 w-4 text-seal-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-100">{skill.title}</h3>
            <code className="mt-1 block font-mono text-[10px] text-seal-400/70">{skill.skill}</code>
            <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{skill.body}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

export function Declassified() {
  return (
    <Section
      id="honest"
      eyebrow="What leaks"
      title="Exactly two bits are published on purpose."
      lede="A privacy claim with no stated limits is not a serious one. Here is the whole boundary, and both halves are checkable against the contract."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-5">
          <p className="label text-clear-400/80">Bit one · affordability</p>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">
            Did the sealed cost fit the sealed budget?
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            This discloses nothing new. The transaction either succeeds or reverts, and an observer
            learns the same bit from the outcome either way. It reveals <em>whether</em> the cost
            fit — never what either number was.
          </p>
        </article>

        <article className="panel p-5">
          <p className="label text-clear-400/80">Bit two · the SLA verdict</p>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">
            Did the node keep the promise it published?
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            A genuine disclosure, and a deliberate one: a marketplace where reliability cannot be
            verified is one nobody can safely buy in. The verdict is public, the measurements are
            not — and the payout is still selected inside the circuit from the encrypted bit.
          </p>
        </article>
      </div>

      <div className="panel mt-4 p-5">
        <h3 className="text-sm font-semibold text-slate-100">And the limits we do not paper over</h3>
        <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-slate-400 md:grid-cols-2">
          <li>
            <strong className="font-medium text-slate-300">MPC trust.</strong> Garbled-circuit
            soundness rests on COTI&apos;s network and precompile. Solidity cannot re-prove it.
          </li>
          <li>
            <strong className="font-medium text-slate-300">Metadata.</strong> The transaction graph
            and timing stay visible. Nodea protects contents and amounts, not the graph.
          </li>
          <li>
            <strong className="font-medium text-slate-300">Node-side plaintext.</strong> A prompt is
            decrypted in the node&apos;s process, because that is the only way to run it. TEE
            attestation is the natural next layer.
          </li>
          <li>
            <strong className="font-medium text-slate-300">Self-reported telemetry.</strong> The
            circuit checks a node&apos;s claims against its commitments and delivered volume, but it
            cannot independently measure a node.
          </li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          The full threat model lives in{" "}
          <code className="font-mono text-seal-400/80">docs/PRIVACY.md</code>, and{" "}
          <code className="font-mono text-seal-400/80">npm run test:live</code> asserts both
          directions against a real deployment.
        </p>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

export function Audiences() {
  return (
    <Section eyebrow="Who it is for" title="Two sides of one market.">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-5">
          <h3 className="text-sm font-semibold text-slate-100">If you run an agent</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Hire inference without publishing your prompts, your burn rate, or how much runway you
            have left. Commit a sealed ceiling and let the circuit enforce it against a price you
            never see.
          </p>
          <pre className="scroll-x mt-4 rounded-lg border border-ink-700/60 bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            <code>{`npm run agent -- "your prompt here"`}</code>
          </pre>
        </article>

        <article className="panel p-5">
          <h3 className="text-sm font-semibold text-slate-100">If you run GPUs</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Price honestly without a rival reading your rate card off the ledger. Build a portable,
            verifiable reliability record while your customers&apos; workloads stay confidential.
          </p>
          <pre className="scroll-x mt-4 rounded-lg border border-ink-700/60 bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            <code>{`npm run node-daemon`}</code>
          </pre>
        </article>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

export function ClosingCta() {
  return (
    <section className="border-t border-ink-800/60 py-16">
      <div className="panel border-seal-500/30 bg-gradient-to-br from-seal-500/10 to-transparent p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
          Agents can buy compute without publishing what they bought.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          Live on {NETWORKS[DEFAULT_NETWORK].name}. Connect a wallet, derive an AES key, and watch a
          value go from ciphertext to plaintext in your own browser.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/app" className="btn-primary">
            Launch app
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            className="btn-ghost"
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
    <footer className="border-t border-ink-800/60 py-8 text-xs text-slate-600">
      <p>
        Nodea · Apache-2.0 · built on COTI for the Web4 Vibe Code Challenge. A met SLA pays the
        escrow in full; a breach withholds {`${SLA_SLASH_BPS / 100}%`} and returns it to the agent —
        both amounts encrypted.
      </p>
    </footer>
  )
}
