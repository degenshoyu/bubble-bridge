import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { loadKeypairFromEnvVar } from "../../utils/loadKeypair";
import { getLatestHtlcInfo } from "../../utils/getLatestHtlcInfo";

import dotenv from "dotenv";
dotenv.config();

function parseRefundError(errorMsg: string | undefined): string | null {
  if (!errorMsg) return null;
  if (errorMsg.includes(", 200")) return "❌ Already claimed.";
  if (errorMsg.includes(", 201")) return "❌ Timelock has not yet expired.";
  if (errorMsg.includes(", 202"))
    return "❌ You are not the sender of this HTLC.";
  return null;
}

const MODULE_NAME = "swap";
const FUNCTION_NAME = "refund";

async function main() {
  const info = getLatestHtlcInfo();
  const { packageId, htlcId: SWAP_OBJECT_ID, coinType } = info;

  if (!coinType) throw new Error("❌ coinType is missing");

  if (!SWAP_OBJECT_ID) {
    console.error("❌ Please provide a Swap object ID.");
    process.exit(1);
  }

  const CLOCK_OBJECT_ID = process.env.CLOCK_OBJECT_ID || "0x6";

  const keypair = loadKeypairFromEnvVar("LOCKER_PRIVKEY");
  const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
  const sender = keypair.getPublicKey().toSuiAddress();

  console.log("🧾 refund args:");
  console.log("SWAP_OBJECT_ID:", SWAP_OBJECT_ID);
  console.log("CLOCK_OBJECT_ID:", CLOCK_OBJECT_ID);
  console.log("sender:", sender);
  console.log("🧠 coinType:", coinType);

  const tx = new TransactionBlock();
  tx.setSender(sender);

  const refundCoin = tx.moveCall({
    target: `${packageId}::swap::refund`,
    typeArguments: [coinType],
    arguments: [tx.object(SWAP_OBJECT_ID), tx.object(CLOCK_OBJECT_ID)],
  });

  tx.transferObjects([refundCoin], tx.pure.address(sender));

  try {
    const result = await suiClient.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    const status = result.effects?.status.status;
    const error = result.effects?.status.error;
    const digest = result.digest;

    if (status === "success") {
      console.log("✅ Refund successful!");
      console.log("🔗 Tx Digest:", digest);

      const objChange = result.objectChanges?.find(
        (c) => c.type === "transferred" && "objectId" in c,
      );
      if (objChange && "objectId" in objChange) {
        const coinObjectId = objChange.objectId;
        const balance = info.amount;
        console.log(`🪙 Returned Coin ID: ${coinObjectId}`);
        console.log(`💰 Returned Coin Balance: ${balance}`);
        console.log(`🧾 Coin Type: ${coinType}`);
      }
    } else {
      console.log("❌ Refund failed on-chain!!");
      console.log("🔗 Tx Digest:", digest);
      console.log("🧾 Reason:", error ?? "Unknown on-chain failure");

      const explanation = parseRefundError(error);
      if (explanation) {
        console.log(explanation);
      }
    }
  } catch (e: any) {
    const msg = e.message ?? e.toString();
    console.log("🟥 Refund failed during transaction preparation!");
    console.log("🧨 Reason:", msg);

    const explanation = parseRefundError(msg);
    if (explanation) {
      console.log(explanation);
    }

    if (msg.includes("invalid") && msg.includes(SWAP_OBJECT_ID)) {
      console.log("🔍 Possible causes:");
      console.log("  - HTLC has already been refunded or claimed");
      console.log("  - You are not the owner");
      console.log("  - Wrong object ID");
    }
  }
}

main().catch((e) => {
  console.error("❌ Refund error:", e);
});
