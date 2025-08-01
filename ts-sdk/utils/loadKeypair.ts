// ts-sdk/utils/loadKeypair.ts

import { decodeSuiPrivateKey } from "@mysten/sui.js/cryptography";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { Secp256r1Keypair } from "@mysten/sui.js/keypairs/secp256r1";
import { Keypair } from "@mysten/sui.js/cryptography";
import { config } from "dotenv";
config();

/**
 * Load a Sui-compatible Keypair from a given env var like LOCKER_PRIVKEY or CLAIMER_PRIVKEY.
 */
export function loadKeypairFromEnvVar(envVarName: string): Keypair {
  const raw = process.env[envVarName];
  if (!raw) throw new Error(`Missing ${envVarName} in .env`);

  const { schema, secretKey } = decodeSuiPrivateKey(raw);

  switch (schema) {
    case "ED25519":
      return Ed25519Keypair.fromSecretKey(secretKey);
    case "Secp256r1":
      return Secp256r1Keypair.fromSecretKey(secretKey);
    default:
      throw new Error(`Unsupported key type: ${schema}`);
  }
}
