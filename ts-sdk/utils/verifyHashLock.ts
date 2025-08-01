// ts-sdk/utils/verifyHashLock.ts
import { sha3_256 } from "@noble/hashes/sha3";

export function verifyHash(
  secretHex: string,
  expectedHashHex: string,
): boolean {
  const secret = Buffer.from(secretHex, "hex");
  const hash = sha3_256(secret);
  return Buffer.from(hash).toString("hex") === expectedHashHex;
}
