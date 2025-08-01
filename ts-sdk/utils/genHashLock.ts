// utils/genHashLock.ts
import crypto from "crypto";
import { createHash, randomBytes } from "crypto";

/**
 * Generate a random secret and its SHA-256 hashlock.
 * @param secret Optional predefined 16-byte hex string
 * @returns { secret: string; hashLock: string }
 */
export function genHashLock() {
  const secret = randomBytes(32).toString("hex");
  const secretBytes = Buffer.from(secret, "hex");
  const hashBuffer = createHash("sha256").update(secretBytes).digest();
  const hashLock = Array.from(hashBuffer);

  console.log("🔐 Secret (hex):", secret);
  console.log("📦 Secret Bytes:", [...secretBytes]);
  console.log("🧩 HashLock:", [...hashLock]);

  return {
    secret,
    hashLock,
  };
}
