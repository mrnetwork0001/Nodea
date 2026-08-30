import Link from "next/link"

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#stack", label: "COTI stack" },
  { href: "#leaks", label: "What leaks" },
  { href: "#token", label: "NDC" },
  { href: "#faq", label: "FAQ" },
] as const

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-void-600 bg-void/85 backdrop-blur-md">
      <nav className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-acid" />
          <span className="font-display text-lg font-extrabold uppercase tracking-tighter">
            Nodea
          </span>
        </Link>

        {/* Kept on one scrollable row rather than hidden below a breakpoint: with no button
            beside it, hiding these would leave the bar empty on a phone. */}
        <ul className="scroll-x flex min-w-0 items-center justify-end gap-5 sm:gap-8">
          {LINKS.map((link) => (
            <li key={link.href} className="shrink-0">
              <a
                href={link.href}
                className="font-mono text-[10px] uppercase tracking-label text-white/45 transition-colors hover:text-acid"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
