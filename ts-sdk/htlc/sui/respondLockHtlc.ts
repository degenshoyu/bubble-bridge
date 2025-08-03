import { loadKeypairFromEnvVar } from "../../utils/loadKeypair";
import { getLatestDeploy } from "../../utils/deployments";
import { checkBalance } from "../../utils/checkBalance";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { bcs } from "@mysten/bcs";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

interface EvmHtlcMetadata {
  hashlock: string | { type: string; data: number[] };
  swapId: string;
  recipient: string;
  token: string;
  amount: string;
  timelock: number;
  txHash: string;
  locker: string;
  timestamp: string;
  sourceFile?: string;
}

// Utility to load the latest EVM HTLC JSON
function getLatestEvmHtlcInfo(): EvmHtlcMetadata {
  const dir = path.resolve(__dirname, "../../../deployments/htlc-locks-evm");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    throw new Error("No EVM HTLC JSON files found");
  }
  // Find the latest file by modification time
  const latestFile = files.reduce((latest, file) => {
    const latestPath = path.join(dir, latest || file); // Handle initial case
    const filePath = path.join(dir, file);
    return fs.statSync(filePath).mtime > fs.statSync(latestPath).mtime
      ? file
      : latest;
  }, files[0]);
  const filePath = path.join(dir, latestFile);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const hashLockValue = data.hashLock || data.hashlock;
  if (!hashLockValue || !data.timelock) {
    throw new Error(`Invalid EVM HTLC data in ${filePath}`);
  }
  return { ...data, hashlock: hashLockValue, sourceFile: filePath }; // Normalize to 'hashlock'
}

async function main() {
  // Step 1: Parse command-line arguments
  const [recipient, coinType, amountRaw, hashlockHex, timelockStr] =
    process.argv.slice(2);
  if (!recipient || !coinType || !amountRaw) {
    console.error(
      "Usage: npx ts-node respondLockHtlc.ts <recipient> <coinType> <amount> [hashlockHex] [timelock]"
    );
    process.exit(1);
  }

  const amount = BigInt(amountRaw);
  const currentTime = Math.floor(Date.now() / 1000);
  const timelock = timelockStr ? parseInt(timelockStr) : currentTime + 5 * 60;

  if (timelock <= currentTime) {
    console.error("❌ Timelock must be in the future.");
    process.exit(1);
  }

  // Step 2: Load signer and client
  const signer = loadKeypairFromEnvVar("LOCKER_PRIVKEY");
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const locker = signer.getPublicKey().toSuiAddress();

  // Step 3: Load latest deployed HTLC info
  const deploy = getLatestDeploy("testnet");
  const packageId = deploy.packageId;

  // Step 4: Get hashlock
  let hashlockBytes: Uint8Array;
  let hashlockSource: string;
  let initiatorTimelock: number | undefined;

  if (
    hashlockHex &&
    hashlockHex.startsWith("0x") &&
    hashlockHex.length === 66
  ) {
    hashlockBytes = Buffer.from(hashlockHex.slice(2), "hex");
    hashlockSource = "command-line";
  } else {
    try {
      const evmInfo: EvmHtlcMetadata = getLatestEvmHtlcInfo();
      const hashLockValue = evmInfo.hashlock;
      if (hashLockValue) {
        if (typeof hashLockValue === "string") {
          hashlockBytes = Buffer.from(hashLockValue.slice(2), "hex");
        } else if (typeof hashLockValue === "object" && hashLockValue.data) {
          hashlockBytes = Buffer.from(hashLockValue.data);
        } else {
          throw new Error("Invalid hashlock format in EVM JSON");
        }
        hashlockSource = `EVM JSON (${evmInfo.sourceFile})`;
        initiatorTimelock = evmInfo.timelock;
      } else {
        throw new Error(
          "Invalid hashlock in EVM JSON: missing or invalid format"
        );
      }
      // Warn if initiator timelock is suspiciously far
      if (initiatorTimelock && initiatorTimelock > currentTime + 24 * 3600) {
        console.warn(
          `⚠️ Initiator timelock (${initiatorTimelock}) is more than 24 hours in the future. Verify correctness.`
        );
      }
      // Validate initiator timelock > responder timelock
      if (initiatorTimelock && initiatorTimelock <= timelock) {
        throw new Error(
          `Responder timelock (${timelock}) must be less than initiator's timelock (${initiatorTimelock})`
        );
      }
    } catch (e: any) {
      console.error("❌ Failed to read hashlock from EVM JSON:", e.message);
      process.exit(1);
    }
  }

  if (hashlockBytes.length !== 32) {
    console.error("❌ Hashlock must be 32 bytes.");
    process.exit(1);
  }
  const hashlockHexStr = `0x${Buffer.from(hashlockBytes).toString("hex")}`;

  // Step 5: Check balance
  const coin = await checkBalance(client, locker, coinType, amount);
  if (!coin) throw new Error("Insufficient balance or no coin found");

  // Step 6: Build transaction
  const tx = new TransactionBlock();
  tx.setGasBudget(10_000_000n);

  const [coinInput] = tx.splitCoins(tx.gas, [tx.pure(amount)]);

  tx.moveCall({
    target: `${packageId}::swap::init_swap`,
    typeArguments: [coinType],
    arguments: [
      tx.pure(recipient),
      coinInput,
      tx.pure(amount),
      tx.pure(bcs.vector(bcs.u8()).serialize(hashlockBytes)),
      tx.pure(timelock),
    ],
  });

  // Step 7: Execute transaction
  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });

  // Step 8: Extract HTLC ID
  const htlcId = (
    result.objectChanges?.find(
      (c) => c.type === "created" && c.objectType?.includes("swap::Swap")
    ) as any
  )?.objectId;

  if (!htlcId) {
    console.error("❌ Failed to find HTLC ID in transaction result");
    process.exit(1);
  }

  console.log("🔐 Responder Locker:", locker);
  console.log("📦 Recipient (Initiator):", recipient);
  console.log("💰 Coin Type:", coinType, "| Amount:", amount.toString());
  console.log("🔒 Hashlock:", hashlockHexStr, `(from ${hashlockSource})`);
  console.log("⏳ Timelock:", timelock);
  console.log("🔁 HTLC ID:", htlcId);
  console.log("🔗 Tx Digest:", result.digest);
  console.log("✅ Respond lock successful!");

  // Step 9: Save to JSON
  const lockInfo = {
    hashlock: hashlockHexStr,
    htlcId,
    recipient,
    coinType,
    amount: amount.toString(),
    timelock,
    txDigest: result.digest,
    locker,
    timestamp: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "../../../deployments/htlc-locks");
  fs.mkdirSync(dir, { recursive: true });

  const filename = `responder-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, JSON.stringify(lockInfo, null, 2));
  console.log("💾 Saved responder HTLC lock info to", filepath);
}

main().catch((e) => {
  console.error("❌ Respond locking failed:", e);
  process.exit(1);
});
