import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#stack", label: "COTI stack" },
  { href: "#leaks", label: "What leaks" },
  { href: "#faq", label: "FAQ" },
] as const

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-void-600 bg-void/85 backdrop-blur-md">
      <nav className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-acid" />
          <span className="font-display text-lg font-extrabold uppercase tracking-tighter">
            Nodea
          </span>
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-mono text-[10px] uppercase tracking-label text-white/45 transition-colors hover:text-acid"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
            <span className="font-mono text-[10px] uppercase tracking-label text-white/45">
              Live on COTI mainnet
            </span>
          </span>
          <Link href="/app" className="btn-sm btn-acid">
            Launch app
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>
    </header>
  )
}
