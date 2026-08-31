/**
 * The Nodea wordmark.
 *
 * The mark earns its place over the plain type it replaces because it states the product's whole
 * claim in one glyph: an N with a redaction bar struck through it. Compute you can see happening,
 * over a value you cannot read.
 *
 * The source lockup carries a tagline under the wordmark. It is 31px tall in a 437px artwork, so
 * at any header or footer size it renders as an illegible grey smudge rather than as words - it is
 * masked out of the shipped asset. The tagline belongs at social-card scale, not in 32 pixels of
 * chrome.
 *
 * The asset is keyed to transparency rather than left on its black plate, because the console
 * header is `bg-void/85` over a blur: an opaque tile there reads as a solid patch whenever content
 * scrolls beneath it.
 */
import Image from "next/image"

export function Wordmark({
  className = "h-8 w-auto",
  priority = false,
}: {
  className?: string
  /** Set on the header instances, which are above the fold and should not lazy-load. */
  priority?: boolean
}) {
  return (
    <Image
      src="/nodea-wordmark.png"
      alt="Nodea"
      width={800}
      height={202}
      priority={priority}
      className={className}
    />
  )
}
