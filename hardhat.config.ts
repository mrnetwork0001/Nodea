import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-ethers"
import "@nomicfoundation/hardhat-chai-matchers"
import * as dotenv from "dotenv"

dotenv.config()

const accounts = [
  process.env.NODEA_DEPLOYER_KEY,
  process.env.NODEA_NODE_OPERATOR_KEY,
  process.env.NODEA_AGENT_KEY,
].filter((key): key is string => Boolean(key && key !== "0x"))

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // COTI v2 executes at the Paris fork level; PUSH0 and transient storage are off the table.
      evmVersion: "paris",
      viaIR: false,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./.hardhat/cache",
    artifacts: "./artifacts",
  },
  networks: {
    cotiTestnet: {
      url: process.env.COTI_RPC_URL ?? "https://testnet.coti.io/rpc",
      chainId: 7082400,
      accounts,
    },
    cotiMainnet: {
      url: process.env.COTI_MAINNET_RPC_URL ?? "https://mainnet.coti.io/rpc",
      chainId: 2632500,
      accounts,
    },
  },
  mocha: {
    timeout: 600_000,
  },
}

export default config
