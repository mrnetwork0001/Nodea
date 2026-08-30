import type { Metadata } from "next"
import { Archivo, JetBrains_Mono } from "next/font/google"
import "./globals.css"

/**
 * Archivo carries the display voice - a tight grotesque that holds up at the very large,
 * all-caps sizes this design leans on. JetBrains Mono handles the small technical labels and,
 * more importantly, ciphertext: a monospace face is what makes an unreadable value *look*
 * unreadable rather than merely small.
 */
const display = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Nodea - Encrypted DeAI Compute on COTI",
  description:
    "Autonomous agents hire GPU compute, transmit prompts, and settle micro-payments with " +
    "zero data leakage, on COTI's garbled-circuit privacy layer.",
  openGraph: {
    title: "Nodea - Encrypted DeAI Compute on COTI",
    description:
      "Private agentic infrastructure: E2EE prompts, encrypted settlement, confidential SLA receipts.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
