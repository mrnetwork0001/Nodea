"use client"

/**
 * The hero's product card: settled jobs, as the chain actually stored them.
 *
 * The headline states the problem in words; this states it in evidence. Every row a competitor
 * would want - the rate card, the budget, what it cost, what the node earned - is present, named,
 * and unreadable.
 *
 * It moves for a reason rather than for decoration. The ciphertext re-garbles continuously, which
 * is the one property of a sealed value you can actually show rather than assert; and the card
 * cycles through jobs, so the marketplace reads as having traffic. What deliberately does *not*
 * move is the disclosure row: node, model and verdict change, the rest stays noise, and the two
 * public facts stay exactly two. A viewer who watches for ten seconds has read the privacy model
 * without reading a word of it.
 *
 * Node-to-model pairings are the real mainnet registry (node 5 is `claude-opus-5`, node 21 is
 * `glm-5.3-flash`); the hardware, region and ciphertext are representative, the same way
 * `LedgerCompare` is. A `ctUint256` really does take this shape on chain.
 */
import { useEffect, useRef, useState } from "react"
import { Lock } from "lucide-react"

const SEALED_ROWS = ["rate card", "budget", "cost", "payout"] as const

/**
 * Server-rendered ciphertext. Fixed rather than random so the markup the server sends matches the
 * client's first render - scrambling starts in an effect, after hydration has already agreed.
 */
const INITIAL = [
  "ctUint256[0x41c9…7ab4]",
  "ctUint256[0x0d52…9e18]",
  "ctUint256[0xbb07…4f6d]",
  "ctUint256[0x77e1…b093]",
] as const

/** One breach in four, which is roughly the live ratio - 8 of 10 settled jobs kept their SLA. */
const JOBS = [
  { id: 10, node: "05", model: "claude-opus-5", host: "h100 · eu-west", met: true },
  { id: 9, node: "21", model: "glm-5.3-flash", host: "a100 · us-east", met: true },
  { id: 6, node: "16", model: "deepseek-v4-pro", host: "h200 · ap-south", met: false },
  { id: 3, node: "26", model: "gpt-5.5", host: "h100 · us-west", met: true },
] as const

const SCRAMBLE_MS = 70
const CYCLE_MS = 3_800
const FADE_MS = 260

const HEX = "0123456789abcdef"
const hex = (length: number) =>
  Array.from({ length }, () => HEX[Math.floor(Math.random() * HEX.length)]).join("")
const sealed = () => `ctUint256[0x${hex(4)}…${hex(4)}]`

export function HeroReceipt() {
  const [values, setValues] = useState<readonly string[]>(INITIAL)
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const swap = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    // Motion here is meaningful, not decorative - but a viewer who has asked the OS for stillness
    // still gets a legible card, just a frozen one.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    // One row re-garbles per tick rather than all four, so it shimmers instead of strobing.
    let cursor = 0
    const scramble = setInterval(() => {
      const row = cursor++ % SEALED_ROWS.length
      setValues((previous) => previous.map((value, i) => (i === row ? sealed() : value)))
    }, SCRAMBLE_MS)

    const cycle = setInterval(() => {
      setVisible(false)
      swap.current = setTimeout(() => {
        setIndex((current) => (current + 1) % JOBS.length)
        setVisible(true)
      }, FADE_MS)
    }, CYCLE_MS)

    return () => {
      clearInterval(scramble)
      clearInterval(cycle)
      clearTimeout(swap.current)
    }
  }, [])

  const job = JOBS[index]
  const fade = `transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`

  return (
    <div className="card p-5 sm:p-6">
      {/* ---- status line ---- */}
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-label text-white/45">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acid opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acid" />
          </span>
          <span className={fade}>job #{job.id} · settled</span>
        </p>
        <span
          className={`chip ${fade} ${
            job.met
              ? "border-acid/35 bg-acid/10 text-acid"
              : "border-alert/35 bg-alert/10 text-alert"
          }`}
        >
          {job.met ? "sla met" : "sla breached"}
        </span>
      </div>

      {/* ---- what the two parties can read, and nobody else ---- */}
      <div className="mt-5 rounded-xl border border-void-600 bg-void-950 p-4">
        <div
          className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${fade}`}
        >
          <p className="font-mono text-xs text-acid">
            node {job.node} · {job.model}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-label text-white/30">{job.host}</p>
        </div>
        <p className="mt-3 font-mono text-xs leading-relaxed text-white/45">
          prompt <span className="text-white/25">→ sealed for this node alone</span>
          <br />
          answer <span className="text-white/25">→ sealed for the agent alone</span>
        </p>
      </div>

      {/* ---- the numbers a competitor would trade on ---- */}
      <dl className="mt-5 space-y-2.5">
        {SEALED_ROWS.map((label, i) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-label text-white/35">
              {label}
            </dt>
            <dd className="ciphertext flex items-center gap-2">
              <Lock className="h-3 w-3 shrink-0 text-white/20" />
              {/* `tabular-nums` keeps the row from twitching sideways as the digits change. */}
              <span className="tabular-nums">{values[i]}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* ---- the entire disclosure surface, in one row ---- */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-void-600 bg-void-850 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-white/40">
          what an observer learns
        </p>
        <p
          className={`font-mono text-[10px] uppercase tracking-label ${fade} ${
            job.met ? "text-acid" : "text-alert"
          }`}
        >
          a job happened · {job.met ? "sla met" : "sla breached"}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-void-700 pt-4 font-mono text-[10px] uppercase tracking-label text-white/25">
        <span>coti mainnet · garbled circuit</span>
        <span>2 bits declassified</span>
      </div>
    </div>
  )
}
