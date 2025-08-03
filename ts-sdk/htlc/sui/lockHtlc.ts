import { loadKeypairFromEnvVar } from "../../utils/loadKeypair";
import { getLatestDeploy } from "../../utils/deployments";
import { checkBalance } from "../../utils/checkBalance";
import { genHashLock } from "../../utils/genHashLock";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { fromB64, normalizeSuiAddress } from "@mysten/sui.js/utils";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";
import { bcs } from "@mysten/bcs";

async function main() {
  // Step 1: Load signer
  const signer = loadKeypairFromEnvVar("LOCKER_PRIVKEY");
  console.log("🔑 Using signer address:", signer.getPublicKey().toSuiAddress());

  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const address = signer.getPublicKey().toSuiAddress();

  // Step 2: Load latest deployed HTLC info
  const deploy = getLatestDeploy("testnet");
  const packageId = deploy.packageId;

  // Step 3: Define inputs
  const recipient = process.argv[2] || address;
  const coinType = process.argv[3] || "0x2::sui::SUI";
  const amount = BigInt(process.argv[4] || "100000000");

  // Step 4: Check balance
  const coin = await checkBalance(client, address, coinType, amount);
  if (!coin) throw new Error("Insufficient balance or no coin found");

  // Step 5: Generate secret + hashlock
  const { secret, hashLock } = genHashLock();

  if (!(hashLock instanceof Uint8Array)) {
    throw new Error("hashLock is not a Uint8Array");
  }

  // Step 6: Set timelock
  const now = Math.floor(Date.now() / 1000);
  const lockDuration = 5 * 60;
  const timelock = now + lockDuration;

  // Step 7: Build programmable tx
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
      tx.pure(bcs.vector(bcs.u8()).serialize(hashLock)),
      tx.pure(timelock),
    ],
  });

  // Step 8: Execute
  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });

  const htlcId = (
    result.objectChanges?.find(
      (c) => c.type === "created" && c.objectType?.includes("swap::Swap")
    ) as any
  )?.objectId;

  console.log("🔁 HTLC ID:", htlcId || "Not found");

  const createdObjects = result.objectChanges?.filter(
    (o) => o.type === "created"
  );
  console.log("🆕 Created objects:", createdObjects);

  console.log("✅ HTLC lock success!");
  console.log("🔐 Secret:", secret);
  console.log("🧩 HashLock:", hashLock);
  console.log("📦 Package:", packageId);
  console.log("🔗 Tx Digest:", result.digest);

  // Save result
  function safeStringify(obj: any) {
    return JSON.stringify(
      obj,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
  }

  console.log(safeStringify(result));

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.resolve(__dirname, "../../../deployments/htlc-locks");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${timestamp}.json`);

  fs.writeFileSync(
    outputPath,
    safeStringify({
      secret: secret,
      hashlock: hashLock,
      packageId,
      htlcId,
      digest: result.digest,
      timestamp: new Date().toISOString(),
      amount,
      recipient,
      coinType,
      timelock,
    })
  );

  console.log("💾 HTLC data saved to:", outputPath);
}

main()
  .then(() => {
    console.log("✅ Done.");
  })
  .catch((err) => {
    console.error("❌ Error during HTLC creation:", err);
    process.exit(1);
  });
