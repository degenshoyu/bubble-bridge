import fs from "fs";
import path from "path";

export interface HtlcMetadata {
  packageId: string;
  htlcId: string;
  secret: string;
  coinType?: string;
  recipient?: string;
  timelock?: number;
  amount?: string;
  timestamp?: string;
  sourceFile?: string;
}

export function getLatestHtlcInfo(): HtlcMetadata {
  const htlcDir = path.resolve(__dirname, "../../deployments/htlc-locks");
  const files = fs
    .readdirSync(htlcDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No HTLC lock files found.");
  }

  const latestPath = path.join(htlcDir, files[0]);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!data.packageId || !data.htlcId || !data.secret) {
    throw new Error("Invalid HTLC lock file: missing required fields.");
  }

  return {
    packageId: data.packageId,
    htlcId: data.htlcId,
    secret: data.secret,
    coinType: data.coinType,
    recipient: data.recipient,
    timelock: data.timelock,
    amount: data.amount,
    timestamp: data.timestamp || new Date().toISOString(),
    sourceFile: files[0],
  };
}
