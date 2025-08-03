import fs from "fs";
import path from "path";

export interface SuiClaimMetadata {
  secret: string;
  sourceFile?: string;
}

export function getLatestSuiClaimInfo(): SuiClaimMetadata {
  const claimsDir = path.resolve(
    __dirname,
    "../../deployments/htlc-claims-sui"
  );
  const files = fs
    .readdirSync(claimsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No Sui claim JSON files found.");
  }

  const latestPath = path.join(claimsDir, files[0]);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

  if (!data.secret) {
    throw new Error("Invalid Sui claim file: missing required field (secret).");
  }

  return {
    secret: data.secret,
    sourceFile: files[0],
  };
}
