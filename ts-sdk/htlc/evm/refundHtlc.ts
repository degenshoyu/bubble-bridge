import "dotenv/config";
import { ethers } from "ethers";
import {
  getLatestHtlcInfoEvm,
  EvmHtlcMetadata,
} from "../../utils/getLatestHtlcInfoEvm";
import { getLatestEvmDeployment } from "../../utils/deployments-evm";
import { loadEvmPrivateKey } from "../../utils/loadKeypair";
import { Contract } from "ethers";

const HTLC_CONTRACT_ABI = [
  "function refund(bytes32 swapId) external",
  "event Refunded(bytes32 indexed swapId, address indexed refunder)",
];

async function main() {
  try {
    const info: EvmHtlcMetadata = getLatestHtlcInfoEvm();
    const { swapId, token, amount, timelock, locker } = info;

    if (!swapId) {
      console.error("❌ Please provide a Swap ID.");
      process.exit(1);
    }

    if (!token || !amount || !timelock || !locker) {
      console.error(
        "❌ Missing required HTLC metadata (token, amount, timelock, or locker)."
      );
      process.exit(1);
    }

    const { contractAddress, abi } = getLatestEvmDeployment();
    if (!contractAddress) {
      console.error(
        "❌ Failed to retrieve contract address from deployment files."
      );
      process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(
      process.env.EVM_SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth"
    );
    const wallet = loadEvmPrivateKey("EVM_LOCKER_PRIVKEY");
    const contract = new Contract(
      contractAddress,
      abi,
      wallet.connect(provider)
    );

    console.log("🧾 Refund args:");
    console.log("Swap ID:", swapId);
    console.log("Sender (Locker):", locker);
    console.log("Token:", token);
    console.log("Amount:", amount);
    console.log("Timelock:", timelock);
    console.log("Contract Address:", contractAddress);

    const tx = await contract.refund(swapId);
    console.log("⏳ Waiting for transaction to be mined...");
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log("✅ Refund successful!");
      console.log("🔗 Tx Hash:", receipt.transactionHash);
      console.log(`🪙 Refunded Amount: ${amount}`);
      console.log(`🧾 Token: ${token}`);
    } else {
      console.log("❌ Refund failed on-chain!");
      console.log("🔗 Tx Hash:", receipt.transactionHash);
    }
  } catch (e: any) {
    console.log("🟥 Refund failed!");
    console.log("🧨 Reason:", e.message || e.toString());

    if (e.reason?.includes("Swap not found")) {
      console.log("🔍 Possible causes:");
      console.log("  - Invalid swap ID");
    } else if (e.reason?.includes("Not the sender")) {
      console.log("🔍 Possible cause: You are not the sender of this HTLC.");
    } else if (e.reason?.includes("Already claimed")) {
      console.log("🔍 Possible cause: HTLC has already been claimed.");
    } else if (e.reason?.includes("Already refunded")) {
      console.log("🔍 Possible cause: HTLC has already been refunded.");
    } else if (e.reason?.includes("Timelock not expired")) {
      console.log("🔍 Possible cause: Timelock has not yet expired.");
    }
  }
}

main().catch((e) => {
  console.error("❌ Refund error:", e);
});
