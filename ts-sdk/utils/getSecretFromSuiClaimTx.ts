import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";

export async function getSecretFromSuiClaimTx(digest: string): Promise<string> {
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const txBlock = await client.getTransactionBlock({
    digest,
    options: { showInput: true },
  });

  console.log("Fetched txBlock:", JSON.stringify(txBlock, null, 2));

  const pt = txBlock.transaction?.data.transaction as any;
  if (!pt || pt.kind !== "ProgrammableTransaction") {
    throw new Error("No ProgrammableTransaction found.");
  }

  const claimCallCandidate = pt.transactions.find((t: any) => {
    return t.kind === "MoveCall" && t.target.endsWith("::swap::claim");
  });

  if (!claimCallCandidate) {
    throw new Error("No ::swap::claim MoveCall found in the transaction.");
  }

  const claimCall = claimCallCandidate as any;

  const secretArg = claimCall.arguments[2];
  if (!secretArg || secretArg.kind !== "Input") {
    throw new Error("Unexpected kind for secret argument.");
  }

  const inputIndex = secretArg.index;
  const inputValue = pt.inputs[inputIndex] as any;

  if (inputValue.type !== "pure" || inputValue.valueType !== "vector<u8>") {
    throw new Error("Invalid input type for secret.");
  }

  const secretArray = inputValue.value as number[];
  const secretBytes = Uint8Array.from(secretArray);
  const secretHex = "0x" + Buffer.from(secretBytes).toString("hex");

  return secretHex;
}
