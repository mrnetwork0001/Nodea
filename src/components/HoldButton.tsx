"use client"

/**
 * A button that has to be held down to fire.
 *
 * For actions where a single click is too cheap for the consequence - revealing a private key,
 * destroying one - the value is not friction for its own sake. It is that the action becomes
 * *deliberate* and, crucially, *abortable*: the progress is visible the whole way and releasing
 * early cancels with nothing done.
 *
 * The duration is tuned rather than maximised. Below about a second the gesture reads as a slow
 * click and stops feeling intentional; much past two it stops feeling like a control and starts
 * feeling like a punishment. `HOLD_MS` sits where the action is unmistakably chosen and still
 * pleasant to perform.
 *
 * Driven by `requestAnimationFrame` rather than a CSS transition, so releasing mid-hold can rewind
 * from wherever it actually got to instead of snapping.
 *
 * The label deliberately does not change while held. Swapping it for "keep holding" resizes the
 * button under the finger already pressing it, which reads as a glitch; the sweeping fill is the
 * feedback, and it does not move the target.
 */
import { useCallback, useEffect, useRef, useState } from "react"

export const HOLD_MS = 1800

export function HoldButton({
  label,
  duration = HOLD_MS,
  tone = "danger",
  icon,
  onComplete,
}: {
  label: string
  duration?: number
  tone?: "danger" | "acid"
  icon?: React.ReactNode
  onComplete: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)

  const frame = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)
  const fired = useRef(false)

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    startedAt.current = null
  }, [])

  useEffect(() => stop, [stop])

  const release = useCallback(() => {
    stop()
    setHolding(false)
    // Rewind rather than snap, so an aborted hold reads as "cancelled" instead of "glitched".
    setProgress(0)
  }, [stop])

  const begin = useCallback(() => {
    if (holding || fired.current) return

    setHolding(true)
    startedAt.current = performance.now()

    const tick = (now: number) => {
      if (startedAt.current === null) return

      const next = Math.min(1, (now - startedAt.current) / duration)
      setProgress(next)

      if (next >= 1) {
        fired.current = true
        stop()
        setHolding(false)
        onComplete()
        // Let the caller unmount or change state before this can be re-triggered.
        window.setTimeout(() => {
          fired.current = false
          setProgress(0)
        }, 150)
        return
      }

      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
  }, [holding, duration, onComplete, stop])

  const filled = Math.round(progress * 100)

  return (
    <button
      type="button"
      // `touch-none` stops a long press from scrolling the page out from under the gesture.
      className={`btn-sm relative touch-none select-none overflow-hidden ${
        tone === "danger"
          ? "border border-alert/50 text-alert"
          : "border border-acid/50 text-acid"
      }`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        begin()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      // A long press on touch otherwise raises the context menu mid-gesture.
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          begin()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") release()
      }}
      onBlur={release}
      // `aria-value*` belongs to progressbar, not button. The interaction is described in the
      // label instead, and the fill is supplementary rather than the only signal.
      aria-label={`${label}. Press and hold to confirm.`}
    >
      {/* The fill is the progress indicator; the label sits above it and inverts as it passes. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 ${tone === "danger" ? "bg-alert" : "bg-acid"}`}
        style={{ width: `${filled}%`, transition: holding ? "none" : "width 220ms ease-out" }}
      />
      <span
        className="relative z-10 flex items-center gap-2 transition-colors"
        // Flip to black once the fill is under most of the text, so the label stays legible
        // against its own progress indicator rather than fighting it.
        style={{ color: filled > 52 ? "#000" : undefined }}
      >
        {icon}
        {label}
      </span>
    </button>
  )
}
