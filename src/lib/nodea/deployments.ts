/**
 * Deployment addresses, written by `scripts/deploy.ts` and read by everything else.
 *
 * Environment variables win over the checked-in record, so a reviewer can point the dashboard at
 * their own deployment without editing files or rebuilding the contracts.
 */
import cotiTestnet from "../../../deployments/cotiTestnet.json"
import cotiMainnet from "../../../deployments/cotiMainnet.json"
import { DEFAULT_NETWORK, NETWORKS, type NodeaNetwork, type NodeaNetworkKey } from "./config"

export interface NodeaDeployment {
  network: NodeaNetwork
  credits: string
  sla: string
  promptChannel: string
  compute: string
  deployedAt: string | null
  deployer: string | null
}

/**
 * Shape of a deployment record. Declared explicitly rather than inferred from the JSON, because
 * an undeployed network's file is all nulls and TypeScript would narrow every address to `null`.
 */
interface DeploymentRecord {
  network: string
  chainId: number
  deployedAt: string | null
  deployer: string | null
  contracts: {
    NodeaCredits: string | null
    NodeaSLA: string | null
    NodeaPromptChannel: string | null
    NodeaCompute: string | null
  }
}

const RECORDS: Record<NodeaNetworkKey, DeploymentRecord> = {
  cotiTestnet,
  cotiMainnet,
}

export class NotDeployedError extends Error {
  constructor(network: NodeaNetwork) {
    super(
      `Nodea is not deployed on ${network.name} yet. ` +
        `Run \`npm run deploy:${network.isMainnet ? "mainnet" : "testnet"}\`, ` +
        `or set NEXT_PUBLIC_NODEA_* addresses.`,
    )
    this.name = "NotDeployedError"
  }
}

function envAddress(name: string): string | undefined {
  const value = process.env[name]
  return value && value !== "" ? value : undefined
}

export function loadDeployment(key: NodeaNetworkKey = DEFAULT_NETWORK): NodeaDeployment {
  const network = NETWORKS[key]
  const record = RECORDS[key]

  const credits = envAddress("NEXT_PUBLIC_NODEA_CREDITS") ?? record.contracts.NodeaCredits
  const sla = envAddress("NEXT_PUBLIC_NODEA_SLA") ?? record.contracts.NodeaSLA
  const promptChannel =
    envAddress("NEXT_PUBLIC_NODEA_PROMPT_CHANNEL") ?? record.contracts.NodeaPromptChannel
  const compute = envAddress("NEXT_PUBLIC_NODEA_COMPUTE") ?? record.contracts.NodeaCompute

  if (!credits || !sla || !promptChannel || !compute) throw new NotDeployedError(network)

  return {
    network,
    credits,
    sla,
    promptChannel,
    compute,
    deployedAt: record.deployedAt,
    deployer: record.deployer,
  }
}

export function isDeployed(key: NodeaNetworkKey = DEFAULT_NETWORK): boolean {
  try {
    loadDeployment(key)
    return true
  } catch {
    return false
  }
}
