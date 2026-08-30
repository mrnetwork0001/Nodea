"use client"

/**
 * A confirmation dialog in the app's own voice.
 *
 * Built on the native `<dialog>` element rather than a hand-rolled overlay, which buys the
 * behaviour that is tedious to get right and easy to get wrong: focus moves into the dialog and is
 * trapped there, Escape closes it, the rest of the page becomes inert, and the backdrop is a real
 * pseudo-element instead of a div that has to be kept in sync.
 *
 * `showModal()` cannot be called during render, so opening is driven from an effect.
 */
import { AlertTriangle } from "lucide-react"
import { useEffect, useRef } from "react"
import { HoldButton } from "./HoldButton"

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Kept as a node so callers can emphasise the part that matters. */
  body: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** `danger` colours the confirm action and shows a warning mark. */
  tone?: "default" | "danger"
  /**
   * Require the confirm action to be held rather than clicked.
   *
   * For consequences a click is too cheap for - exposing a key, destroying one - this makes the
   * action deliberate and, more usefully, abortable partway through.
   */
  holdToConfirm?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  holdToConfirm = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // Escape and the backdrop's implicit dismissal both surface here.
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={(event) => {
        // A click landing on the dialog itself rather than its content is a backdrop click.
        if (event.target === ref.current) onCancel()
      }}
      className="nodea-dialog"
      aria-labelledby="nodea-dialog-title"
    >
      <div className="w-[min(28rem,calc(100vw-2.5rem))] p-7">
        <div className="flex items-start gap-3">
          {tone === "danger" && (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert" aria-hidden />
          )}
          <h2
            id="nodea-dialog-title"
            className="font-display text-lg font-bold uppercase leading-tight tracking-tighter text-white"
          >
            {title}
          </h2>
        </div>

        <div className="muted mt-4 space-y-2">{body}</div>

        {holdToConfirm && (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-label text-white/30">
            Press and hold to confirm - release to cancel
          </p>
        )}

        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-sm btn-outline" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          {holdToConfirm ? (
            <HoldButton
              label={confirmLabel}
              tone={tone === "danger" ? "danger" : "acid"}
              onComplete={onConfirm}
            />
          ) : (
            <button
              type="button"
              className={tone === "danger" ? "btn-sm btn-danger" : "btn-sm btn-acid"}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
