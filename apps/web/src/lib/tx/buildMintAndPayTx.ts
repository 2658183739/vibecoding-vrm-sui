import { StableLayerClient } from "stable-layer-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { appConfig, assertRequiredConfigForStableLayerMintPay } from "../../config";
import {
  selectUsdcCoinForTx,
  previewUsdcSelection,
  type UsdcSelectionPreview
} from "./selectUsdcCoin";

export interface MintAndPayPreview extends UsdcSelectionPreview {
  mintAmount: bigint;
  payAmount: bigint;
}

export interface MintAndPayTxResult {
  tx: Transaction;
  preview: MintAndPayPreview;
}

function moduleTarget(fnName: string): string {
  return `${appConfig.contract.packageId}::${appConfig.contract.moduleName}::${fnName}`;
}

function payInvoiceReturnsReceiptObject(): boolean {
  return appConfig.contract.payInvoiceFn === "pay_invoice";
}

function createStableLayerClient(sender: string): StableLayerClient {
  return new StableLayerClient({
    network: appConfig.stableLayer.network,
    sender
  });
}

export async function previewMintAndPayTx(input: {
  owner: string;
  amountU64: bigint;
}): Promise<MintAndPayPreview> {
  assertRequiredConfigForStableLayerMintPay();

  const usdcPreview = await previewUsdcSelection({
    owner: input.owner,
    usdcType: appConfig.stableLayer.usdcType,
    amount: input.amountU64
  });

  return {
    ...usdcPreview,
    mintAmount: input.amountU64,
    payAmount: input.amountU64
  };
}

export async function buildMintAndPayTx(input: {
  owner: string;
  merchantId: string;
  invoiceId: string;
  amountU64: bigint;
}): Promise<MintAndPayTxResult> {
  assertRequiredConfigForStableLayerMintPay();
  if (!input.merchantId) {
    throw new Error("Missing merchant object id, cannot call pay_invoice.");
  }

  const stableLayerClient = createStableLayerClient(input.owner);
  const tx = new Transaction();

  const usdcSelection = await selectUsdcCoinForTx({
    owner: input.owner,
    usdcType: appConfig.stableLayer.usdcType,
    amount: input.amountU64,
    tx
  });

  const mintedCoin = await stableLayerClient.buildMintTx({
    tx,
    stableCoinType: appConfig.stableLayer.stableCoinType,
    usdcCoin: usdcSelection.usdcCoin,
    amount: input.amountU64,
    autoTransfer: false
  });

  if (!mintedCoin) {
    throw new Error("StableLayer buildMintTx returned no minted coin object.");
  }

  if (payInvoiceReturnsReceiptObject()) {
    const receipt = tx.moveCall({
      target: moduleTarget(appConfig.contract.payInvoiceFn),
      typeArguments: [appConfig.stableLayer.brandUsdType],
      arguments: [tx.object(input.merchantId), tx.object(input.invoiceId), mintedCoin]
    });
    tx.transferObjects([receipt], tx.pure.address(input.owner));
  } else {
    tx.moveCall({
      target: moduleTarget(appConfig.contract.payInvoiceFn),
      typeArguments: [appConfig.stableLayer.brandUsdType],
      arguments: [tx.object(input.merchantId), tx.object(input.invoiceId), mintedCoin]
    });
  }

  return {
    tx,
    preview: {
      amount: usdcSelection.amount,
      totalSelected: usdcSelection.totalSelected,
      selectedCoinIds: usdcSelection.selectedCoinIds,
      mintAmount: input.amountU64,
      payAmount: input.amountU64
    }
  };
}
