import fs from "fs";
import path from "path";

export interface EvmHtlcMetadata {
  secret?: string;
  hashlock?: string;
  swapId: string;
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
  console.log("📂 EVM HTLC directory being scanned:", htlcDir);

  const files = fs.readdirSync(htlcDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    throw new Error("No HTLC lock files found in EVM directory.");
  }

  const filesWithMtime = files.map((f) => {
    const filePath = path.join(htlcDir, f);
    const stat = fs.statSync(filePath);
    return { file: f, mtime: stat.mtimeMs };
  });

  filesWithMtime.sort((a, b) => b.mtime - a.mtime);

  const sortedFiles = filesWithMtime.map((f) => f.file);

  console.log(
    "📄 Found JSON files (sorted latest first by mtime):",
    sortedFiles
  );

  for (const { file } of filesWithMtime) {
    const filePath = path.join(htlcDir, file);
    console.log("🔍 Reading JSON file:", filePath);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log("📋 Parsed JSON data:", data);

    if (data.swapId) {
      let hashlock = data.hashlock;
      if (data.hashlock?.type === "Buffer" && data.hashlock.data) {
        hashlock = "0x" + Buffer.from(data.hashlock.data).toString("hex");
      }
      return {
        secret: data.secret,
        hashlock,
        swapId: data.swapId,
        recipient: data.recipient,
        token: data.token,
        amount: data.amount,
        timelock: data.timelock,
        txHash: data.txHash,
        locker: data.locker,
        timestamp: data.timestamp || new Date().toISOString(),
        sourceFile: file,
      };
    }
  }

  throw new Error(
    "No valid EVM HTLC lock file found with required fields (swapId)."
  );
}
