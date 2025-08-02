import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { loadKeypairFromEnvVar } from "../utils/loadKeypair";
import { getLatestHtlcInfo } from "../utils/getLatestHtlcInfo";

import dotenv from "dotenv";
dotenv.config();

const info = getLatestHtlcInfo();
const { packageId, coinType, htlcId: SWAP_OBJECT_ID } = info;
const MODULE_NAME = "swap";
const FUNCTION_NAME = "refund";

const CLOCK_OBJECT_ID = process.env.CLOCK_OBJECT_ID || "0x6";

async function main() {
  if (!SWAP_OBJECT_ID) {
    console.error("❌ Please provide a Swap object ID.");
    process.exit(1);
  }

  const keypair = loadKeypairFromEnvVar("LOCKER_PRIVKEY");
  const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
  const sender = keypair.getPublicKey().toSuiAddress();

  const tx = new TransactionBlock();

  tx.setSender(sender);

  console.log("🧾 refund args:");
  console.log("SWAP_OBJECT_ID:", SWAP_OBJECT_ID);
  console.log("CLOCK_OBJECT_ID:", CLOCK_OBJECT_ID);
  console.log("sender:", sender);

  const coinType = info.coinType;
  console.log("🧠 coinType:", coinType);

  tx.transferObjects(
    [
      tx.moveCall({
        target: `${packageId}::swap::refund`,
        typeArguments: [coinType!],
        arguments: [tx.object(SWAP_OBJECT_ID), tx.object(CLOCK_OBJECT_ID)],
      }),
    ],
    tx.pure.address(sender),
  );

  const result = await suiClient.signAndExecuteTransactionBlock({
    signer: keypair,
    transactionBlock: tx,
    options: { showEffects: true, showEvents: true },
  });

  console.log("✅ Refund transaction complete:", result.effects?.status);
  console.log("🔗 Tx digest:", result.digest);
}

main().catch((e) => {
  console.error("❌ Refund error:", e);
});
