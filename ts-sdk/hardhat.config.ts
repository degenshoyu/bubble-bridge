import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PRIVATE_KEY = process.env.EVM_DEPLOYER_PRIVKEY || "";
const RPC_URL = process.env.EVM_SEPOLIA_RPC_URL || "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    sepolia: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  solidity: "0.8.20",
};

export default config;
