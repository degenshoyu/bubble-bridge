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
  const hashBuffer = createHash("sha256").update(secret).digest();
  const hashLock = new Uint8Array(hashBuffer);
  return {
    secret,
    hashLock,
  };
}
