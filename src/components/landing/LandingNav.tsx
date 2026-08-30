import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"

const LINKS = [
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#skills", label: "COTI stack" },
  { href: "#honest", label: "What leaks" },
] as const

export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800/70 bg-ink-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-seal-500 to-clear-500">
            <ShieldCheck className="h-4 w-4 text-ink-950" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight text-slate-100">Nodea</span>
            <span className="block text-[11px] text-slate-500">Encrypted DeAI compute on COTI</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a className="text-xs text-slate-400 transition-colors hover:text-slate-200" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <Link href="/app" className="btn-primary !py-1.5 text-xs">
          Launch app
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>
    </header>
  )
}
