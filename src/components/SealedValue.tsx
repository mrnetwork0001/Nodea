"use client"

/**
 * The signature interaction of the dashboard.
 *
 * Every confidential quantity in Nodea arrives from the chain as a ciphertext and stays one until
 * the holder of the right AES key decrypts it - in this browser, with no server involved. This
 * component shows both states of the same value so the difference is visible rather than asserted:
 * the ciphertext as it actually sits on chain, and the plaintext only the entitled party can
 * produce from it.
 *
 * Decryption failure is a first-class outcome here, not an error to hide. If you are neither
 * counterparty, the contract reverts the read; if you have no AES key, there is nothing to decrypt
 * with. Both cases render as "sealed to you", which is the honest answer.
 */
import { Eye, Lock } from "lucide-react"
import { useState } from "react"
import { Spinner } from "./ui"

export type SealedFetcher = () => Promise<{ ciphertext: string; plaintext: string } | null>

export function SealedValue({
  label,
  fetcher,
  disabled,
  disabledHint = "Onboard to derive your AES key first",
}: {
  label: string
  fetcher: SealedFetcher
  disabled?: boolean
  disabledHint?: string
}) {
  const [state, setState] = useState<"idle" | "loading" | "revealed" | "sealed">("idle")
  const [ciphertext, setCiphertext] = useState<string | null>(null)
  const [plaintext, setPlaintext] = useState<string | null>(null)

  const reveal = async () => {
    setState("loading")
    try {
      const result = await fetcher()
      if (!result) {
        setState("sealed")
        return
      }
      setCiphertext(result.ciphertext)
      setPlaintext(result.plaintext)
      setState("revealed")
    } catch {
      setState("sealed")
    }
  }

  return (
    <div className="rounded-xl border border-void-600 bg-void-950 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {state === "idle" && (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-acid transition-colors hover:text-acid-400 disabled:opacity-35"
            onClick={reveal}
            disabled={disabled}
            title={disabled ? disabledHint : "Decrypt locally with your AES key"}
          >
            <Eye className="h-3 w-3" />
            decrypt
          </button>
        )}
        {state === "loading" && <Spinner className="h-3 w-3 text-acid" />}
      </div>

      {state === "idle" && (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-sm text-white/25">
          <Lock className="h-3 w-3" />
          sealed
        </p>
      )}

      {state === "sealed" && (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-white/25">
          <Lock className="h-3 w-3" />
          sealed to you
        </p>
      )}

      {state === "revealed" && (
        <>
          <p className="plaintext mt-1.5 text-base">{plaintext}</p>
          {ciphertext && (
            <p className="scroll-x mt-1.5 whitespace-nowrap font-mono text-[10px] text-white/20">
              on chain: {ciphertext}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Compact rendering of a ctUint256 for the "what the chain stores" line. */
export function formatCiphertext(value: { ciphertextHigh: bigint; ciphertextLow: bigint }): string {
  const hex = (part: bigint) => `0x${part.toString(16).padStart(64, "0")}`
  return `${hex(value.ciphertextHigh).slice(0, 22)}… ${hex(value.ciphertextLow).slice(0, 22)}…`
}
