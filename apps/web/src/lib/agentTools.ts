import type { AgentInvoiceSnapshot, AgentToolbox, AgentTxStatusSnapshot } from "@vibesui/agent";
import type { Transaction } from "@mysten/sui/transactions";
import { appConfig, toExplorerTxUrl } from "../config";
import {
  buildClaimTx as buildClaimTransaction,
  fetchStableLayerSupplyMetrics
} from "./stablelayer";
import { buildBurnTx as buildBurnTransaction, type BurnMode } from "./tx/buildBurnTx";
import { buildMintAndPayTx as buildMintAndPayTransaction } from "./tx/buildMintAndPayTx";
import { fetchInvoice, fetchProduct, getSuiClient } from "./sui";

export interface WebAgentToolbox extends AgentToolbox {
  getBalances(address: string): Promise<Record<string, string>>;
  getInvoice(invoiceId: string): Promise<AgentInvoiceSnapshot>;
  buildMintAndPayTx(invoiceId: string): Promise<Transaction>;
  buildBurnTx(input: { amount?: string; all?: boolean }): Promise<Transaction>;
  buildClaimTx(): Promise<Transaction>;
  getTxStatus(digest: string): Promise<AgentTxStatusSnapshot>;
}

export async function getBalances(address: string): Promise<Record<string, string>> {
  const coinTypes = [
    appConfig.contract.payCoinType,
    appConfig.stableLayer.stableCoinType,
    appConfig.stableLayer.usdcType
  ].filter((value): value is string => value.length > 0);

  const uniqueCoinTypes = [...new Set(coinTypes)];
  const balances = await Promise.all(
    uniqueCoinTypes.map(async (coinType) => {
      const response = await getSuiClient().getBalance({ owner: address, coinType });
      return [coinType, response.totalBalance] as const;
    })
  );

  return Object.fromEntries(balances);
}

export async function getInvoice(invoiceId: string): Promise<AgentInvoiceSnapshot> {
  const invoice = await fetchInvoice(invoiceId);
  let productTitle: string | undefined;

  if (invoice.productId) {
    try {
      const product = await fetchProduct(invoice.productId);
      productTitle = product.title;
    } catch {
      productTitle = undefined;
    }
  }

  return {
    objectId: invoice.objectId,
    amountU64: invoice.amountU64.toString(),
    status: invoice.status,
    buyer: invoice.buyer,
    productTitle
  };
}

async function buildMintAndPayTx(address: string, invoiceId: string): Promise<Transaction> {
  const invoice = await fetchInvoice(invoiceId);
  const built = await buildMintAndPayTransaction({
    owner: address,
    merchantId: invoice.merchantId,
    invoiceId,
    amountU64: invoice.amountU64
  });
  return built.tx;
}

async function buildBurnTx(
  address: string,
  input: { amount?: string; all?: boolean }
): Promise<Transaction> {
  const mode: BurnMode = input.all ? "all" : "amount";

  if (mode === "all") {
    return (await buildBurnTransaction({ owner: address, mode: "all" })).tx;
  }

  if (!input.amount) {
    throw new Error("Missing burn amount.");
  }

  const amount = BigInt(input.amount);
  return (
    await buildBurnTransaction({
      owner: address,
      mode: "amount",
      amountU64: amount
    })
  ).tx;
}

async function buildClaimTx(address: string): Promise<Transaction> {
  return buildClaimTransaction(address);
}

export async function getTxStatus(digest: string): Promise<AgentTxStatusSnapshot> {
  const response = await getSuiClient().getTransactionBlock({
    digest,
    options: { showEffects: true }
  });

  const effects = response.effects;
  let status: AgentTxStatusSnapshot["status"] = "unknown";
  let errorMessage: string | undefined;

  if (effects?.status.status === "success") {
    status = "success";
  } else if (effects?.status.status === "failure") {
    status = "failure";
    const rawError = effects.status.error;
    if (typeof rawError === "string") {
      errorMessage = rawError;
    } else if (
      rawError &&
      typeof rawError === "object" &&
      "message" in rawError &&
      typeof (rawError as { message?: unknown }).message === "string"
    ) {
      errorMessage = (rawError as { message: string }).message;
    } else if (rawError != null) {
      errorMessage = JSON.stringify(rawError);
    }
  }

  return {
    digest,
    status,
    explorerUrl: toExplorerTxUrl(digest),
    errorMessage
  };
}

export function createWebAgentToolbox(address: string): WebAgentToolbox {
  return {
    getBalances,
    getInvoice,
    buildMintAndPayTx: (invoiceId: string) => buildMintAndPayTx(address, invoiceId),
    buildBurnTx: (input: { amount?: string; all?: boolean }) => buildBurnTx(address, input),
    buildClaimTx: () => buildClaimTx(address),
    getTxStatus
  };
}

export async function getSupplyMetricsForAgent(address: string): Promise<Record<string, string>> {
  const metrics = await fetchStableLayerSupplyMetrics(address);
  return {
    totalSupply: metrics.totalSupply || "0",
    totalSupplyByType: metrics.totalSupplyByType || "0"
  };
}
