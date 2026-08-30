import type { Metadata } from "next"
import { WalletProvider } from "@/lib/wallet"

export const metadata: Metadata = {
  title: "Nodea Console — Encrypted DeAI compute on COTI",
  description:
    "Hire GPU nodes, seal prompts for a single operator, and settle in encrypted NDC on COTI testnet.",
}

/**
 * The wallet session is scoped to the console, not the whole site.
 *
 * Keeping `WalletProvider` out of the root layout means the marketing page ships none of ethers,
 * the COTI SDK, or the provider tree — it is a static document, and loads like one.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
