// utils/checkBalance.ts

import { SuiClient, CoinStruct } from "@mysten/sui.js/client";
import { normalizeSuiObjectId } from "@mysten/sui.js/utils";

/**
 * Check coin object with balance ≥ minAmount
 * @param client Initialized SuiClient
 * @param address Wallet address
 * @param coinType Coin type, e.g. "0x2::sui::SUI"
 * @param minAmount Minimum amount to check (optional)
 * @returns The coin object with highest balance (if available)
 */
export async function checkBalance(
  client: SuiClient,
  address: string,
  coinType: string,
  minAmount: bigint = 0n,
): Promise<CoinStruct | undefined> {
  const coins = await client.getCoins({ owner: address, coinType });

  console.log("🧪 Looking for coinType =", coinType);
  console.log("🧪 Available coins:", coins.data.map((c: CoinStruct) => c.coinType));
  
  const sorted = coins.data
    .filter((c: CoinStruct) => BigInt(c.balance) >= minAmount)
    .sort((a, b) => {
      const diff = BigInt(b.balance) - BigInt(a.balance);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
  return sorted[0];
}
