import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Terminal } from "lucide-react"
import { LandingNav } from "@/components/landing/LandingNav"
import { LedgerCompare } from "@/components/landing/LedgerCompare"
import {
  Audiences,
  ClosingCta,
  Declassified,
  Deployment,
  Faq,
  HowItWorks,
  LandingFooter,
  Problem,
  Skills,
  Token,
} from "@/components/landing/Sections"

export const metadata: Metadata = {
  title: "Nodea - AI agents buy GPU compute without publishing what they bought",
  description:
    "Encrypted DeAI compute on COTI. Prompts sealed per node, fees settled as ciphertext, and SLAs " +
    "judged inside a garbled circuit that never sees a plaintext price.",
}

/** The COTI skills the protocol exercises, cycled as a ticker under the hero. */
const MARQUEE = [
  "coti-account-setup",
  "coti-private-messaging",
  "coti-private-erc20",
  "coti-private-nft",
  "coti-smart-contracts",
  "garbled circuits",
  "MPC",
] as const

export default function Landing() {
  return (
    <>
      <LandingNav />

      <main>
        {/* ---- hero ---- */}
        <section className="shell pb-14 pt-16 sm:pt-24">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="eyebrow mb-7 flex items-center gap-3">
                <span className="text-acid">00</span>
                <span className="h-px w-8 bg-void-500" />
                Encrypted DeAI compute
              </p>
              <h1 className="display-xl">
                AI agents buy GPU compute
                <br />
                without <span className="text-acid">publishing</span>
                <br />
                what they bought.
              </h1>
            </div>

            <div className="max-w-sm shrink-0">
              <p className="lede">
                Nodea is an encrypted compute marketplace built natively on COTI. Agents hire GPU
                nodes, transmit prompts and settle micro-payments - with the prompt, the rate card,
                the budget and every balance held as garbled ciphertext, on chain, permanently.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/app" className="btn-lg btn-acid">
                  Launch app
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <a
                  className="btn-lg btn-outline"
                  href="https://github.com/mrnetwork0001/Nodea"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Terminal className="h-4 w-4" />
                  Contracts
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ---- skill ticker ---- */}
        <div className="overflow-hidden border-y border-void-600 py-4">
          <div className="flex w-max animate-marquee gap-10 pr-10">
            {[...MARQUEE, ...MARQUEE].map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="flex shrink-0 items-center gap-10 font-mono text-[10px] uppercase tracking-label text-white/35"
              >
                {item}
                <span className="h-1 w-1 rounded-full bg-acid" />
              </span>
            ))}
          </div>
        </div>

        <div className="shell">
          {/* ---- the thesis, as one picture ---- */}
          <section className="py-14 sm:py-20">
            <LedgerCompare />
            <p className="muted mt-5 max-w-2xl">
              Same marketplace, same explorer, same five fields. The right-hand column is what a COTI
              block explorer actually returns for a settled Nodea job.
            </p>
          </section>

          <Problem />
          <HowItWorks />
          <Skills />
          <Declassified />
          <Audiences />
          <Token />
          <Faq />
          <Deployment />
          <ClosingCta />
          <LandingFooter />
        </div>
      </main>
    </>
  )
}
