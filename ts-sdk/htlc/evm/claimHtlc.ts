import "dotenv/config";
import { ethers } from "ethers";
import { getLatestHtlcInfoEvm } from "../../utils/getLatestHtlcInfoEvm";
import { getLatestEvmDeployment } from "../../utils/deployments-evm";
import { loadEvmPrivateKey } from "../../utils/loadKeypair";
import path from "path";
import fs from "fs";

async function main() {
  const info = getLatestHtlcInfoEvm();
  const { contractAddress, abi } = getLatestEvmDeployment();
  const provider = new ethers.JsonRpcProvider(process.env.EVM_SEPOLIA_RPC_URL);
  const signer = loadEvmPrivateKey("EVM_CLAIMER_PRIVKEY").connect(provider);

  console.log("🔐 Claimer Address:", await signer.getAddress());
  console.log("📦 Claiming HTLC swapId:", info.swapId);
  console.log("🔑 Secret (hex):", info.secret);

  const contract = new ethers.Contract(contractAddress, abi, signer);

  const tx = await contract.claim(info.swapId, info.secret.slice(2));
  console.log("🚀 Sent claim tx:", tx.hash);
  await tx.wait();
  console.log("🎉 HTLC claimed successfully!");

  const claimsDir = path.join(
    __dirname,
    "../../../deployments/htlc-claims-evm"
  );
  fs.mkdirSync(claimsDir, { recursive: true });

  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(claimsDir, filename);

  const log = {
    txHash: tx.hash,
    claimer: await signer.getAddress(),
    swapId: info.swapId,
    secret: info.secret,
    sourceFile: info.sourceFile,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(filepath, JSON.stringify(log, null, 2));
  console.log("🧾 Saved claim info to", filepath);
}

main().catch((err) => {
  console.error("❌ Claim failed:", err);
  process.exit(1);
});
