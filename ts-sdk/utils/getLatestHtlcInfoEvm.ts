import fs from "fs";
import path from "path";

export interface EvmHtlcMetadata {
  secret: string;
  hashlock: string;
  recipient?: string;
  token?: string;
  amount?: string;
  timelock?: number;
  txHash?: string;
  locker?: string;
  timestamp: string;
  sourceFile?: string;
}

export function getLatestHtlcInfoEvm(): EvmHtlcMetadata {
  const htlcDir = path.resolve(__dirname, "../../deployments/htlc-locks-evm");
  const files = fs
    .readdirSync(htlcDir)
    .filter((f) => f.endsWith(".json") && f !== "latest.json")
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No HTLC lock files found in EVM directory.");
  }

  const latestPath = path.join(htlcDir, files[0]);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!data.secret || !data.hashlock) {
    throw new Error("Invalid HTLC lock file: missing 'secret' or 'hashlock'.");
  }

  return {
    secret: data.secret,
    hashlock: data.hashlock,
    recipient: data.recipient,
    token: data.token,
    amount: data.amount,
    timelock: data.timelock,
    txHash: data.txHash,
    locker: data.locker,
    timestamp: data.timestamp || new Date().toISOString(),
    sourceFile: files[0],
  };
}

