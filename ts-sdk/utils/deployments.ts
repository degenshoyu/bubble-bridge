import * as fs from "fs";
import * as path from "path";

/**
 * Find the latest deployment file from deployments/{network}/
 */
export function getLatestDeploy(network: string): {
  packageId: string;
  modules: string[];
  deployer: string;
  network: string;
  timestamp: string;
  createdObjects: string[];
} {
  const folder = path.resolve(__dirname, `../../deployments/${network}`);
  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a));

  if (files.length === 0)
    throw new Error(`No deployments found for ${network}`);

  const latestFile = files[0];
  const fullPath = path.join(folder, latestFile);
  const data = fs.readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(data);

  return parsed;
}
