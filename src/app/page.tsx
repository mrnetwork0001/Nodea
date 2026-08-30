import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Terminal } from "lucide-react"
import { LandingNav } from "@/components/landing/LandingNav"
import { LedgerCompare } from "@/components/landing/LedgerCompare"
import {
  Audiences,
  ClosingCta,
  Declassified,
  HowItWorks,
  LandingFooter,
  Problem,
  Skills,
} from "@/components/landing/Sections"

export const metadata: Metadata = {
  title: "Nodea — AI agents buy GPU compute without publishing what they bought",
  description:
    "Encrypted DeAI compute on COTI. Prompts sealed per node, fees settled as ciphertext, and SLAs " +
    "judged inside a garbled circuit that never sees a plaintext price.",
}

export default function Landing() {
  return (
    <>
      <LandingNav />

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-seal-500/40 bg-seal-500/10 px-3 py-1 text-[11px] font-medium text-seal-400">
            COTI garbled circuits · MPC · Web4 agentic infrastructure
          </p>

          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight text-slate-50 sm:text-5xl">
            AI agents can now buy GPU compute without publishing what they bought.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">
            Nodea is an encrypted compute marketplace built natively on COTI. Agents hire GPU nodes,
            transmit prompts, and settle micro-payments — with the prompt, the rate card, the budget
            and every balance held as garbled ciphertext, on chain, permanently.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
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

          <div className="mt-14">
            <LedgerCompare />
            <p className="mt-4 text-xs text-slate-500">
              Same marketplace, same explorer, same five fields. The right-hand column is what a
              COTI block explorer actually returns for a settled Nodea job.
            </p>
          </div>
        </section>

        <Problem />
        <HowItWorks />
        <Skills />
        <Declassified />
        <Audiences />
        <ClosingCta />
        <LandingFooter />
      </main>
    </>
  )
}
