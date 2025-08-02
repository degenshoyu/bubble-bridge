import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🔑 Deployer address:", await signer.getAddress());
  console.log("🔗 Network:", (await ethers.provider.getNetwork()).name);

  const MockTokenFactory = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockTokenFactory.deploy("Test USDC", "tUSDC");
  await mockToken.waitForDeployment();

  const tokenAddress = await mockToken.getAddress();
  console.log("✅ tUSDC deployed to:", tokenAddress);

  const mintAmount = ethers.parseUnits("1000000", 18);

  const mockERC20Abi = ["function mint(address to, uint256 amount) external"];
  const token = new ethers.Contract(tokenAddress, mockERC20Abi, signer);

  const tx = await token.mint(await signer.getAddress(), mintAmount);
  await tx.wait();

  console.log(`💸 Minted ${mintAmount.toString()} tUSDC to deployer`);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
