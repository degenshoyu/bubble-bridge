import "dotenv/config";
import { ethers } from "ethers";
import { getLatestEvmDeployment } from "../../utils/deployments-evm";
import { getLatestHtlcInfo, HtlcMetadata } from "../../utils/getLatestHtlcInfo";
import { loadEvmPrivateKey } from "../../utils/loadKeypair";
import fs from "fs";
import path from "path";

async function main() {
  const [recipient, tokenAddressOrETH, amountRaw, hashlockHex, timelockStr] =
    process.argv.slice(2);
  if (!recipient || !tokenAddressOrETH || !amountRaw) {
    console.error(
      "Usage: npx ts-node respondLockHtlc.ts <recipient> <tokenAddress|ETH> <amount> [hashlockHex] [timelock]"
    );
    process.exit(1);
  }

  const amount = ethers.parseUnits(amountRaw, "ether");
  // Default timelock: 5 minutes from now, or use provided timelock
  const currentTime = Math.floor(Date.now() / 1000);
  const timelock = timelockStr ? parseInt(timelockStr) : currentTime + 8 * 60;

  if (timelock <= currentTime) {
    console.error("❌ Timelock must be in the future.");
    process.exit(1);
  }

  // Get hashlock: prefer Sui JSON, fallback to command-line hex
  let hashlockBytes: Uint8Array;
  let hashlockSource: string;
  let initiatorTimelock: number | undefined;
  if (
    hashlockHex &&
    hashlockHex.startsWith("0x") &&
    hashlockHex.length === 66
  ) {
    hashlockBytes = ethers.getBytes(hashlockHex);
    hashlockSource = "command-line";
  } else {
    try {
      const suiInfo: HtlcMetadata = getLatestHtlcInfo();
      if (suiInfo.hashlock) {
        hashlockBytes = ethers.getBytes(suiInfo.hashlock);
        hashlockSource = `Sui JSON (${suiInfo.sourceFile})`;
        initiatorTimelock = suiInfo.timelock;
      } else {
        throw new Error(
          "Invalid hashlock in Sui JSON: missing or invalid format"
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
      console.error("❌ Failed to read hashlock from Sui JSON:", e.message);
      process.exit(1);
    }
  }

  if (hashlockBytes.length !== 32) {
    console.error("❌ Hashlock must be 32 bytes.");
    process.exit(1);
  }
  const hashlockHexStr = ethers.hexlify(hashlockBytes);

  const { contractAddress, abi } = getLatestEvmDeployment();
  const provider = new ethers.JsonRpcProvider(process.env.EVM_SEPOLIA_RPC_URL);
  const signer = loadEvmPrivateKey("EVM_LOCKER_PRIVKEY").connect(provider);
  const locker = await signer.getAddress();

  console.log("🔐 Responder Locker:", locker);
  console.log("📦 Recipient (Initiator):", recipient);
  console.log(
    "💰 Token/ETH:",
    tokenAddressOrETH,
    "| Amount:",
    amount.toString()
  );
  console.log("🔒 Hashlock:", hashlockHexStr, `(from ${hashlockSource})`);
  console.log("⏳ Timelock:", timelock);

  const contract = new ethers.Contract(contractAddress, abi, signer);

  let tx;
  let tokenAddress;
  if (tokenAddressOrETH.toUpperCase() === "ETH") {
    tokenAddress = "0x0000000000000000000000000000000000000000";
    tx = await contract.lock(recipient, hashlockBytes, timelock, {
      value: amount,
      gasLimit: 500_000n,
    });
  } else {
    tokenAddress = tokenAddressOrETH;
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function approve(address spender, uint256 amount) public returns (bool)",
      ],
      signer
    );
    const approveTx = await tokenContract.approve(contractAddress, amount);
    await approveTx.wait();
    console.log("✅ Token approved!");

    tx = await contract.lockToken(
      recipient,
      tokenAddress,
      amount,
      hashlockBytes,
      timelock,
      {
        gasLimit: 500_000n,
      }
    );
  }

  console.log("🚀 Sent respond lock tx:", tx.hash);
  const receipt = await tx.wait();

  if (receipt.status === 0) {
    console.error("❌ Transaction Failed:", receipt);
    process.exit(1);
  }

  // Extract swapId from Locked event
  const iface = new ethers.Interface(abi);
  const log = receipt.logs.find((log: any) => {
    try {
      iface.parseLog(log);
      return true;
    } catch {
      return false;
    }
  });

  if (!log) {
    throw new Error("❌ Failed to find Locked event log");
  }

  const parsedLog = iface.parseLog(log);
  const swapId = parsedLog!.args.swapId;

  console.log("🔁 Emitted swapId from chain:", swapId);
  console.log("✅ Respond lock successful!");

  // Save to JSON (no secret)
  const lockInfo = {
    hashlock: hashlockHexStr,
    swapId: swapId.toString(),
    recipient,
    token: tokenAddressOrETH,
    amount: amount.toString(),
    timelock,
    txHash: tx.hash,
    locker,
    timestamp: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "../../../deployments/htlc-locks-evm");
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
