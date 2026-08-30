/**
 * Manage the 0G Compute account a Nodea node serves jobs from.
 *
 *   npx tsx scripts/zerog.ts status        ledger balance, providers, cost per job
 *   npx tsx scripts/zerog.ts fund 0.1      deposit 0.1 0G (creates the ledger if absent)
 *   npx tsx scripts/zerog.ts test          run one real inference end to end
 *
 * This is the node operator's side of the house. The agent never touches 0G — it pays the node in
 * encrypted NDC on COTI and never learns what the node spent on GPU.
 */
import * as dotenv from "dotenv"
import {
  chatServices,
  connectZeroG,
  formatOG,
  isZeroGConfigured,
  ledgerBalance,
  listServices,
  runZeroGInference,
  selectService,
} from "../agent/zerog"

dotenv.config()

/** A representative Nodea job, for the cost projection below. */
const SAMPLE_PROMPT_TOKENS = 400
const SAMPLE_COMPLETION_TOKENS = 12_000

async function main() {
  if (!isZeroGConfigured()) {
    console.log(
      `\n  ZEROG_PRIVATE_KEY is not set.\n\n` +
        `  Set it to the node operator's 0G wallet key in .env to back this node with real GPU\n` +
        `  inference. Without it the daemon uses a deterministic local stand-in, which is fine for\n` +
        `  development but is not real compute.\n`,
    )
    process.exitCode = 1
    return
  }

  const command = process.argv[2] ?? "status"
  const { broker, address, network } = await connectZeroG()

  console.log(`\n  0G Compute — ${network.name}`)
  console.log(`  node operator wallet  ${address}\n`)

  switch (command) {
    case "status":
      await status(broker)
      break
    case "fund":
      await fund(broker, process.argv[3])
      break
    case "test":
      await test(broker)
      break
    default:
      console.log(`  unknown command "${command}" — use status, fund <amount>, or test\n`)
      process.exitCode = 1
  }
}

async function status(broker: Awaited<ReturnType<typeof connectZeroG>>["broker"]) {
  const ledger = await ledgerBalance(broker)

  if (!ledger) {
    console.log(`  ledger    none yet — run \`npx tsx scripts/zerog.ts fund 0.1\` to create one\n`)
  } else {
    console.log(`  ledger    ${formatOG(ledger.total)} 0G total, ${formatOG(ledger.locked)} available\n`)
  }

  const all = await listServices(broker)
  const services = chatServices(all)
  if (services.length === 0) {
    console.log(`  no text-generation providers are currently registered on 0G\n`)
    return
  }

  console.log(`  text-generation providers (${services.length} of ${all.length} total):\n`)
  for (const service of services) {
    // 0G prices per token in neuron; a Nodea job is priced per 1,000 generated tokens.
    const perJob =
      service.inputPrice * BigInt(SAMPLE_PROMPT_TOKENS) +
      service.outputPrice * BigInt(SAMPLE_COMPLETION_TOKENS)

    console.log(`    ${service.model}`)
    console.log(`      provider      ${service.provider}`)
    console.log(`      verifiable    ${service.verifiability || "none"}${service.teeSignerAcknowledged ? " (TEE signer acknowledged)" : ""}`)
    console.log(`      per 1k out    ${formatOG(service.outputPrice * 1000n)} 0G`)
    console.log(`      sample job    ${formatOG(perJob)} 0G  (${SAMPLE_PROMPT_TOKENS} in / ${SAMPLE_COMPLETION_TOKENS} out)`)

    if (ledger && perJob > 0n) {
      console.log(`      affordable    ~${ledger.total / perJob} jobs at this rate`)
    }
    console.log()
  }

  const chosen = await selectService(broker, process.env.ZEROG_MODEL)
  console.log(`  this node would serve with: ${chosen.model} (${chosen.provider})\n`)
}

async function fund(
  broker: Awaited<ReturnType<typeof connectZeroG>>["broker"],
  amountArg: string | undefined,
) {
  const amount = Number(amountArg)
  if (!Number.isFinite(amount) || amount <= 0) {
    console.log(`  usage: npx tsx scripts/zerog.ts fund <amount in 0G>\n`)
    process.exitCode = 1
    return
  }

  const existing = await ledgerBalance(broker)

  if (!existing) {
    console.log(`  creating ledger with ${amount} 0G…`)
    await broker.ledger.addLedger(amount)
  } else {
    console.log(`  depositing ${amount} 0G…`)
    await broker.ledger.depositFund(amount)
  }

  const after = await ledgerBalance(broker)
  console.log(`  ledger now ${formatOG(after?.total ?? 0n)} 0G\n`)
}

async function test(broker: Awaited<ReturnType<typeof connectZeroG>>["broker"]) {
  const service = await selectService(broker, process.env.ZEROG_MODEL)
  console.log(`  provider  ${service.provider}`)
  console.log(`  model     ${service.model}\n`)

  const prompt = "In one sentence: why does an AI agent need transaction privacy?"
  console.log(`  prompt    "${prompt}"\n`)

  const started = Date.now()
  const result = await runZeroGInference(broker, service, prompt, 120)
  const elapsed = Date.now() - started

  console.log(`  response  ${result.content.trim().slice(0, 400)}\n`)
  console.log(`  tokens    ${result.promptTokens} in / ${result.completionTokens} out`)
  console.log(`  latency   ${elapsed}ms`)
  console.log(
    `  verified  ${result.verified === null ? "not a verifiable service" : result.verified ? "signature valid" : "SIGNATURE INVALID"}\n`,
  )
  console.log(`  This is the inference a Nodea node serves. The agent pays for it in encrypted NDC`)
  console.log(`  on COTI and never learns what it cost the node to produce.\n`)
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
