"use client"

/**
 * The landing header.
 *
 * Below `md` the links collapse behind a hamburger. The previous approach kept them on one
 * scrollable row, which on a phone rendered as a line of text clipped at both edges - it looked
 * broken rather than scrollable, and nothing about it suggested you could scroll.
 *
 * The panel closes on selection, because every link here is an in-page anchor: leaving it open
 * would cover the section the reader just jumped to.
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { Wordmark } from "@/components/Wordmark"

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#layers", label: "Architecture" },
  { href: "#how", label: "How it works" },
  { href: "#stack", label: "COTI stack" },
  { href: "#leaks", label: "What leaks" },
  { href: "#token", label: "NDC" },
  { href: "#faq", label: "FAQ" },
] as const

export function LandingNav() {
  const [open, setOpen] = useState(false)

  // Escape closes it, matching every other dismissible surface in the app.
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-void-600 bg-void/85 backdrop-blur-md">
      <nav className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <Wordmark className="h-7 w-auto sm:h-8" priority />
        </Link>

        <ul className="hidden items-center gap-6 md:flex lg:gap-8">
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

        <button
          type="button"
          className="-mr-2 flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-[5px] md:hidden"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="nodea-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {/* Three bars that fold into a cross, so the control shows its own state. */}
          <span
            className={`block h-px w-5 bg-white transition-transform duration-200 ${
              open ? "translate-y-[6px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-opacity duration-200 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-transform duration-200 ${
              open ? "-translate-y-[6px] -rotate-45" : ""
            }`}
          />
        </button>
      </nav>

      <div id="nodea-mobile-nav" hidden={!open} className="border-t border-void-600 bg-void md:hidden">
        <ul className="shell flex flex-col py-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="block border-b border-void-700/60 py-3.5 font-mono text-[11px] uppercase tracking-label text-white/60 transition-colors last:border-0 hover:text-acid"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  )
}
