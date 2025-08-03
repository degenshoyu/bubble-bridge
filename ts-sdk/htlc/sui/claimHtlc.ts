import "dotenv/config";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import {
  getFullnodeUrl,
  SuiClient,
  SuiMoveObject,
} from "@mysten/sui.js/client";
import { fromHEX } from "@mysten/sui.js/utils";
import { loadKeypairFromEnvVar } from "../../utils/loadKeypair";
import { getLatestHtlcInfo } from "../../utils/getLatestHtlcInfo";
import { getLatestHtlcInfoEvm } from "../../utils/getLatestHtlcInfoEvm";
import {
  getSecretFromEvmClaimTx,
  getLatestEvmClaimInfo,
} from "../../utils/getSecretFromEvmClaimTx";
import { createHash } from "crypto";
import path from "path";
import fs from "fs";
import { getLatestDeploy } from "../../utils/deployments";

import dotenv from "dotenv";
dotenv.config();

function parseHtlcError(errorMsg: string | undefined): string | null {
  if (!errorMsg) return null;

  if (errorMsg.includes("error_code: 100"))
    return "❌ Secret does not match hashlock.";
  if (errorMsg.includes("error_code: 101"))
    return "❌ You are not the designated recipient.";
  if (errorMsg.includes("error_code: 102"))
    return "❌ This HTLC has already been claimed.";
  if (errorMsg.includes("invalid input objects"))
    return "❌ Invalid HTLC ID or object does not exist.";
  return null;
}

function getLatestSuiLockDetails() {
  const htlcDir = path.resolve(__dirname, "../../../deployments/htlc-locks");
  const files = fs.readdirSync(htlcDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    throw new Error("No Sui HTLC lock files found.");
  }

  const filesWithMtime = files.map((f) => {
    const filePath = path.join(htlcDir, f);
    const stat = fs.statSync(filePath);
    return { file: f, mtime: stat.mtimeMs };
  });
  filesWithMtime.sort((a, b) => b.mtime - a.mtime);
  const latestFile = filesWithMtime[0].file;

  const latestPath = path.join(htlcDir, latestFile);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!data.htlcId) {
    throw new Error("Invalid Sui HTLC lock file: missing htlcId.");
  }

  return {
    htlcId: data.htlcId,
    coinType: data.coinType || "0x2::sui::SUI",
    packageId: data.packageId,
    sourceFile: latestFile,
  };
}

async function main() {
  const [evmClaimTxHash] = process.argv.slice(2);

  const suiLock = getLatestSuiLockDetails();
  const deploy = getLatestDeploy("testnet");
  const packageId = suiLock.packageId || deploy.packageId;
  const SWAP_OBJECT_ID = suiLock.htlcId;
  const coinType = suiLock.coinType;

  if (!SWAP_OBJECT_ID) {
    console.error("❌ Please provide an HTLC ID.");
    process.exit(1);
  }

  // Verify HTLC object exists on Sui
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  try {
    const htlcObject = await client.getObject({
      id: SWAP_OBJECT_ID,
      options: { showContent: true },
    });
    if (htlcObject.error || !htlcObject.data) {
      console.error("❌ HTLC object not found or invalid:", SWAP_OBJECT_ID);
      process.exit(1);
    }
  } catch (e: any) {
    console.error("❌ Failed to verify HTLC object:", e.message);
    process.exit(1);
  }

  let rawSecret: string;
  let secretSource: string;
  let mode: string;
  try {
    const evmInfo = getLatestHtlcInfoEvm();
    if (evmInfo.secret) {
      rawSecret = evmInfo.secret;
      secretSource = `EVM JSON (${evmInfo.sourceFile})`;
      mode = "Initiator (initiated on EVM)";
    } else {
      const suiInfo = getLatestHtlcInfo();
      if (suiInfo.secret) {
        rawSecret = suiInfo.secret;
        secretSource = `Sui JSON (${suiInfo.sourceFile})`;
        mode = "Initiator (initiated on Sui)";
      } else if (evmClaimTxHash) {
        rawSecret = await getSecretFromEvmClaimTx(evmClaimTxHash);
        secretSource = `EVM claim transaction (${evmClaimTxHash})`;
        mode = "Responder (EVM claim tx)";
      } else {
        const evmClaimInfo = getLatestEvmClaimInfo();
        rawSecret = evmClaimInfo.secret;
        secretSource = `EVM claim JSON (${evmClaimInfo.sourceFile})`;
        mode = "Responder (EVM claim JSON)";
      }
    }
  } catch (e: any) {
    console.error("❌ Failed to read secret:", e.message);
    process.exit(1);
  }

  const secret = Buffer.from(
    rawSecret.startsWith("0x") ? rawSecret.slice(2) : rawSecret,
    "hex"
  );
  const secretArray = Array.from(secret);

  const keypair = loadKeypairFromEnvVar("CLAIMER_PRIVKEY");
  const address = keypair.getPublicKey().toSuiAddress();

  console.log("🔐 Claimer Address:", address);
  console.log("🔄 Mode:", mode);
  console.log("🔁 Claiming HTLC:", SWAP_OBJECT_ID);
  console.log("🧩 Secret:", rawSecret);
  console.log("🧾 Secret Source:", secretSource);
  console.log(" Onchain Secret:", secretArray);

  const hash = createHash("sha256").update(secret).digest();
  const hashLock = new Uint8Array(hash);
  console.log("Hashlock:", hashLock);

  const tx = new TransactionBlock();
  tx.setGasBudget(10_000_000);

  const coins = tx.moveCall({
    target: `${packageId}::swap::claim`,
    typeArguments: [coinType],
    arguments: [
      tx.object(SWAP_OBJECT_ID),
      tx.pure.address(address),
      tx.pure(secretArray, "vector<u8>"),
    ],
  });

  const claimedCoin = coins[0];

  if (claimedCoin) {
    tx.transferObjects([claimedCoin], tx.pure.address(address));
  } else {
    console.warn("⚠️ No coin returned from claim()!");
  }

  let result;
  try {
    result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  } catch (e: any) {
    console.error("❌ Transaction execution failed:", e.message);
    process.exit(1);
  }

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
    process.exit(1);
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

  // Save claim info to JSON
  const claimsDir = path.join(
    __dirname,
    "../../../deployments/htlc-claims-sui"
  );
  fs.mkdirSync(claimsDir, { recursive: true });

  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(claimsDir, filename);

  const log = {
    txDigest: digest,
    claimer: address,
    htlcId: SWAP_OBJECT_ID,
    secret: rawSecret,
    secretSource: secretSource,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(filepath, JSON.stringify(log, null, 2));
  console.log("🧾 Saved claim info to", filepath);
}

main().catch((e) => {
  console.error("❌ Claim failed:", e.message);
  process.exit(1);
});
