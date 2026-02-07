import { StableLayerClient } from "stable-layer-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { appConfig, assertRequiredConfigForStableLayerBurn } from "../../config";

export type BurnMode = "amount" | "all";

export interface BurnTxPreview {
  mode: BurnMode;
  burnAmount?: bigint;
}

export interface BurnTxResult {
  tx: Transaction;
  preview: BurnTxPreview;
}

function createStableLayerClient(sender: string): StableLayerClient {
  return new StableLayerClient({
    network: appConfig.stableLayer.network,
    sender
  });
}

export async function buildBurnTx(input: {
  owner: string;
  mode: BurnMode;
  amountU64?: bigint;
}): Promise<BurnTxResult> {
  assertRequiredConfigForStableLayerBurn();

  const stableLayerClient = createStableLayerClient(input.owner);
  const tx = new Transaction();

  if (input.mode === "all") {
    const burnCoin = await stableLayerClient.buildBurnTx({
      tx,
      stableCoinType: appConfig.stableLayer.stableCoinType,
      all: true
    });

    if (!burnCoin) {
      throw new Error("StableLayer buildBurnTx(all:true) returned empty coin");
    }

    return {
      tx,
      preview: { mode: "all" }
    };
  }

  const amount = input.amountU64;
  if (!amount || amount <= 0n) {
    throw new Error("Burn amount must be greater than 0");
  }

  const burnCoin = await stableLayerClient.buildBurnTx({
    tx,
    stableCoinType: appConfig.stableLayer.stableCoinType,
    amount
  });

  if (!burnCoin) {
    throw new Error("StableLayer buildBurnTx(amount) returned empty coin");
  }

  return {
    tx,
    preview: {
      mode: "amount",
      burnAmount: amount
    }
  };
}
