/**
 * Deploy the Nodea stack to COTI and wire the permissions between the four contracts.
 *
 * Order matters: the escrow needs the addresses of the other three at construction, and the
 * certificate contract must then be told to accept issuance from it. Getting that wiring wrong is
 * silent until the first job settles, so the script verifies it before writing the record.
 *
 * Deliberately built on plain ethers rather than `hardhat-ethers`. COTI's RPC does not serve the
 * `pending` block tag, and hardhat-ethers estimates gas against `pending` — which fails before a
 * single transaction is sent. Using the same `@coti-io/coti-ethers` Wallet the SDK and the agent
 * runtime use keeps the deploy path on exactly the transport that is known to work against COTI,
 * and keeps Hardhat's role to what it is good at here: compiling.
 *
 *   npm run deploy            COTI mainnet
 *   npm run deploy:testnet    COTI testnet
 */
import * as fs from "fs"
import * as path from "path"
import { Contract, ContractFactory, ethers } from "@coti-io/coti-ethers"
import { NETWORKS } from "../src/lib/nodea/config"
import { header, loadWallet, networkKey } from "./_identities"

/** One hour per rewards epoch in the prompt channel. */
const EPOCH_DURATION_SECONDS = 3600n

/** Grace period before a mainnet deployment starts, so a mistyped target can still be aborted. */
const MAINNET_PAUSE_SECONDS = 8

const ROOT = path.resolve(__dirname, "..")

interface Artifact {
  abi: unknown[]
  bytecode: string
}

function artifact(name: string): Artifact {
  const base = path.join(ROOT, "artifacts/contracts")
  const stack = [base]

  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.name === `${name}.json`) return JSON.parse(fs.readFileSync(full, "utf8"))
    }
  }
  throw new Error(`artifact not found for ${name} — run \`npm run compile\` first`)
}

async function main() {
  const key = networkKey()
  const network = NETWORKS[key]
  const deployer = loadWallet("deployer")
  const provider = deployer.provider!

  const balance = await provider.getBalance(deployer.address)
  const gasPrice = (await provider.getFeeData()).gasPrice ?? 0n

  header(`Nodea deployment — ${network.name}`)
  console.log(`  chain id  ${network.chainId}`)
  console.log(`  deployer  ${deployer.address}`)
  console.log(`  balance   ${ethers.formatEther(balance)} COTI`)
  console.log(`  gas price ${ethers.formatUnits(gasPrice, "gwei")} gwei\n`)

  if (balance === 0n) {
    throw new Error(
      `${deployer.address} has no COTI on ${network.name}. To continue, ${network.fundingHint}.`,
    )
  }

  // Mainnet gas is real money and a deployment cannot be undone. The npm script name is already
  // explicit, so this is a last look rather than a gate — but a mistyped target should still be
  // catchable before four contracts exist on a chain nobody meant to touch.
  if (network.isMainnet) {
    console.log(`  ! MAINNET — this spends real COTI and cannot be reverted.`)
    console.log(`  ! Starting in ${MAINNET_PAUSE_SECONDS}s. Ctrl-C to abort.\n`)
    await new Promise((resolve) => setTimeout(resolve, MAINNET_PAUSE_SECONDS * 1000))
  }

  // Typed as a plain Contract: ethers infers nothing useful from a runtime-loaded ABI, and the
  // alternative is a generated-types pipeline this script does not need.
  const deploy = async (name: string, args: unknown[]): Promise<Contract> => {
    const { abi, bytecode } = artifact(name)
    const deployed = await new ContractFactory(abi as never, bytecode, deployer).deploy(...args)
    await deployed.waitForDeployment()

    const address = await deployed.getAddress()
    console.log(`  ${name.padEnd(19)} ${address}`)
    return new Contract(address, abi as never, deployer)
  }

  const credits = await deploy("NodeaCredits", [deployer.address])
  const sla = await deploy("NodeaSLA", [deployer.address])
  const promptChannel = await deploy("NodeaPromptChannel", [EPOCH_DURATION_SECONDS])
  const compute = await deploy("NodeaCompute", [
    await credits.getAddress(),
    await sla.getAddress(),
    await promptChannel.getAddress(),
  ])
  const computeAddress = await compute.getAddress()

  console.log(`\n  wiring permissions`)

  // Only the escrow may mint SLA certificates — otherwise a node could forge its own reputation.
  await (await sla.setIssuer(computeAddress, true)).wait()
  console.log(`    NodeaSLA.issuer   -> NodeaCompute`)

  // The escrow moves credits with `transferGT`, an ordinary transfer of its own balance, so it
  // needs no minting rights. Nothing else has to be granted.

  if (!(await sla.isIssuer(computeAddress))) {
    throw new Error("issuer wiring failed: NodeaCompute is not authorised on NodeaSLA")
  }
  if ((await compute.credits()) !== (await credits.getAddress())) {
    throw new Error("escrow is pointing at the wrong credits contract")
  }
  if ((await compute.promptChannel()) !== (await promptChannel.getAddress())) {
    throw new Error("escrow is pointing at the wrong prompt channel")
  }
  console.log(`    verified`)

  const record = {
    network: key,
    chainId: network.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NodeaCredits: await credits.getAddress(),
      NodeaSLA: await sla.getAddress(),
      NodeaPromptChannel: await promptChannel.getAddress(),
      NodeaCompute: computeAddress,
    },
  }

  fs.writeFileSync(
    path.join(ROOT, "deployments", `${key}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  )
  console.log(`\n  wrote deployments/${key}.json`)

  const spent = balance - (await provider.getBalance(deployer.address))
  console.log(`  spent ${ethers.formatEther(spent)} COTI\n`)

  console.log(`  Explorer:`)
  for (const [name, address] of Object.entries(record.contracts)) {
    console.log(`    ${name.padEnd(19)} ${network.explorerUrl}/address/${address}`)
  }
  console.log(`\n  Next: npm run seed\n`)
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
