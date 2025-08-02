const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../htlc-on-sui");

const NETWORK = "testnet";

function runCmd(cmd: string, cwd = ROOT): string {
  console.log(`🛠  Running: ${cmd}`);
  try {
    return execSync(cmd, { cwd, encoding: "utf8" });
  } catch (err: any) {
    console.error("❌ Command failed:", cmd);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

function main() {
  console.log("🚧 Building HTLC...");
  runCmd("sui move build");

  console.log("🚀 Publishing to Sui Testnet...");
  const output = runCmd("sui client publish --gas-budget 500000000 --json");
  const result = JSON.parse(output);

  const pkg = result.objectChanges.find(
    (item: any) => item.type === "published",
  );

  if (!pkg) {
    console.error("❌ PackageId not found in publish result.");
    process.exit(1);
  }

  const packageId = pkg.packageId;
  const modules = pkg.modules;
  const deployer = result.sender;
  const createdObjects = result.objectChanges
    .filter((i: any) => i.type === "created")
    .map((i: any) => `${i.objectType} → ${i.objectId}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.resolve(__dirname, `../../deployments/${NETWORK}`);
  const outputPath = path.join(outputDir, `deploy_${timestamp}.json`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const json = {
    packageId,
    modules,
    deployer,
    network: NETWORK,
    timestamp: new Date().toISOString(),
    createdObjects,
  };

  fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));

  console.log("=======================================");
  console.log("✅ Contract Deployed");
  console.log(`📦 Package ID     : ${packageId}`);
  console.log(`📚 Modules        : [${modules.join(", ")}]`);
  console.log(`👤 Deployer       : ${deployer}`);
  console.log(`📦 Created Objects:`);
  createdObjects.forEach((o: string) => console.log(`   - ${o}`));
  console.log(`📝 Saved to       : ${outputPath}`);
  console.log("=======================================");
}

main();
