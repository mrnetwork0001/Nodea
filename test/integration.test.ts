/**
 * Live integration tests against COTI.
 *
 * These are the only tests that can prove anything about the garbled circuits, because the MPC
 * precompile exists on COTI and nowhere else. They skip themselves cleanly when `.env` has no
 * keys or nothing is deployed yet, so `npm test` stays green on a fresh clone.
 *
 *   npm run compile && npm run deploy:testnet && npm run seed
 *   npm run test:live
 *
 * They assert the two things that actually matter: that the confidential values round-trip for
 * the parties entitled to them, and that they stay unreadable for everyone else.
 */
import { expect } from "chai"
import * as dotenv from "dotenv"
import { ethers, Wallet } from "@coti-io/coti-ethers"
import { NETWORKS } from "../src/lib/nodea/config"
import { formatCredits, parseCredits } from "../src/lib/nodea/config"
import { ensureOnboarded, walletFromKey } from "../src/lib/nodea/account"
import { isDeployed, loadDeployment, type NodeaDeployment } from "../src/lib/nodea/deployments"
import { buildManifest } from "../src/lib/nodea/sla"
import * as compute from "../src/lib/nodea/compute"
import * as credits from "../src/lib/nodea/credits"
import * as messaging from "../src/lib/nodea/messaging"
import * as sla from "../src/lib/nodea/sla"

dotenv.config()

const NETWORK = NETWORKS.cotiTestnet
const HAVE_KEYS = Boolean(
  process.env.NODEA_NODE_OPERATOR_KEY && process.env.NODEA_AGENT_KEY && process.env.NODEA_DEPLOYER_KEY,
)
const RUNNABLE = HAVE_KEYS && isDeployed("cotiTestnet")

const PROMPT = "SYSTEM: private alpha. Rank ETH/USDC pools by fee yield 予算は秘密 🔐"
const PRICE_PER_KTOKEN = parseCredits("0.75")
const WORKLOAD = 8n
const BUDGET = parseCredits("20")

;(RUNNABLE ? describe : describe.skip)("Nodea on COTI testnet", function () {
  this.timeout(900_000)

  let deployment: NodeaDeployment
  let operator: Wallet
  let agent: Wallet
  let outsider: Wallet
  let nodeId: number

  before(async () => {
    deployment = loadDeployment("cotiTestnet")

    operator = walletFromKey(process.env.NODEA_NODE_OPERATOR_KEY!, NETWORK)
    agent = walletFromKey(process.env.NODEA_AGENT_KEY!, NETWORK)
    outsider = walletFromKey(process.env.NODEA_DEPLOYER_KEY!, NETWORK)

    for (const wallet of [operator, agent, outsider]) {
      await ensureOnboarded(wallet, NETWORK)
    }

    const registered = await compute.registerNode(operator, deployment.compute, {
      modelId: "integration-test-model",
      gpuClass: "H100-80GB",
      region: "test",
      promisedUptimeBps: 9_900,
      promisedLatencyMs: 600,
      pricePerKToken: PRICE_PER_KTOKEN,
    })
    nodeId = registered.nodeId
  })

  it("seals the node's rate card so only its operator can read it", async () => {
    expect(await compute.readNodePrice(operator, deployment.compute, nodeId)).to.equal(
      PRICE_PER_KTOKEN,
    )

    // The listing an agent sees carries no price field at all — there is nothing to leak.
    const listing = await compute.getNode(agent, deployment.compute, nodeId)
    expect(listing).to.not.have.property("pricePerKToken")

    // And the operator-scoped read reverts for anyone else.
    await expectSealed(compute.readNodePrice(agent, deployment.compute, nodeId), "node price")
  })

  it("delivers a prompt readable only by the hired node", async () => {
    const sent = await messaging.sendPrompt(agent, deployment.promptChannel, operator.address, PROMPT)

    expect(await messaging.readPrompt(operator, deployment.promptChannel, sent.messageId)).to.equal(
      PROMPT,
    )
    expect(await messaging.readPrompt(agent, deployment.promptChannel, sent.messageId)).to.equal(
      PROMPT,
    )
    await expectSealed(
      messaging.readPrompt(outsider, deployment.promptChannel, sent.messageId),
      "prompt",
    )
  })

  it("prices, escrows, judges and settles a job entirely in the circuit", async () => {
    if ((await credits.balanceOf(agent, deployment.credits)) < BUDGET) {
      await credits.claimFaucet(agent, deployment.credits)
    }

    const agentBefore = await credits.balanceOf(agent, deployment.credits)
    const operatorBefore = await credits.balanceOf(operator, deployment.credits)

    const prompt = await messaging.sendPrompt(
      agent,
      deployment.promptChannel,
      operator.address,
      PROMPT,
    )
    await credits.approveSpender(agent, deployment.credits, deployment.compute, BUDGET)

    const job = await compute.openJob(agent, deployment.compute, {
      nodeId,
      kTokens: WORKLOAD,
      maxBudget: BUDGET,
      promptMessageId: prompt.messageId,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    })

    // The cost the agent never supplied is the product the circuit computed.
    const expectedCost = PRICE_PER_KTOKEN * WORKLOAD
    const escrowed = await compute.readJobAmounts(agent, deployment.compute, job.jobId)
    expect(escrowed.cost).to.equal(expectedCost)
    expect(escrowed.workload).to.equal(WORKLOAD)

    // Neither counterparty's view leaks to a third party. `readJobAmounts` reports an
    // unreadable field as `undefined` rather than throwing, so assert on the whole set.
    const leaked = await compute.readJobAmounts(outsider, deployment.compute, job.jobId)
    expect(
      Object.entries(leaked).filter(([, value]) => value !== undefined),
      "a third party decrypted part of the escrow",
    ).to.deep.equal([])

    const attestation = ethers.keccak256(ethers.toUtf8Bytes(`nodea:test:${job.jobId}`))
    const proof = await compute.submitProof(operator, deployment.compute, {
      jobId: job.jobId,
      deliveredKTokens: WORKLOAD,
      uptimeBps: 9_970,
      latencyMs: 320,
      attestationDigest: attestation,
      manifest: buildManifest({
        job: job.jobId,
        model: "integration-test-model",
        tokens: Number(WORKLOAD) * 1000,
        uptimeBps: 9_970,
        latencyMs: 320,
        attestation: attestation.slice(0, 18),
      }),
    })

    expect(proof.slaMet, "measurements beat every published promise").to.equal(true)

    const settled = await compute.readJobAmounts(agent, deployment.compute, job.jobId)
    expect(settled.payout, "a met SLA pays the full escrow").to.equal(expectedCost)
    expect(settled.refund).to.equal(0n)
    expect(settled.delivered).to.equal(WORKLOAD)
    expect((settled.payout ?? 0n) + (settled.refund ?? 0n), "escrow is conserved").to.equal(
      expectedCost,
    )

    const agentAfter = await credits.balanceOf(agent, deployment.credits)
    const operatorAfter = await credits.balanceOf(operator, deployment.credits)
    expect(agentBefore - agentAfter).to.equal(expectedCost)
    expect(operatorAfter - operatorBefore).to.equal(expectedCost)

    const certificate = await sla.getCertificate(operator, deployment.sla, proof.certificateId)
    expect(certificate.jobId).to.equal(job.jobId)
    expect(certificate.slaMet).to.equal(true)

    const manifest = await sla.readManifest(operator, deployment.sla, certificate.tokenId)
    expect(manifest?.tokens).to.equal(Number(WORKLOAD) * 1000)

    console.log(
      `      cost ${formatCredits(expectedCost)} NDC settled with nothing in the clear on chain`,
    )
  })

  it("slashes a node that under-delivers, without revealing the amounts", async () => {
    const prompt = await messaging.sendPrompt(
      agent,
      deployment.promptChannel,
      operator.address,
      PROMPT,
    )
    await credits.approveSpender(agent, deployment.credits, deployment.compute, BUDGET)

    const job = await compute.openJob(agent, deployment.compute, {
      nodeId,
      kTokens: WORKLOAD,
      maxBudget: BUDGET,
      promptMessageId: prompt.messageId,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    })

    const attestation = ethers.keccak256(ethers.toUtf8Bytes(`nodea:breach:${job.jobId}`))
    const proof = await compute.submitProof(operator, deployment.compute, {
      jobId: job.jobId,
      // Half the ordered volume, and slower than promised: two of the three sealed conditions fail.
      deliveredKTokens: WORKLOAD / 2n,
      uptimeBps: 8_500,
      latencyMs: 1_800,
      attestationDigest: attestation,
      manifest: buildManifest({
        job: job.jobId,
        model: "integration-test-model",
        tokens: Number(WORKLOAD / 2n) * 1000,
        uptimeBps: 8_500,
        latencyMs: 1_800,
        attestation: attestation.slice(0, 18),
      }),
    })

    expect(proof.slaMet).to.equal(false)

    const expectedCost = PRICE_PER_KTOKEN * WORKLOAD
    const settled = await compute.readJobAmounts(agent, deployment.compute, job.jobId)

    // SLA_SLASH_BPS is 4000, so a breached job pays 60% and returns 40%.
    expect(settled.payout).to.equal((expectedCost * 6_000n) / 10_000n)
    expect(settled.refund).to.equal(expectedCost - (expectedCost * 6_000n) / 10_000n)
    expect((settled.payout ?? 0n) + (settled.refund ?? 0n)).to.equal(expectedCost)
  })
})

/** Assert that a value stays unreadable: the on-chain view reverts for an unentitled caller. */
async function expectSealed(promise: Promise<unknown>, what: string): Promise<void> {
  let value: unknown
  try {
    value = await promise
  } catch {
    return
  }
  throw new Error(`${what} was readable by a party that should not see it: ${String(value)}`)
}

if (!RUNNABLE) {
  const reason = !HAVE_KEYS
    ? "no keys in .env — run `npm run keygen`"
    : "nothing deployed — run `npm run deploy:testnet`"
  console.log(`  (live COTI integration tests skipped: ${reason})`)
}
