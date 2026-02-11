import type { SuiClientTypes } from "@mysten/sui/client";
import { SuiClient, type LegacySuiObjectResponse } from "./suiClientCompat";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import {
  appConfig,
  assertRequiredConfigForMerchant,
  assertRequiredConfigForPay,
  toExplorerTxUrl
} from "../config";

type MoveFields = Record<string, unknown>;

type DAppKitTxResult = SuiClientTypes.TransactionResult<{
  effects: true;
  transaction: true;
  bcs: true;
}>;

export interface Product {
  objectId: string;
  merchantId: string;
  title: string;
  priceU64: bigint;
  active: boolean;
}

export interface Invoice {
  objectId: string;
  productId: string;
  merchantId: string;
  amountU64: bigint;
  status: number;
  buyer?: string;
  createdAtMs: bigint;
}

export interface TxFeedback {
  digest: string;
  status: "success" | "failure" | "unknown";
  explorerUrl: string;
  errorMessage?: string;
  receiptObjectId?: string;
}

export interface MerchantBusinessMetrics {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  paidGmvU64: bigint;
  pendingGmvU64: bigint;
  paymentRatePercent: number;
}

export interface CheckoutEventItem {
  id: string;
  txDigest: string;
  eventType: string;
  eventName: string;
  sender?: string;
  timestampMs?: number;
  parsedJson?: Record<string, unknown>;
}

export interface TxChainProof {
  digest: string;
  status: "success" | "failure" | "unknown";
  checkpoint?: string;
  timestampMs?: number;
  eventCount: number;
  gasUsedMIST?: string;
  createdObjectIds: string[];
}

export async function fetchCoinBalance(owner: string, coinType: string): Promise<bigint> {
  const response = await getSuiClient().getBalance({ owner, coinType });
  return BigInt(response.totalBalance);
}

let suiClientSingleton: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!suiClientSingleton) {
    suiClientSingleton = new SuiClient({
      network: appConfig.network,
      url: appConfig.rpcUrl
    });
  }
  return suiClientSingleton;
}

export function parseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Unknown error";
}

function parseAscii(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((x) => typeof x === "number")) {
    return new TextDecoder().decode(Uint8Array.from(value as number[]));
  }
  return "";
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.floor(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function parseId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === "string") return obj.id;
  if (typeof obj.objectId === "string") return obj.objectId;
  return "";
}

function parseBuyer(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.vec) && typeof obj.vec[0] === "string") return obj.vec[0];
  if (Array.isArray(obj.value) && typeof obj.value[0] === "string") return obj.value[0];
  return undefined;
}

function readObjectId(response: LegacySuiObjectResponse): string {
  return response.data?.objectId ?? "";
}

function readObjectType(response: LegacySuiObjectResponse): string {
  return response.data?.type ?? "";
}

function readMoveFields(response: LegacySuiObjectResponse): MoveFields {
  const content = response.data?.content;
  if (!content || typeof content !== "object") return {};

  const maybeMove = content as { dataType?: string; fields?: MoveFields };
  if (maybeMove.dataType !== "moveObject") return {};
  return maybeMove.fields ?? {};
}

function mapProduct(objectId: string, fields: MoveFields): Product {
  return {
    objectId,
    merchantId: parseId(fields.merchant_id),
    title: parseAscii(fields.title),
    priceU64: parseBigInt(fields.price_u64),
    active: parseBool(fields.active)
  };
}

function mapInvoice(objectId: string, fields: MoveFields): Invoice {
  return {
    objectId,
    productId: parseId(fields.product_id),
    merchantId: parseId(fields.merchant_id),
    amountU64: parseBigInt(fields.amount_u64),
    status: parseNumber(fields.status),
    buyer: parseBuyer(fields.buyer),
    createdAtMs: parseBigInt(fields.created_at_ms)
  };
}

function typeSuffix(name: string): string {
  return `::${appConfig.contract.moduleName}::${name}`;
}

function moduleTarget(fnName: string): string {
  return `${appConfig.contract.packageId}::${appConfig.contract.moduleName}::${fnName}`;
}

function createInvoiceReturnsObject(): boolean {
  return appConfig.contract.createInvoiceFn === "create_invoice";
}

function payInvoiceReturnsReceiptObject(): boolean {
  return appConfig.contract.payInvoiceFn === "pay_invoice";
}

async function getAllOwnedObjects(owner: string): Promise<LegacySuiObjectResponse[]> {
  const client = getSuiClient();
  const objects: LegacySuiObjectResponse[] = [];
  let cursor: string | null | undefined;

  do {
    const page = await client.getOwnedObjects({
      owner,
      cursor,
      options: { showType: true, showContent: true }
    });

    objects.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return objects;
}

export async function fetchProducts(owner: string): Promise<Product[]> {
  const owned = await getAllOwnedObjects(owner);

  return owned
    .map((item) => {
      const type = readObjectType(item);
      if (!type.endsWith(typeSuffix(appConfig.contract.productTypeName))) return null;
      return mapProduct(readObjectId(item), readMoveFields(item));
    })
    .filter((item): item is Product => item !== null);
}

export async function fetchInvoices(owner: string): Promise<Invoice[]> {
  const owned = await getAllOwnedObjects(owner);

  return owned
    .map((item) => {
      const type = readObjectType(item);
      if (!type.endsWith(typeSuffix(appConfig.contract.invoiceTypeName))) return null;
      return mapInvoice(readObjectId(item), readMoveFields(item));
    })
    .filter((item): item is Invoice => item !== null);
}

export async function fetchInvoice(invoiceId: string): Promise<Invoice> {
  const response = await getSuiClient().getObject({
    id: invoiceId,
    options: { showType: true, showContent: true }
  });

  if (!response.data) throw new Error(`Invoice not found: ${invoiceId}`);
  return mapInvoice(readObjectId(response), readMoveFields(response));
}

export async function fetchProduct(productId: string): Promise<Product> {
  const response = await getSuiClient().getObject({
    id: productId,
    options: { showType: true, showContent: true }
  });

  if (!response.data) throw new Error(`Product not found: ${productId}`);
  return mapProduct(readObjectId(response), readMoveFields(response));
}

export function buildCreateProductTx(input: { title: string; priceU64: bigint }): Transaction {
  assertRequiredConfigForMerchant();

  const tx = new Transaction();
  tx.moveCall({
    target: moduleTarget(appConfig.contract.createProductFn),
    arguments: [
      tx.object(appConfig.objectIds.merchantId),
      tx.pure.string(input.title),
      tx.pure.u64(input.priceU64)
    ]
  });

  return tx;
}

export function buildCreateInvoiceTx(input: { owner: string; productId: string }): Transaction {
  assertRequiredConfigForMerchant();

  const tx = new Transaction();
  const createdInvoice = tx.moveCall({
    target: moduleTarget(appConfig.contract.createInvoiceFn),
    arguments: [tx.object(appConfig.objectIds.merchantId), tx.object(input.productId)]
  });

  if (createInvoiceReturnsObject()) {
    tx.transferObjects([createdInvoice], tx.pure.address(input.owner));
  }

  return tx;
}

interface SelectCoinInput {
  owner: string;
  coinType: string;
  amount: bigint;
  tx: Transaction;
}

async function selectCoinForExactAmount(
  input: SelectCoinInput
): Promise<TransactionObjectArgument> {
  if (input.amount <= 0n) throw new Error("Invoice amount must be greater than 0.");

  const response = await getSuiClient().getCoins({
    owner: input.owner,
    coinType: input.coinType
  });

  if (response.data.length === 0) {
    throw new Error(`No available coin found for type: ${input.coinType}`);
  }

  const sorted = [...response.data].sort((a, b) => {
    const aVal = BigInt(a.balance);
    const bVal = BigInt(b.balance);
    if (aVal === bVal) return 0;
    return aVal > bVal ? -1 : 1;
  });

  const selected: typeof sorted = [];
  let total = 0n;

  for (const coin of sorted) {
    selected.push(coin);
    total += BigInt(coin.balance);
    if (total >= input.amount) break;
  }

  if (total < input.amount) {
    throw new Error(
      `Insufficient balance: required ${input.amount.toString()}, current ${total.toString()}`
    );
  }

  const [primary, ...rest] = selected;
  if (!primary) throw new Error("Coin selection failed. Please retry.");

  const primaryArg = input.tx.object(primary.coinObjectId);

  if (rest.length > 0) {
    input.tx.mergeCoins(
      primaryArg,
      rest.map((coin) => input.tx.object(coin.coinObjectId))
    );
  }

  if (total === input.amount) return primaryArg;

  const [exactCoin] = input.tx.splitCoins(primaryArg, [input.tx.pure.u64(input.amount)]);
  return exactCoin;
}

export async function buildPayInvoiceTx(input: {
  owner: string;
  merchantId: string;
  invoiceId: string;
  amountU64: bigint;
  coinType: string;
}): Promise<Transaction> {
  assertRequiredConfigForPay();
  if (!input.merchantId) {
    throw new Error("Missing merchant object id, cannot call pay_invoice.");
  }

  const tx = new Transaction();
  const paymentCoin = await selectCoinForExactAmount({
    owner: input.owner,
    coinType: input.coinType,
    amount: input.amountU64,
    tx
  });

  if (payInvoiceReturnsReceiptObject()) {
    const receipt = tx.moveCall({
      target: moduleTarget(appConfig.contract.payInvoiceFn),
      typeArguments: [input.coinType],
      arguments: [tx.object(input.merchantId), tx.object(input.invoiceId), paymentCoin]
    });
    tx.transferObjects([receipt], tx.pure.address(input.owner));
  } else {
    tx.moveCall({
      target: moduleTarget(appConfig.contract.payInvoiceFn),
      typeArguments: [input.coinType],
      arguments: [tx.object(input.merchantId), tx.object(input.invoiceId), paymentCoin]
    });
  }

  return tx;
}

function extractTx(
  result: DAppKitTxResult
): SuiClientTypes.Transaction<{ effects: true; transaction: true; bcs: true }> {
  return result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
}

function findCreatedReceiptObjectId(
  objectChanges: Array<Record<string, unknown>> | undefined
): string | undefined {
  if (!objectChanges) return undefined;

  const expectedSuffix = typeSuffix(appConfig.contract.receiptTypeName);
  const change = objectChanges.find((item) => {
    const type = item.type;
    const objectType = item.objectType;
    return (
      type === "created" && typeof objectType === "string" && objectType.endsWith(expectedSuffix)
    );
  });

  const objectId = change?.objectId;
  return typeof objectId === "string" ? objectId : undefined;
}

function getEventNameFromType(eventType: string): string {
  const parts = eventType.split("::");
  return parts[parts.length - 1] || eventType;
}

function normalizeStatus(raw: unknown): "success" | "failure" | "unknown" {
  if (raw === "success") return "success";
  if (raw === "failure") return "failure";
  return "unknown";
}

export async function fetchMerchantBusinessMetrics(
  owner: string
): Promise<MerchantBusinessMetrics> {
  const invoices = await fetchInvoices(owner);
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter((item) => item.status === 1).length;
  const unpaidInvoices = totalInvoices - paidInvoices;

  let paidGmvU64 = 0n;
  let pendingGmvU64 = 0n;

  for (const invoice of invoices) {
    if (invoice.status === 1) {
      paidGmvU64 += invoice.amountU64;
    } else {
      pendingGmvU64 += invoice.amountU64;
    }
  }

  const paymentRatePercent =
    totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 10000) / 100 : 0;

  return {
    totalInvoices,
    paidInvoices,
    unpaidInvoices,
    paidGmvU64,
    pendingGmvU64,
    paymentRatePercent
  };
}

export async function fetchLatestCheckoutEvents(limit = 20): Promise<CheckoutEventItem[]> {
  if (appConfig.contract.packageId === "0x0") return [];

  const response = await getSuiClient().queryEvents({
    query: {
      MoveEventModule: {
        package: appConfig.contract.packageId,
        module: appConfig.contract.moduleName
      }
    },
    order: "descending",
    limit
  });

  return response.data.map((item) => {
    const eventType = item.type || "";
    return {
      id: `${item.id.txDigest}-${item.id.eventSeq}`,
      txDigest: item.id.txDigest,
      eventType,
      eventName: getEventNameFromType(eventType),
      sender: item.sender || undefined,
      timestampMs: item.timestampMs ? Number(item.timestampMs) : undefined,
      parsedJson:
        item.parsedJson && typeof item.parsedJson === "object"
          ? (item.parsedJson as Record<string, unknown>)
          : undefined
    };
  });
}

export async function fetchTxChainProof(digest: string): Promise<TxChainProof> {
  const details = await getSuiClient().getTransactionBlock({
    digest,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true
    }
  });

  const effects = details.effects;
  const gas = effects?.gasUsed;
  const gasUsedMIST = gas
    ? (BigInt(gas.computationCost) + BigInt(gas.storageCost) - BigInt(gas.storageRebate)).toString()
    : undefined;
  const createdObjectIds = (details.objectChanges || [])
    .filter((item) => item.type === "created")
    .map((item) => item.objectId)
    .filter((item): item is string => typeof item === "string");

  return {
    digest,
    status: normalizeStatus(effects?.status.status),
    checkpoint: details.checkpoint || undefined,
    timestampMs: details.timestampMs ? Number(details.timestampMs) : undefined,
    eventCount: Array.isArray(details.events) ? details.events.length : 0,
    gasUsedMIST,
    createdObjectIds
  };
}

export async function findCreatedObjectIdByStructName(
  digest: string,
  structName: string
): Promise<string | undefined> {
  if (!digest || !structName) return undefined;

  const details = await getSuiClient().getTransactionBlock({
    digest,
    options: { showObjectChanges: true }
  });

  const expectedSuffix = typeSuffix(structName);
  const change = (details.objectChanges || []).find((item) => {
    return item.type === "created" && typeof item.objectType === "string"
      ? item.objectType.endsWith(expectedSuffix)
      : false;
  });

  const objectId =
    change && typeof change === "object" && "objectId" in change
      ? (change as { objectId?: unknown }).objectId
      : undefined;

  return typeof objectId === "string" ? objectId : undefined;
}

export async function normalizeTxFeedback(result: DAppKitTxResult): Promise<TxFeedback> {
  const tx = extractTx(result);
  const status: TxFeedback["status"] = tx.status.success ? "success" : "failure";

  const feedback: TxFeedback = {
    digest: tx.digest,
    status,
    explorerUrl: tx.digest ? toExplorerTxUrl(tx.digest) : "",
    errorMessage: tx.status.success
      ? undefined
      : tx.status.error?.message || JSON.stringify(tx.status.error)
  };

  if (!tx.digest) return feedback;

  try {
    const details = await getSuiClient().getTransactionBlock({
      digest: tx.digest,
      options: { showObjectChanges: true }
    });
    feedback.receiptObjectId = findCreatedReceiptObjectId(
      details.objectChanges as Array<Record<string, unknown>> | undefined
    );
  } catch {
    // Keep base feedback even if tx details fetch fails.
  }

  return feedback;
}

