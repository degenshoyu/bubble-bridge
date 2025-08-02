import { TransactionBlock } from "@mysten/sui.js/transactions";
import {
  getFullnodeUrl,
  SuiClient,
  SuiMoveObject,
} from "@mysten/sui.js/client";
import { fromHEX } from "@mysten/sui.js/utils";
import { loadKeypairFromEnvVar } from "../utils/loadKeypair";
import { getLatestHtlcInfo } from "../utils/getLatestHtlcInfo";
import { createHash } from "crypto";

import dotenv from "dotenv";
dotenv.config();

const info = getLatestHtlcInfo();
const { packageId, htlcId: SWAP_OBJECT_ID, secret: rawSecret, coinType } = info;

function parseHtlcError(errorMsg: string | undefined): string | null {
  if (!errorMsg) return null;

  if (errorMsg.includes("error_code: 100"))
    return "❌ Secret does not match hashlock.";
  if (errorMsg.includes("error_code: 101"))
    return "❌ You are not the designated recipient.";
  if (errorMsg.includes("error_code: 102"))
    return "❌ This HTLC has already been claimed.";
  return null;
}

async function main() {
  const secret = Buffer.from(rawSecret, "hex");
  const secretArray = Array.from(secret);

  const keypair = loadKeypairFromEnvVar("CLAIMER_PRIVKEY");
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const address = keypair.getPublicKey().toSuiAddress();

  console.log("🔐 Claimer Address:", address);
  console.log("🔁 Claiming HTLC:", SWAP_OBJECT_ID);
  console.log("🧩 JSON Secret:", rawSecret);
  console.log(" Onchain Secret", secretArray);

  const hash = createHash("sha256").update(secret).digest();
  const hashLock = new Uint8Array(hash);
  console.log(hashLock);

  const tx = new TransactionBlock();
  tx.setGasBudget(10_000_000);

  if (!coinType) {
    throw new Error("❌ coinType is missing");
  }

  const coins = tx.moveCall({
    target: `${packageId}::swap::claim`,
    typeArguments: [coinType],
    arguments: [
      tx.object(SWAP_OBJECT_ID),
      tx.pure(address),
      tx.pure(secretArray, "vector<u8>"),
    ],
  });

  const claimedCoin = coins[0];

  if (claimedCoin) {
    tx.transferObjects([claimedCoin], tx.pure(address));
  } else {
    console.warn("⚠️ No coin returned from claim()!");
  }

  const result = await client.signAndExecuteTransactionBlock({
    signer: keypair,
    transactionBlock: tx,
    requestType: "WaitForLocalExecution",
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  const status = result.effects?.status.status;
  const error = result.effects?.status.error;
  const digest = result.digest;

  if (status === "success") {
    console.log("✅ Claim successful!");
    console.log("🔗 Tx Digest:", digest);
  } else {
    console.log("❌ Claim failed!");
    console.log("🔗 Tx Digest:", digest);
    console.log("🧾 Reason:", error ?? "Unknown error");

    const explanation = parseHtlcError(error);
    if (explanation) {
      console.log(explanation);
    }
  }

  const unwrapped = result.effects?.unwrapped;
  if (unwrapped?.length) {
    const coinObjectId = unwrapped[0].reference.objectId;
    const coinInfo = await client.getObject({
      id: coinObjectId,
      options: {
        showContent: true,
      },
    });

    const content = coinInfo.data?.content;
    if (content && typeof content === "object" && "fields" in content) {
      const fields = (content as SuiMoveObject).fields;
      const balance = (fields as any)["balance"];
      console.log(`🪙 Returned Coin ID: ${coinObjectId}`);
      console.log(`💰 Returned Coin Balance: ${balance}`);
      console.log(`🧾 Coin Type: ${coinType}`);
    } else {
      console.log("⚠️ Unexpected content format:", content);
    }
  } else {
    console.log("🌐 No coin unwrapped.");
  }
}

main().catch((e) => {
  console.error("❌ Claim failed:", e.message);
  process.exit(1);
});
