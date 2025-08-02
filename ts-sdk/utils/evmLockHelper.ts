import { hexlify } from "ethers";
import { genHashLock } from "./genHashLock";

export function genHashLockForEvm() {
  const { secret, hashLock } = genHashLock();
  const secretBytes = Uint8Array.from(secret);
  const secretHex = hexlify(secretBytes);

  return {
    secretHex,
    hashLock:
      typeof hashLock === "string"
        ? hashLock
        : hexlify(Uint8Array.from(hashLock)),
    secretBytes: secret,
  };
}
