import { StableLayerClient } from "stable-layer-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { appConfig, assertRequiredConfigForStableLayerCore } from "../config";

export interface StableLayerSupplyMetrics {
  totalSupply: string | undefined;
  totalSupplyByType: string | undefined;
  coinType: string;
}

export function createStableLayerClient(sender: string): StableLayerClient {
  return new StableLayerClient({
    network: appConfig.stableLayer.network,
    sender
  });
}

export async function buildClaimTx(owner: string): Promise<Transaction> {
  assertRequiredConfigForStableLayerCore();

  const stableLayerClient = createStableLayerClient(owner);
  const tx = new Transaction();

  await stableLayerClient.buildClaimTx({
    tx,
    stableCoinType: appConfig.stableLayer.stableCoinType
  });

  return tx;
}

export async function fetchStableLayerSupplyMetrics(
  owner: string
): Promise<StableLayerSupplyMetrics> {
  assertRequiredConfigForStableLayerCore();

  const stableLayerClient = createStableLayerClient(owner);
  const [totalSupply, totalSupplyByType] = await Promise.all([
    stableLayerClient.getTotalSupply(),
    stableLayerClient.getTotalSupplyByCoinType(appConfig.stableLayer.stableCoinType)
  ]);

  return {
    totalSupply,
    totalSupplyByType,
    coinType: appConfig.stableLayer.stableCoinType
  };
}
