/**
 * Off-chain unit tests.
 *
 * Everything that touches COTI's MPC precompile has to run against COTI itself — a Hardhat
 * network has no precompile at `MPC_PRECOMPILE`, so a "passing" local test of a garbled circuit
 * would be testing nothing at all. Those paths are covered by `test/integration.test.ts`, which
 * runs against live testnet.
 *
 * What is testable here is the layer that decides *what* gets sealed: the prompt packing that has
 * to survive COTI's 8-byte cell format, the credit arithmetic, the manifest codec, and the
 * reputation scoring an agent uses to pick a node it cannot price.
 */
import { expect } from "chai"
import { chunkPrompt, promptByteLength } from "../src/lib/nodea/messaging"
import { PROMPT_BYTES_PER_CHUNK, PROMPT_MAX_BYTES, formatCredits, parseCredits } from "../src/lib/nodea/config"
import { buildManifest, parseManifest } from "../src/lib/nodea/sla"
import { reliability, score } from "../src/lib/nodea/reputation"
import type { NodeListing } from "../src/lib/nodea/types"

const UTF8 = new TextEncoder()

function listing(overrides: Partial<NodeListing> = {}): NodeListing {
  return {
    id: 1,
    operator: "0x0000000000000000000000000000000000000001",
    active: true,
    modelId: "llama-3.3-70b-instruct",
    gpuClass: "H100-80GB",
    region: "eu-central",
    promisedUptimeBps: 9_900,
    promisedLatencyMs: 500,
    registeredAt: 0,
    jobsSettled: 0,
    jobsBreached: 0,
    ...overrides,
  }
}

describe("prompt packing", () => {
  it("keeps every chunk inside one itString", () => {
    const prompt = "a".repeat(500)
    for (const chunk of chunkPrompt(prompt)) {
      expect(UTF8.encode(chunk).length).to.be.at.most(PROMPT_BYTES_PER_CHUNK)
    }
  })

  it("round-trips ASCII exactly", () => {
    const prompt = "SYSTEM: rank ETH/USDC pools by fee yield net of gas. Flag depth drops >30%."
    expect(chunkPrompt(prompt).join("")).to.equal(prompt)
  })

  it("round-trips multi-byte text without splitting a code point", () => {
    // The failure this guards against is real: slicing UTF-8 at a fixed 24-byte stride cuts these
    // characters in half, and because chunks are decrypted independently the halves come back as
    // replacement characters instead of the original text.
    const prompt = "予算は秘密です 🔐 résumé confidentiel — приватность 🛡️".repeat(4)
    const chunks = chunkPrompt(prompt)

    expect(chunks.join("")).to.equal(prompt)
    for (const chunk of chunks) {
      expect(UTF8.encode(chunk).length).to.be.at.most(PROMPT_BYTES_PER_CHUNK)
      // Each chunk must decode standalone, since that is how the recipient reads them.
      expect(new TextDecoder("utf-8", { fatal: true }).decode(UTF8.encode(chunk))).to.equal(chunk)
    }
  })

  it("rejects a prompt above the contract's message ceiling", () => {
    expect(() => chunkPrompt("x".repeat(PROMPT_MAX_BYTES + 1))).to.throw(/at most/)
  })

  it("accepts a prompt exactly at the ceiling", () => {
    const prompt = "x".repeat(PROMPT_MAX_BYTES)
    expect(chunkPrompt(prompt).join("")).to.equal(prompt)
  })

  it("strips NUL bytes, which the padding scheme cannot represent", () => {
    // Trailing zeros are stripped on decrypt as padding, so a literal NUL would not survive.
    expect(chunkPrompt("a\0b").join("")).to.equal("ab")
    expect(promptByteLength("a\0b")).to.equal(2)
  })

  it("handles an empty prompt", () => {
    expect(chunkPrompt("")).to.deep.equal([""])
  })
})

describe("credit amounts", () => {
  it("round-trips decimal amounts at 6 decimals", () => {
    for (const amount of ["0", "1", "0.5", "25", "0.000001", "1234.567891"]) {
      expect(formatCredits(parseCredits(amount))).to.equal(String(Number(amount)))
    }
  })

  it("truncates beyond 6 decimals rather than rounding up into money that does not exist", () => {
    expect(parseCredits("1.2345678")).to.equal(1_234_567n)
  })

  it("rejects non-numeric input", () => {
    expect(() => parseCredits("12e5")).to.throw(/decimal/)
  })
})

describe("SLA manifest codec", () => {
  it("round-trips through the compact on-chain form", () => {
    const manifest = {
      job: 7,
      model: "deepseek-v3",
      tokens: 12_000,
      uptimeBps: 9_970,
      latencyMs: 310,
      attestation: "0xdeadbeefdeadbeef",
    }
    expect(parseManifest(buildManifest(manifest))).to.deep.equal(manifest)
  })

  it("stays small enough to seal cheaply", () => {
    const json = buildManifest({
      job: 999_999,
      model: "llama-3.3-70b-instruct",
      tokens: 1_000_000,
      uptimeBps: 10_000,
      latencyMs: 9_999,
      attestation: "0xdeadbeefdeadbeef",
    })
    // Each 8-byte cell is one MPC round trip, so manifest size is gas.
    expect(json.length).to.be.below(160)
  })

  it("returns null on malformed input rather than throwing into the UI", () => {
    expect(parseManifest("not json")).to.equal(null)
  })
})

describe("node reputation", () => {
  it("does not let one clean job outrank a long record", () => {
    const rookie = listing({ id: 1, jobsSettled: 1, jobsBreached: 0 })
    const veteran = listing({ id: 2, jobsSettled: 100, jobsBreached: 2 })

    expect(reliability(rookie)).to.be.below(reliability(veteran))
  })

  it("places an unproven node between a proven one and a failing one", () => {
    const unproven = reliability(listing())
    const proven = reliability(listing({ jobsSettled: 50, jobsBreached: 0 }))
    const failing = reliability(listing({ jobsSettled: 1, jobsBreached: 20 }))

    expect(unproven).to.be.below(proven)
    expect(unproven).to.be.above(failing)
  })

  it("weights the settled record above the promise that is only cheap talk", () => {
    const bigPromiseNoRecord = listing({ promisedUptimeBps: 10_000, promisedLatencyMs: 100, jobsBreached: 8 })
    const modestPromiseGoodRecord = listing({
      promisedUptimeBps: 9_500,
      promisedLatencyMs: 900,
      jobsSettled: 40,
    })

    expect(score(modestPromiseGoodRecord)).to.be.above(score(bigPromiseNoRecord))
  })
})
