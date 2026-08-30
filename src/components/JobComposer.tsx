"use client"

/**
 * Hiring a node, in the three transactions it actually takes.
 *
 * The step list is not decoration — each row is a real transaction with a real explorer link, and
 * showing them separately is the point. A reviewer watching this run can see the prompt get sealed
 * before any money moves, the allowance get set as a ciphertext rather than a number, and the cost
 * get computed inside the circuit from a rate the agent never fetched.
 */
import { ArrowRight, Lock, Send } from "lucide-react"
import { useMemo, useState } from "react"
import { formatCredits, parseCredits, PROMPT_MAX_BYTES } from "@/lib/nodea/config"
import * as compute from "@/lib/nodea/compute"
import * as credits from "@/lib/nodea/credits"
import * as messaging from "@/lib/nodea/messaging"
import type { NodeListing } from "@/lib/nodea/types"
import { useWallet } from "@/lib/wallet"
import { ErrorNote, Panel, Spinner, TxLink } from "./ui"

type StepKey = "prompt" | "approve" | "open"

interface Step {
  key: StepKey
  title: string
  detail: string
  skill: string
}

const STEPS: Step[] = [
  {
    key: "prompt",
    title: "Seal the prompt",
    detail: "Encrypted for this node's AES key and posted to the private channel.",
    skill: "coti-private-messaging",
  },
  {
    key: "approve",
    title: "Approve an encrypted ceiling",
    detail: "The allowance itself is a ciphertext. The cost is never computed off chain.",
    skill: "coti-private-erc20",
  },
  {
    key: "open",
    title: "Open the escrow",
    detail: "cost = sealed(price) x sealed(workload), checked against your sealed budget.",
    skill: "coti-smart-contracts",
  },
]

interface StepState {
  status: "idle" | "running" | "done"
  txHash?: string
  note?: string
}

const DEFAULT_PROMPT =
  "SYSTEM: You are a private research agent. Summarise counterparty risk in the attached " +
  "lending position and propose a hedge. Do not disclose the position."

export function JobComposer({
  node,
  onJobOpened,
}: {
  node: NodeListing | null
  onJobOpened: () => void
}) {
  const { signer, status, deployment, network } = useWallet()

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [kTokens, setKTokens] = useState("12")
  const [budget, setBudget] = useState("25")
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    prompt: { status: "idle" },
    approve: { status: "idle" },
    open: { status: "idle" },
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)

  const promptBytes = useMemo(() => messaging.promptByteLength(prompt), [prompt])
  const oversized = promptBytes > PROMPT_MAX_BYTES

  const ready = status === "ready" && signer && deployment && node && !oversized
  const disabledReason = !node
    ? "Select a node from the fleet above."
    : status !== "ready"
      ? "Connect your wallet and derive an AES key first."
      : oversized
        ? `Prompt is ${promptBytes} bytes; a single COTI private message holds ${PROMPT_MAX_BYTES}.`
        : null

  const mark = (key: StepKey, state: StepState) =>
    setSteps((current) => ({ ...current, [key]: state }))

  const run = async () => {
    if (!ready || !signer || !deployment || !node) return

    setBusy(true)
    setError(null)
    setJobId(null)
    setSteps({ prompt: { status: "idle" }, approve: { status: "idle" }, open: { status: "idle" } })

    try {
      const workload = BigInt(kTokens || "0")
      const ceiling = parseCredits(budget || "0")
      if (workload <= 0n) throw new Error("Workload must be at least 1k tokens.")
      if (ceiling <= 0n) throw new Error("Budget must be greater than zero.")

      mark("prompt", { status: "running" })
      const sealed = await messaging.sendPrompt(signer, deployment.promptChannel, node.operator, prompt)
      mark("prompt", {
        status: "done",
        txHash: sealed.txHash,
        note: `message #${sealed.messageId}, ${sealed.chunks} encrypted chunks`,
      })

      mark("approve", { status: "running" })
      const approval = await credits.approveSpender(
        signer,
        deployment.credits,
        deployment.compute,
        ceiling,
      )
      mark("approve", {
        status: "done",
        txHash: approval.txHash,
        note: `ceiling ${formatCredits(ceiling)} NDC, encrypted`,
      })

      mark("open", { status: "running" })
      const job = await compute.openJob(signer, deployment.compute, {
        nodeId: node.id,
        kTokens: workload,
        maxBudget: ceiling,
        promptMessageId: sealed.messageId,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      })
      mark("open", { status: "done", txHash: job.txHash, note: `job #${job.jobId}` })

      setJobId(job.jobId)
      onJobOpened()
    } catch (cause) {
      setError(describe(cause))
      setSteps((current) => {
        const next = { ...current }
        for (const key of Object.keys(next) as StepKey[]) {
          if (next[key].status === "running") next[key] = { status: "idle" }
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Hire encrypted compute"
      subtitle={
        node
          ? `Node #${node.id} · ${node.modelId} · ${node.gpuClass}`
          : "Select a node from the fleet to begin."
      }
    >
      <div className="space-y-4 p-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="nodea-prompt" className="eyebrow">
              Prompt
            </label>
            <span className={`text-[11px] ${oversized ? "text-alert" : "text-white/40"}`}>
              {promptBytes} / {PROMPT_MAX_BYTES} bytes
            </span>
          </div>
          <textarea
            id="nodea-prompt"
            className="field h-28 resize-none font-mono text-xs leading-relaxed"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Your agent's system instructions…"
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
            <Lock className="h-3 w-3 text-acid/70" />
            {node
              ? `Encrypted in this browser. Only node #${node.id} can decrypt it.`
              : "Encrypted in this browser, for whichever node you hire."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nodea-workload" className="eyebrow mb-2 block">
              Workload (k tokens)
            </label>
            <input
              id="nodea-workload"
              className="field font-mono"
              inputMode="numeric"
              value={kTokens}
              onChange={(event) => setKTokens(event.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label htmlFor="nodea-budget" className="eyebrow mb-2 block">
              Max budget (NDC)
            </label>
            <input
              id="nodea-budget"
              className="field font-mono"
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        </div>

        <ol className="space-y-2">
          {STEPS.map((step, index) => {
            const state = steps[step.key]
            return (
              <li
                key={step.key}
                className={`flex gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  state.status === "done"
                    ? "border-acid/40 bg-acid/5"
                    : state.status === "running"
                      ? "border-acid/50 bg-acid/5"
                      : "border-void-600 bg-void-850"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    state.status === "done"
                      ? "bg-acid/20 text-acid"
                      : "bg-void-700 text-white/45"
                  }`}
                >
                  {state.status === "running" ? <Spinner className="h-3 w-3" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-medium text-white">{step.title}</p>
                    <code className="text-[10px] text-acid/70">{step.skill}</code>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">{step.detail}</p>
                  {state.note && (
                    <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-acid">
                      {state.note}
                      {state.txHash && <TxLink hash={state.txHash} network={network} />}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

        {jobId !== null && (
          <div className="rounded-lg border border-acid/40 bg-acid/10 px-4 py-3">
            <p className="text-xs text-acid">
              Job #{jobId} is escrowed. The node will decrypt the prompt, run it, and submit sealed
              proof of execution — the circuit decides the payout.
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn-lg btn-acid w-full"
          onClick={() => void run()}
          disabled={!ready || busy}
          title={disabledReason ?? undefined}
        >
          {busy ? <Spinner /> : <Send className="h-4 w-4" />}
          {busy ? "Sealing and escrowing…" : "Hire node"}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </button>

        {disabledReason && !busy && (
          <p className="text-center text-[11px] text-white/40">{disabledReason}</p>
        )}
      </div>
    </Panel>
  )
}

function describe(cause: unknown): string {
  if (typeof cause === "object" && cause !== null) {
    const error = cause as { shortMessage?: string; reason?: string; message?: string }
    const raw = error.shortMessage ?? error.reason ?? error.message ?? "Transaction failed."

    // The one revert worth translating: the circuit found the sealed cost above the sealed budget.
    if (raw.includes("BudgetExceeded")) {
      return "The node's price for this workload exceeds your sealed budget. The circuit rejected it without revealing either number — raise the budget or pick another node."
    }
    return raw
  }
  return String(cause)
}
