import "dotenv/config";
import { arrayify } from "@ethersproject/bytes";
import {
  hexlify,
  Log,
  Interface,
  parseUnits,
  JsonRpcProvider,
  Wallet,
  Contract,
  keccak256,
  solidityPacked,
} from "ethers";
import { getLatestEvmDeployment } from "../../utils/deployments-evm";
import { loadEvmPrivateKey } from "../../utils/loadKeypair";
import { genHashLock } from "../../utils/genHashLock";
import fs from "fs";
import path from "path";

async function main() {
  const [recipient, tokenAddressOrETH, amountRaw] = process.argv.slice(2);
  if (!recipient || !tokenAddressOrETH || !amountRaw) {
    console.error(
      "Usage: ts-node lockHtlc.ts <recipient> <tokenAddress|ETH> <amount>"
    );
    process.exit(1);
  }

  const amount = parseUnits(amountRaw, "ether");
  const provider = new JsonRpcProvider(process.env.EVM_SEPOLIA_RPC_URL);

  const signer = loadEvmPrivateKey("EVM_LOCKER_PRIVKEY").connect(provider);
  const locker = await signer.getAddress();

  console.log("🔐 Locker:", locker);
  console.log("📦 Recipient:", recipient);
  console.log(
    "💰 Token/ETH:",
    tokenAddressOrETH,
    "| Amount:",
    amount.toString()
  );

  const { contractAddress, abi } = getLatestEvmDeployment();
  const contract = new Contract(contractAddress, abi, signer);

  const { secret, secretHex, hashLock } = genHashLock();

  const timelock = Math.floor(Date.now() / 1000) + 5 * 60;

  console.log("🔑 Secret:", secretHex);
  console.log("⏳ Timelock:", timelock);

  if (tokenAddressOrETH.toUpperCase() === "ETH") {
    const tokenAddress = "0x0000000000000000000000000000000000000000";
    const tx = await contract.lock(recipient, hashLock, timelock, {
      value: amount,
      gasLimit: 500_000n,
    });
    console.log("🚀 Sent lock tx:", tx.hash);
    const receipt = await tx.wait();

    if (receipt.status === 0) {
      console.error("Transaction Failed:", receipt);
      process.exit(1);
    }

    console.log("Transaction Data:", receipt);
    console.log("Log:", receipt.logs);

    const log = receipt.logs.find((log: Log) => {
      try {
        contract.interface.parseLog(log);
        return true;
      } catch {
        return false;
      }
    });

    if (!log) {
      throw new Error("❌ Failed to find Locked event log");
    }

    const parsedLog = contract.interface.parseLog(log);
    const swapId = parsedLog!.args.swapId;

    console.log("🔁 Emitted swapId from chain:", swapId);

    const lockInfo = {
      secret: secretHex,
      hashLock,
      swapId,
      recipient,
      token: tokenAddressOrETH,
      amount: amount.toString(),
      timelock,
      txHash: tx.hash,
      locker,
      timestamp: new Date().toISOString(),
    };

    console.log("✅ ETH locked!");
    const dir = path.join(__dirname, "../../../deployments/htlc-locks-evm");
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, JSON.stringify(lockInfo, null, 2));
    console.log("💾 Saved HTLC lock info to", filepath);
  } else {
    const tokenAddress = tokenAddressOrETH;
    const allowance = await new Contract(
      tokenAddress,
      [
        "function approve(address spender, uint256 amount) public returns (bool)",
      ],
      signer
    ).approve(contractAddress, amount);
    await allowance.wait();
    console.log("✅ Token approved!");

    const tx = await contract.lock(
      recipient,
      tokenAddress,
      amount,
      hashLock,
      timelock,
      arrayify(secretHex)
    );
    console.log("🚀 Sent lockToken tx:", tx.hash);
    await tx.wait();
    console.log("✅ Token locked!");
  }
}

main().catch((e) => {
  console.error("❌ Locking failed:", e);
  process.exit(1);
});
