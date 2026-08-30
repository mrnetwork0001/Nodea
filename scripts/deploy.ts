/**
 * Deploy the Nodea stack to COTI and wire the permissions between the four contracts.
 *
 * Order matters: the escrow needs the addresses of the other three at construction, and the
 * certificate contract must then be told to accept issuance from it. Getting that wiring wrong
 * is silent until the first job settles, so the script verifies it before writing the record.
 */
import { ethers, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"
import { NETWORKS, type NodeaNetworkKey } from "../src/lib/nodea/config"

/** One hour per rewards epoch in the prompt channel. */
const EPOCH_DURATION_SECONDS = 3600n

/** Grace period before a mainnet deployment starts, so a mistyped target can still be aborted. */
const MAINNET_PAUSE_SECONDS = 8

async function main() {
  const target = NETWORKS[network.name as NodeaNetworkKey]
  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)
  const gasPrice = (await ethers.provider.getFeeData()).gasPrice ?? 0n

  console.log(`\nNodea deployment`)
  console.log(`  network   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`  deployer  ${deployer.address}`)
  console.log(`  balance   ${ethers.formatEther(balance)} COTI`)
  console.log(`  gas price ${ethers.formatUnits(gasPrice, "gwei")} gwei\n`)

  if (balance === 0n) {
    const hint = target?.fundingHint ?? "fund the deployer"
    throw new Error(`${deployer.address} has no COTI on ${network.name}. To continue, ${hint}.`)
  }

  // `seed`, `e2e` and the agent runtime read NODEA_NETWORK, while this script follows Hardhat's
  // --network flag. When they disagree the deployment lands on one chain and every script that
  // follows looks for it on the other, which surfaces as a confusing "not deployed" error.
  const configured = process.env.NODEA_NETWORK
  if (configured && configured !== network.name) {
    console.log(
      `  ! NODEA_NETWORK is "${configured}" but this deploys to "${network.name}".\n` +
        `  ! Scripts after this one will look on ${configured}. Set NODEA_NETWORK=${network.name} in .env.\n`,
    )
  }

  // Mainnet gas is real money and a deployment cannot be undone. The npm script name is already
  // explicit, so this is a last look rather than a gate — but a mistyped target should still be
  // catchable before four contracts exist on a chain nobody meant to touch.
  if (target?.isMainnet) {
    console.log(`  ! MAINNET — this spends real COTI and cannot be reverted.`)
    console.log(`  ! Starting in ${MAINNET_PAUSE_SECONDS}s. Ctrl-C to abort.\n`)
    await new Promise((resolve) => setTimeout(resolve, MAINNET_PAUSE_SECONDS * 1000))
  }

  const credits = await (await ethers.deployContract("NodeaCredits", [deployer.address])).waitForDeployment()
  console.log(`  NodeaCredits        ${await credits.getAddress()}`)

  const sla = await (await ethers.deployContract("NodeaSLA", [deployer.address])).waitForDeployment()
  console.log(`  NodeaSLA            ${await sla.getAddress()}`)

  const promptChannel = await (
    await ethers.deployContract("NodeaPromptChannel", [EPOCH_DURATION_SECONDS])
  ).waitForDeployment()
  console.log(`  NodeaPromptChannel  ${await promptChannel.getAddress()}`)

  const compute = await (
    await ethers.deployContract("NodeaCompute", [
      await credits.getAddress(),
      await sla.getAddress(),
      await promptChannel.getAddress(),
    ])
  ).waitForDeployment()
  const computeAddress = await compute.getAddress()
  console.log(`  NodeaCompute        ${computeAddress}\n`)

  console.log(`  wiring permissions`)

  // Only the escrow may mint SLA certificates — otherwise a node could forge its own reputation.
  await (await sla.setIssuer(computeAddress, true)).wait()
  console.log(`    NodeaSLA.issuer     -> NodeaCompute`)

  // The escrow moves credits with `transferGT`, which is an ordinary transfer of its own balance,
  // so it needs no minting rights. Nothing else has to be granted.

  if (!(await sla.isIssuer(computeAddress))) {
    throw new Error("issuer wiring failed: NodeaCompute is not authorised on NodeaSLA")
  }
  if ((await compute.credits()) !== (await credits.getAddress())) {
    throw new Error("escrow is pointing at the wrong credits contract")
  }
  console.log(`    verified\n`)

  const record = {
    network: network.name,
    chainId: Number(network.config.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NodeaCredits: await credits.getAddress(),
      NodeaSLA: await sla.getAddress(),
      NodeaPromptChannel: await promptChannel.getAddress(),
      NodeaCompute: computeAddress,
    },
  }

  const out = path.join(__dirname, "..", "deployments", `${network.name}.json`)
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`)
  console.log(`  wrote deployments/${network.name}.json`)

  const spent = balance - (await ethers.provider.getBalance(deployer.address))
  console.log(`  spent ${ethers.formatEther(spent)} COTI`)

  const explorer = target?.explorerUrl ?? "https://mainnet.cotiscan.io"
  console.log(`\n  Explorer:`)
  for (const [name, address] of Object.entries(record.contracts)) {
    console.log(`    ${name.padEnd(19)} ${explorer}/address/${address}`)
  }
  console.log()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
