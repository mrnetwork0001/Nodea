import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Nodea — Encrypted DeAI Compute on COTI",
  description:
    "Autonomous agents hire GPU compute, transmit prompts, and settle micro-payments with " +
    "zero data leakage, on COTI's garbled-circuit privacy layer.",
  openGraph: {
    title: "Nodea — Encrypted DeAI Compute on COTI",
    description:
      "Private agentic infrastructure: E2EE prompts, encrypted settlement, confidential SLA receipts.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
