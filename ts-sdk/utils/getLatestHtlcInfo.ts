import fs from "fs";
import path from "path";

export interface HtlcMetadata {
  packageId: string;
  htlcId: string;
  secret: string;
  hashlock?: string;
  coinType?: string;
  recipient?: string;
  timelock?: number;
  amount?: string;
  timestamp?: string;
  sourceFile?: string;
}

export function getLatestHtlcInfo(): HtlcMetadata {
  const htlcDir = path.resolve(__dirname, "../../deployments/htlc-locks");
  console.log("📂 HTLC directory being scanned:", htlcDir);  // Log the directory path

  const files = fs
    .readdirSync(htlcDir)
    .filter((f) => f.endsWith(".json"));

  // Get files with their mtime
  const filesWithMtime = files.map(f => {
    const filePath = path.join(htlcDir, f);
    const stat = fs.statSync(filePath);
    return { file: f, mtime: stat.mtimeMs };
  });

  // Sort by mtime descending (latest first)
  filesWithMtime.sort((a, b) => b.mtime - a.mtime);

  const sortedFiles = filesWithMtime.map(f => f.file);

  console.log("📄 Found JSON files (sorted latest first by mtime):", sortedFiles);  // Log all found files sorted by mtime

  if (sortedFiles.length === 0) {
    throw new Error("No HTLC lock files found.");
  }

  const latestPath = path.join(htlcDir, sortedFiles[0]);
  console.log("🔍 Reading latest JSON file:", latestPath);  // Log the latest file path

  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
  console.log("📋 Parsed JSON data:", data);  // Log the raw parsed data for inspection

  if (!data.packageId || !data.htlcId || !data.secret) {
    throw new Error("Invalid HTLC lock file: missing required fields.");
  }

  let hashlock: string | undefined;
  if (data.hashlock?.type === "Buffer" && data.hashlock.data) {
    hashlock = "0x" + Buffer.from(data.hashlock.data).toString("hex");
  } else if (data.hashlock && typeof data.hashlock === "string") {
    hashlock = data.hashlock;
  }

  return {
    packageId: data.packageId,
    htlcId: data.htlcId,
    secret: data.secret,
    hashlock,
    coinType: data.coinType,
    recipient: data.recipient,
    timelock: data.timelock,
    amount: data.amount,
    timestamp: data.timestamp || new Date().toISOString(),
    sourceFile: sortedFiles[0],
  };
}
