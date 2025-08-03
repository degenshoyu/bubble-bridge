import "dotenv/config";
import ethers from "ethers";
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

  const amount = ethers.parseUnits(amountRaw, "ether");
  const provider = new ethers.JsonRpcProvider(process.env.EVM_SEPOLIA_RPC_URL);

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
  const contract = new ethers.Contract(contractAddress, abi, signer);

  const { secret, secretHex, hashLock } = genHashLock();

  const timelock = Math.floor(Date.now() / 1000) + 10 * 60;

  console.log("🔑 Secret:", secretHex);
  console.log("⏳ Timelock:", timelock);

  const token =
    tokenAddressOrETH.toUpperCase() === "ETH"
      ? "0x0000000000000000000000000000000000000000"
      : tokenAddressOrETH;

  // Encode predicateData for timestampBelow(timelock)
  const selector = ethers.id("timestampBelow(uint256)").slice(0, 10);
  const encodedTime = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256"],
    [timelock]
  );
  const predicateData = ethers.concat([selector, encodedTime]);
  console.log("📜 Predicate Data:", predicateData);

  // Approve token to HTLC contract if not ETH
  if (tokenAddressOrETH.toUpperCase() !== "ETH") {
    const tokenContract = new ethers.Contract(
      token,
      [
        "function approve(address spender, uint256 amount) public returns (bool)",
      ],
      signer
    );
    const allowanceTx = await tokenContract.approve(contractAddress, amount);
    await allowanceTx.wait();
    console.log("✅ Token approved to HTLC contract!");
  }

  const txOptions = {
    value: tokenAddressOrETH.toUpperCase() === "ETH" ? amount : 0n,
    gasLimit: 500_000n,
  };

  const tx = await contract.lockWith1inch(
    recipient,
    token,
    amount,
    hashLock,
    timelock,
    predicateData,
    txOptions
  );
  console.log("🚀 Sent lockWith1inch tx:", tx.hash);
  const receipt = await tx.wait();

  if (receipt.status === 0) {
    console.error("Transaction Failed:", receipt);
    process.exit(1);
  }

  const log = receipt.logs.find((log) => {
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
    predicateData,
  };

  console.log("✅ Locked with 1inch integration!");

  const dir = path.join(__dirname, "../../../deployments/htlc-locks-evm");
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, JSON.stringify(lockInfo, null, 2));
  console.log("💾 Saved HTLC lock info to", filepath);
}

main().catch((e) => {
  console.error("❌ Locking failed:", e);
  process.exit(1);
});

/* Note: To fully utilize the 1inch integration, create and sign a limit order off-chain using the @1inch/limit-order-sdk.
   This allows conditional execution based on the predicate (timelock) and potentially custom interactions for hashlock checks.
   Example (requires npm install @1inch/limit-order-sdk):

   import { LimitOrderBuilder, Web3ProviderConnector } from "@1inch/limit-order-sdk";

   // After the lock...
   const chainId = await provider.getNetwork().then(net => net.chainId);
   const connector = new Web3ProviderConnector(provider);
   const protocolAddress = await contract.ONE_INCH_ADDRESS(); // Or hardcode the correct address for your chain
   const limitOrderBuilder = new LimitOrderBuilder({ chainId, connector, protocolAddress });

   const order = limitOrderBuilder.buildLimitOrder({
     makerAssetAddress: token,
     takerAssetAddress: "0x0000000000000000000000000000000000000000", // Dummy for conditional transfer
     makerAddress: contractAddress, // Use contract as maker (requires EIP-1271 support in contract for signature validation)
     makerAmount: amount.toString(),
     takerAmount: "0",
     predicate: predicateData,
     receiver: recipient,
     // interactions: ... // Encode pre/post interactions for hashlock check if needed
   });

   const typedData = limitOrderBuilder.buildLimitOrderTypedData(order);
   const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.message);

   // Post to 1inch API (if supported on your chain)
   const response = await fetch(`https://limit-orders.1inch.io/v4.0/${chainId}/limit-order`, {
     method: 'POST',
     body: JSON.stringify({ order, signature })
   });

   console.log("✅ Limit order posted to 1inch!");

   // Save orderHash, etc., to the JSON if needed.
*/
