/**
 * Distribute native COTI from the deployer to the node operator and the agent.
 *
 * Funding three addresses by hand is three chances to paste the wrong one, so the deployer takes
 * the whole amount and this splits it. The deployer keeps a reserve for the deployment itself;
 * whatever is left is divided between the two demo identities.
 *
 *   npm run fund                          distribute using the default targets
 *   npm run fund -- --dry                 show the plan without sending
 *   npm run fund -- --operator 0.8 --agent 0.6
 *   npm run fund -- --to 0xABC… 0.3       send to one address, e.g. a browser agent
 *
 * The `--to` form exists because the console can mint an agent identity that has no funds and no
 * wallet behind it. Its address is on screen; this sends it gas without needing MetaMask to hold
 * COTI at all.
 *
 * Native transfers only. This moves gas, not NDC — NDC is minted by the credits contract and is
 * encrypted end to end.
 */
import { ethers } from "@coti-io/coti-ethers"
import { NETWORKS } from "../src/lib/nodea/config"
import { loadWallet, networkKey } from "./_identities"

/**
 * Reserve for the deployer, in COTI.
 *
 * Deploying all four contracts measured at ~0.021 COTI at 2 gwei; this leaves generous room for
 * AES onboarding, the `setIssuer` wiring, and a redeploy if the first attempt turns up a bug.
 */
const DEPLOY_RESERVE = ethers.parseEther("0.4")

/** Defaults sized for onboarding, a seeded fleet, a full demo run, and the live test suite. */
const DEFAULT_TARGETS = {
  operator: ethers.parseEther("0.6"),
  agent: ethers.parseEther("0.5"),
}

const TRANSFER_GAS = 21_000n

async function main() {
  const network = NETWORKS[networkKey()]
  const options = parseArgs(process.argv.slice(2))

  const deployer = loadWallet("deployer")
  const operator = loadWallet("operator")
  const agent = loadWallet("agent")

  const provider = deployer.provider!
  const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("2", "gwei")

  const balances = {
    deployer: await provider.getBalance(deployer.address),
    operator: await provider.getBalance(operator.address),
    agent: await provider.getBalance(agent.address),
  }

  console.log(`\n  Nodea funding — ${network.name}\n`)
  console.log(`    deployer  ${deployer.address}  ${ethers.formatEther(balances.deployer)} COTI`)
  console.log(`    operator  ${operator.address}  ${ethers.formatEther(balances.operator)} COTI`)
  console.log(`    agent     ${agent.address}  ${ethers.formatEther(balances.agent)} COTI\n`)

  // One-off transfer takes precedence over the three-way split.
  if (options.to) {
    if (balances.deployer < options.to.amount) {
      throw new Error(
        `deployer holds ${ethers.formatEther(balances.deployer)} COTI, ` +
          `less than the ${ethers.formatEther(options.to.amount)} requested`,
      )
    }

    console.log(`    -> ${options.to.address}  ${ethers.formatEther(options.to.amount)} COTI`)

    if (options.dryRun) {
      console.log(`\n  --dry: nothing sent.\n`)
      return
    }

    const receipt = await (
      await deployer.sendTransaction({ to: options.to.address, value: options.to.amount })
    ).wait()

    console.log(`    ${network.explorerUrl}/tx/${receipt!.hash}`)
    console.log(
      `\n  recipient now holds ` +
        `${ethers.formatEther(await provider.getBalance(options.to.address))} COTI\n`,
    )
    return
  }

  if (balances.deployer === 0n) {
    console.log(
      `  The deployer has no COTI on ${network.name}.\n\n` +
        `  If you have already sent funds, they are most likely on the wrong chain: native COTI\n` +
        `  (chain ${network.chainId}) and the COTI ERC-20 on Ethereum are not interchangeable.\n` +
        `  Bridge at https://bridge.coti.io and check this address on ${network.explorerUrl}.\n`,
    )
    process.exitCode = 1
    return
  }

  // Only top up what each account is actually short of, so re-running this is safe.
  const shortfall = {
    operator: max0(options.operator - balances.operator),
    agent: max0(options.agent - balances.agent),
  }
  const needed = shortfall.operator + shortfall.agent
  const fees = TRANSFER_GAS * gasPrice * 2n
  const spendable = max0(balances.deployer - DEPLOY_RESERVE - fees)

  if (needed === 0n) {
    console.log(`  Both accounts already meet their targets. Nothing to send.\n`)
    return
  }

  // Not enough to hit both targets: split what is available in proportion to the shortfalls,
  // rather than funding one account fully and leaving the other at zero.
  const scale = spendable < needed ? spendable : needed
  const send = {
    operator: (shortfall.operator * scale) / needed,
    agent: (shortfall.agent * scale) / needed,
  }

  if (spendable < needed) {
    console.log(
      `  ! Only ${ethers.formatEther(spendable)} COTI is spendable after the ` +
        `${ethers.formatEther(DEPLOY_RESERVE)} deploy reserve,\n` +
        `  ! but ${ethers.formatEther(needed)} is needed to hit both targets. Splitting proportionally.\n`,
    )
  }

  console.log(`  plan:`)
  console.log(`    -> operator  ${ethers.formatEther(send.operator)} COTI`)
  console.log(`    -> agent     ${ethers.formatEther(send.agent)} COTI`)
  console.log(`    deployer keeps ${ethers.formatEther(balances.deployer - send.operator - send.agent - fees)} COTI\n`)

  if (options.dryRun) {
    console.log(`  --dry: nothing sent.\n`)
    return
  }

  for (const [role, to, value] of [
    ["operator", operator.address, send.operator],
    ["agent", agent.address, send.agent],
  ] as const) {
    if (value === 0n) continue

    const tx = await deployer.sendTransaction({ to, value })
    const receipt = await tx.wait()
    console.log(`    sent ${ethers.formatEther(value)} COTI to ${role}`)
    console.log(`      ${network.explorerUrl}/tx/${receipt!.hash}`)
  }

  console.log(`\n  final balances:`)
  for (const [role, address] of [
    ["deployer", deployer.address],
    ["operator", operator.address],
    ["agent", agent.address],
  ] as const) {
    console.log(`    ${role.padEnd(9)} ${ethers.formatEther(await provider.getBalance(address))} COTI`)
  }
  console.log(`\n  Next: npm run deploy\n`)
}

interface FundOptions {
  operator: bigint
  agent: bigint
  dryRun: boolean
  /** One-off recipient, bypassing the default split. */
  to?: { address: string; amount: bigint }
}

function parseArgs(argv: string[]): FundOptions {
  const options: FundOptions = { ...DEFAULT_TARGETS, dryRun: false }

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--to": {
        const address = argv[++i]
        const amount = argv[++i]
        if (!ethers.isAddress(address)) {
          throw new Error(`--to expects an address, got "${address}"`)
        }
        options.to = { address: ethers.getAddress(address), amount: ethers.parseEther(amount ?? "0.3") }
        break
      }
      case "--operator":
        options.operator = ethers.parseEther(argv[++i])
        break
      case "--agent":
        options.agent = ethers.parseEther(argv[++i])
        break
      case "--dry":
      case "--dry-run":
        options.dryRun = true
        break
    }
  }
  return options
}

const max0 = (value: bigint) => (value > 0n ? value : 0n)

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
