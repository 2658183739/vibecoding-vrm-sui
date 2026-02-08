import type { CoinStruct } from "@mysten/sui/jsonRpc";
import { type Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { getSuiClient } from "../sui";

export interface UsdcSelectionPreview {
  amount: bigint;
  totalSelected: bigint;
  selectedCoinIds: string[];
}

export interface UsdcSelectionForTx extends UsdcSelectionPreview {
  usdcCoin: TransactionObjectArgument;
}

function pickCoinsByAmount(
  coins: CoinStruct[],
  amount: bigint
): { selectedCoins: CoinStruct[]; totalSelected: bigint } {
  const sorted = [...coins].sort((a, b) => {
    const aVal = BigInt(a.balance);
    const bVal = BigInt(b.balance);
    if (aVal === bVal) return a.coinObjectId.localeCompare(b.coinObjectId);
    return aVal > bVal ? -1 : 1;
  });

  const selectedCoins: CoinStruct[] = [];
  let totalSelected = 0n;

  for (const coin of sorted) {
    selectedCoins.push(coin);
    totalSelected += BigInt(coin.balance);
    if (totalSelected >= amount) break;
  }

  return { selectedCoins, totalSelected };
}

export async function previewUsdcSelection(input: {
  owner: string;
  usdcType: string;
  amount: bigint;
}): Promise<UsdcSelectionPreview> {
  if (input.amount <= 0n) {
    throw new Error("Invoice amount must be greater than 0.");
  }

  const page = await getSuiClient().getCoins({
    owner: input.owner,
    coinType: input.usdcType
  });

  if (page.data.length === 0) {
    throw new Error(`No USDC found in wallet (type: ${input.usdcType}).`);
  }

  const { selectedCoins, totalSelected } = pickCoinsByAmount(page.data, input.amount);

  if (totalSelected < input.amount) {
    throw new Error(
      `USDC balance is insufficient: required ${input.amount.toString()}, current ${totalSelected.toString()}`
    );
  }

  return {
    amount: input.amount,
    totalSelected,
    selectedCoinIds: selectedCoins.map((coin) => coin.coinObjectId)
  };
}

export async function selectUsdcCoinForTx(input: {
  owner: string;
  usdcType: string;
  amount: bigint;
  tx: Transaction;
}): Promise<UsdcSelectionForTx> {
  const page = await getSuiClient().getCoins({
    owner: input.owner,
    coinType: input.usdcType
  });

  if (page.data.length === 0) {
    throw new Error(`No USDC found in wallet (type: ${input.usdcType}).`);
  }

  const { selectedCoins, totalSelected } = pickCoinsByAmount(page.data, input.amount);

  if (totalSelected < input.amount) {
    throw new Error(
      `USDC balance is insufficient: required ${input.amount.toString()}, current ${totalSelected.toString()}`
    );
  }

  const [primary, ...rest] = selectedCoins;
  if (!primary) {
    throw new Error("Cannot select a usable USDC coin.");
  }

  const primaryArg = input.tx.object(primary.coinObjectId);
  if (rest.length > 0) {
    input.tx.mergeCoins(
      primaryArg,
      rest.map((coin) => input.tx.object(coin.coinObjectId))
    );
  }

  let usdcCoin: TransactionObjectArgument = primaryArg;
  if (totalSelected > input.amount) {
    const [exactUsdcCoin] = input.tx.splitCoins(primaryArg, [input.tx.pure.u64(input.amount)]);
    usdcCoin = exactUsdcCoin;
  }

  return {
    usdcCoin,
    amount: input.amount,
    totalSelected,
    selectedCoinIds: selectedCoins.map((coin) => coin.coinObjectId)
  };
}
