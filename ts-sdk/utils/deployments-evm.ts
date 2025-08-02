import fs from "fs";
import path from "path";

const DEPLOY_DIR = path.resolve(__dirname, "../../deployments/testnet-evm");

export function getLatestEvmDeployment() {
  const files = fs.readdirSync(DEPLOY_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0)
    throw new Error("No deployment files found in testnet-evm");

  const sorted = files.sort((a, b) => {
    return (
      fs.statSync(path.join(DEPLOY_DIR, b)).mtimeMs -
      fs.statSync(path.join(DEPLOY_DIR, a)).mtimeMs
    );
  });

  const latestPath = path.join(DEPLOY_DIR, sorted[0]);
  const json = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!json.address || !json.abi)
    throw new Error("Invalid deployment file: missing address or abi");

  return {
    contractAddress: json.address,
    abi: json.abi,
    deployer: json.deployer,
    timestamp: json.timestamp,
    path: latestPath,
  };
}
