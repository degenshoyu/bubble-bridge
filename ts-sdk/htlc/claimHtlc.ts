import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { fromHEX } from "@mysten/sui.js/utils";
import { loadKeypairFromEnvVar } from "../utils/loadKeypair";
import { getLatestHtlcInfo } from "../utils/getLatestHtlcInfo";
import { createHash } from "crypto";

import dotenv from "dotenv";
dotenv.config();

async function main() {
  const info = getLatestHtlcInfo();
  const secret = Buffer.from(info.secret, "hex");
  const secretArray = Array.from(secret);

  const keypair = loadKeypairFromEnvVar("CLAIMER_PRIVKEY");
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const address = keypair.getPublicKey().toSuiAddress();

  console.log("🔐 Claimer Address:", address);
  console.log("🔁 Claiming HTLC:", info.htlcId);
  console.log("🧩 JSON Secret:", info.secret);
  console.log(" Onchain Secret", secretArray);

  const hash = createHash("sha256").update(secret).digest();
  const hashLock = new Uint8Array(hash);
  console.log(hashLock);

  const tx = new TransactionBlock();
  tx.setGasBudget(10_000_000);

  const coins = tx.moveCall({
    target: `${info.packageId}::swap::claim`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [
      tx.object(info.htlcId),
      tx.pure(address),
      tx.pure(secretArray, "vector<u8>"),
      // tx.pure([...secretBytes], "vector<u8>"),
    ],
  });

  const claimedCoin = coins[0];

  console.log("🔍 claimedCoin =", claimedCoin);

  if (claimedCoin) {
    tx.transferObjects([claimedCoin], tx.pure(address));
  } else {
    console.warn("⚠️ No coin returned from claim()!");
  }

  const result = await client.signAndExecuteTransactionBlock({
    signer: keypair,
    transactionBlock: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log("✅ Claim successful!");
  console.log("🔗 Tx Digest:", result.digest);
  console.log(
    "🪙 Returned coin:",
    result.objectChanges?.find((c) => c.type === "created")?.objectId,
  );
}

main().catch((e) => {
  console.error("❌ Claim failed:", e.message);
  process.exit(1);
});
