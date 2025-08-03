import { ethers } from "ethers";
import { getLatestEvmDeployment } from "./deployments-evm";
import fs from "fs";
import path from "path";

export async function getSecretFromEvmClaimTx(txHash: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.EVM_SEPOLIA_RPC_URL);
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error("❌ Transaction not found");
  }

  const { abi } = getLatestEvmDeployment();
  const iface = new ethers.Interface(abi);
  const decoded = iface.parseTransaction({ data: tx.data });
  if (!decoded || decoded.name !== "claim") {
    throw new Error("❌ Transaction is not a claim transaction");
  }

  const secret = decoded.args[1]; 
  if (!secret || typeof secret !== "string") {
    throw new Error("❌ Invalid secret in transaction");
  }

  return "0x" + secret;
}

export function getLatestEvmClaimInfo(): {
  txHash: string;
  secret: string;
  sourceFile: string;
} {
  const claimsDir = path.resolve(
    __dirname,
    "../../deployments/htlc-claims-evm"
  );
  const files = fs
    .readdirSync(claimsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No EVM claim files found.");
  }

  const latestPath = path.join(claimsDir, files[0]);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!data.txHash || !data.secret) {
    throw new Error("Invalid EVM claim file: missing txHash or secret.");
  }

  return {
    txHash: data.txHash,
    secret: data.secret,
    sourceFile: files[0],
  };
}
