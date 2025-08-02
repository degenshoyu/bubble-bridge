import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("🔑 Deployer:", deployerAddress);
  console.log("🌐 Network:", network.name);

  const HtlcFactory = await ethers.getContractFactory("HtlcUnified");
  const htlc = await HtlcFactory.deploy();
  await htlc.waitForDeployment();

  const contractAddress = await htlc.getAddress();
  console.log("✅ HtlcUnified deployed to:", contractAddress);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const abi = HtlcFactory.interface.formatJson();

  const deploymentInfo = {
    contractName: "HtlcUnified",
    address: contractAddress,
    abi: JSON.parse(abi),
    deployer: deployerAddress,
    network: network.name,
    timestamp,
  };

  const savePath = path.resolve(
    __dirname,
    "../../deployments/testnet-evm",
    `${timestamp}.json`
  );
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`📦 Deployment saved to: ${savePath}`);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
