import { appConfig, toExplorerTxUrl } from "../config";
import { recordRecentTxHistory } from "./txHistory";

export interface SmokeProduct {
  objectId: string;
  merchantId: string;
  title: string;
  priceU64: bigint;
  active: boolean;
  owner: string;
}

export interface SmokeInvoice {
  objectId: string;
  productId: string;
  merchantId: string;
  amountU64: bigint;
  status: number;
  buyer?: string;
  createdAtMs: bigint;
  owner: string;
}

export interface SmokeTxFeedback {
  digest: string;
  status: "success" | "failure" | "unknown";
  explorerUrl: string;
  errorMessage?: string;
  receiptObjectId?: string;
}

export interface SmokeCheckoutEvent {
  id: string;
  txDigest: string;
  eventName: "InvoiceCreated" | "InvoicePaid" | "ReceiptMinted";
  sender: string;
  timestampMs: number;
  invoiceId: string;
}

export interface SmokeBusinessMetrics {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  paidGmvU64: bigint;
  pendingGmvU64: bigint;
  paymentRatePercent: number;
}

export interface SmokeTxProof {
  digest: string;
  status: "success" | "failure" | "unknown";
  checkpoint: string;
  timestampMs: number;
  eventCount: number;
  gasUsedMIST: string;
  createdObjectIds: string[];
}

interface PersistedSmokeProduct extends Omit<SmokeProduct, "priceU64"> {
  priceU64: string;
}

interface PersistedSmokeInvoice extends Omit<SmokeInvoice, "amountU64" | "createdAtMs"> {
  amountU64: string;
  createdAtMs: string;
}

interface SmokeStore {
  products: PersistedSmokeProduct[];
  invoices: PersistedSmokeInvoice[];
  balances: Record<string, string>;
}

const SMOKE_STORE_KEY = "stableflow.smoke.store";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function balanceKey(owner: string, coinType: string): string {
  return `${owner.toLowerCase()}::${coinType}`;
}

function normalizeProduct(product: PersistedSmokeProduct): SmokeProduct {
  return {
    ...product,
    priceU64: BigInt(product.priceU64)
  };
}

function normalizeInvoice(invoice: PersistedSmokeInvoice): SmokeInvoice {
  return {
    ...invoice,
    amountU64: BigInt(invoice.amountU64),
    createdAtMs: BigInt(invoice.createdAtMs)
  };
}

function persistProduct(product: SmokeProduct): PersistedSmokeProduct {
  return {
    ...product,
    priceU64: product.priceU64.toString()
  };
}

function persistInvoice(invoice: SmokeInvoice): PersistedSmokeInvoice {
  return {
    ...invoice,
    amountU64: invoice.amountU64.toString(),
    createdAtMs: invoice.createdAtMs.toString()
  };
}

function defaultStore(): SmokeStore {
  return {
    products: [],
    invoices: [],
    balances: {}
  };
}

function loadStore(): SmokeStore {
  const st = storage();
  if (!st) return defaultStore();
  const raw = st.getItem(SMOKE_STORE_KEY);
  if (!raw) return defaultStore();

  try {
    const parsed = JSON.parse(raw) as SmokeStore;
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      balances:
        parsed.balances && typeof parsed.balances === "object"
          ? (parsed.balances as Record<string, string>)
          : {}
    };
  } catch {
    return defaultStore();
  }
}

function saveStore(next: SmokeStore): void {
  const st = storage();
  if (!st) return;
  st.setItem(SMOKE_STORE_KEY, JSON.stringify(next));
}

function randomHex(size = 64): string {
  const chars = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function newObjectId(): string {
  return `0x${randomHex(64)}`;
}

function newDigest(): string {
  return `${randomHex(64)}`;
}

function setBalance(owner: string, coinType: string, value: bigint): void {
  const state = loadStore();
  state.balances[balanceKey(owner, coinType)] = value < 0n ? "0" : value.toString();
  saveStore(state);
}

function getBalanceInternal(owner: string, coinType: string): bigint {
  const state = loadStore();
  const value = state.balances[balanceKey(owner, coinType)];
  if (!value) return 0n;

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function resetSmokeStore(): void {
  const st = storage();
  if (!st) return;
  st.removeItem(SMOKE_STORE_KEY);
}

export function ensureSmokeBalances(owner: string): void {
  if (appConfig.stableLayer.usdcType) {
    const current = getBalanceInternal(owner, appConfig.stableLayer.usdcType);
    if (current === 0n) setBalance(owner, appConfig.stableLayer.usdcType, 1_000_000n);
  }

  if (appConfig.stableLayer.stableCoinType) {
    const current = getBalanceInternal(owner, appConfig.stableLayer.stableCoinType);
    if (current === 0n) setBalance(owner, appConfig.stableLayer.stableCoinType, 500_000n);
  }

  if (appConfig.contract.payCoinType) {
    const current = getBalanceInternal(owner, appConfig.contract.payCoinType);
    if (current === 0n) setBalance(owner, appConfig.contract.payCoinType, 2_000_000n);
  }
}

function makeTxFeedback(
  scene: string,
  status: SmokeTxFeedback["status"] = "success",
  errorMessage?: string,
  receiptObjectId?: string
): SmokeTxFeedback {
  const digest = newDigest();
  const explorerUrl = toExplorerTxUrl(digest);

  const feedback: SmokeTxFeedback = {
    digest,
    status,
    explorerUrl,
    errorMessage,
    receiptObjectId
  };

  recordRecentTxHistory({
    scene,
    digest,
    status,
    explorerUrl,
    errorMessage,
    receiptObjectId
  });

  return feedback;
}

export function smokeListProducts(owner: string): SmokeProduct[] {
  const state = loadStore();
  return state.products.map(normalizeProduct).filter((item) => item.owner === owner);
}

export function smokeListInvoices(owner: string): SmokeInvoice[] {
  const state = loadStore();
  return state.invoices.map(normalizeInvoice).filter((item) => item.owner === owner);
}

export function smokeGetProduct(productId: string): SmokeProduct | null {
  const state = loadStore();
  const product = state.products.find((item) => item.objectId === productId);
  return product ? normalizeProduct(product) : null;
}

export function smokeGetInvoice(invoiceId: string): SmokeInvoice | null {
  const state = loadStore();
  const invoice = state.invoices.find((item) => item.objectId === invoiceId);
  return invoice ? normalizeInvoice(invoice) : null;
}

export function smokeCreateProduct(input: {
  owner: string;
  merchantId: string;
  title: string;
  priceU64: bigint;
}): SmokeTxFeedback {
  const state = loadStore();
  const next: SmokeProduct = {
    objectId: newObjectId(),
    merchantId: input.merchantId,
    title: input.title,
    priceU64: input.priceU64,
    active: true,
    owner: input.owner
  };

  state.products = [...state.products, persistProduct(next)];
  saveStore(state);

  return makeTxFeedback("merchant.create_product");
}

export function smokeCreateInvoice(input: {
  owner: string;
  merchantId: string;
  productId: string;
}): SmokeTxFeedback {
  const state = loadStore();
  const product = state.products.find((item) => item.objectId === input.productId);

  if (!product) {
    return makeTxFeedback("merchant.create_invoice", "failure", "Product not found.");
  }

  const nextInvoice: SmokeInvoice = {
    objectId: newObjectId(),
    productId: input.productId,
    merchantId: input.merchantId,
    amountU64: BigInt(product.priceU64),
    status: 0,
    createdAtMs: BigInt(Date.now()),
    owner: input.owner
  };

  state.invoices = [...state.invoices, persistInvoice(nextInvoice)];
  saveStore(state);

  return makeTxFeedback("merchant.create_invoice");
}

export function smokePayInvoice(input: {
  invoiceId: string;
  buyer: string;
  amountU64: bigint;
}): SmokeTxFeedback {
  const state = loadStore();
  const idx = state.invoices.findIndex((item) => item.objectId === input.invoiceId);

  if (idx < 0) {
    return makeTxFeedback("pay.invoice", "failure", "Invoice not found.");
  }

  const invoice = normalizeInvoice(state.invoices[idx]);
  if (invoice.status === 1) {
    return makeTxFeedback("pay.invoice", "failure", "Invoice already paid.");
  }
  if (invoice.amountU64 !== input.amountU64) {
    return makeTxFeedback("pay.invoice", "failure", "Payment amount mismatch.");
  }

  const nextInvoice: SmokeInvoice = {
    ...invoice,
    status: 1,
    buyer: input.buyer
  };

  state.invoices[idx] = persistInvoice(nextInvoice);
  saveStore(state);

  return makeTxFeedback("pay.invoice", "success", undefined, newObjectId());
}

export function smokeGetBalance(owner: string, coinType: string): bigint {
  ensureSmokeBalances(owner);
  let current = getBalanceInternal(owner, coinType);
  if (current === 0n) {
    setBalance(owner, coinType, 500_000n);
    current = getBalanceInternal(owner, coinType);
  }
  return current;
}

export function smokeBurn(input: {
  owner: string;
  coinType: string;
  mode: "amount" | "all";
  amountU64?: bigint;
}): SmokeTxFeedback {
  ensureSmokeBalances(input.owner);
  let current = getBalanceInternal(input.owner, input.coinType);
  if (current === 0n) {
    setBalance(input.owner, input.coinType, 500_000n);
    current = getBalanceInternal(input.owner, input.coinType);
  }

  if (input.mode === "all") {
    if (current <= 0n) {
      return makeTxFeedback("redeem.burn_all", "failure", "Balance is 0, cannot redeem all.");
    }

    setBalance(input.owner, input.coinType, 0n);
    return makeTxFeedback("redeem.burn_all");
  }

  const amount = input.amountU64 ?? 0n;
  if (amount <= 0n) {
    return makeTxFeedback("redeem.burn_amount", "failure", "Redemption amount must be greater than 0.");
  }
  if (current < amount) {
    return makeTxFeedback("redeem.burn_amount", "failure", "Insufficient balance.");
  }

  setBalance(input.owner, input.coinType, current - amount);
  return makeTxFeedback("redeem.burn_amount");
}

export function smokeClaim(owner: string): SmokeTxFeedback {
  ensureSmokeBalances(owner);
  return makeTxFeedback("merchant.claim");
}

export function smokeSupplyMetrics(coinType: string): {
  totalSupply: string;
  totalSupplyByType: string;
} {
  const state = loadStore();
  let byType = 0n;

  for (const key of Object.keys(state.balances)) {
    if (key.endsWith(`::${coinType}`)) {
      byType += BigInt(state.balances[key] || "0");
    }
  }

  return {
    totalSupply: byType.toString(),
    totalSupplyByType: byType.toString()
  };
}

export function smokePreviewUsdc(input: {
  owner: string;
  usdcType: string;
  amount: bigint;
}): { totalSelected: bigint; selectedCoinIds: string[] } {
  ensureSmokeBalances(input.owner);
  let total = getBalanceInternal(input.owner, input.usdcType);
  if (total === 0n) {
    setBalance(input.owner, input.usdcType, 1_000_000n);
    total = getBalanceInternal(input.owner, input.usdcType);
  }

  if (total < input.amount) {
    throw new Error("Insufficient USDC balance, cannot complete one-click payment.");
  }

  const ownerHex = input.owner.replace(/^0x/, "").padEnd(48, "0").slice(0, 48);
  const amountHex = input.amount.toString(16).padStart(16, "0").slice(-16);
  const previewCoinId = `0x${ownerHex}${amountHex}`;

  return {
    totalSelected: input.amount,
    selectedCoinIds: [previewCoinId]
  };
}

export function smokeMockTxResult(status: "success" | "failure" = "success"): unknown {
  const success = status === "success";
  const digest = newDigest();

  return {
    $kind: "Transaction",
    Transaction: {
      digest,
      status: success ? { success: true } : { success: false, error: { message: "mock failure" } }
    }
  };
}

export function smokeBusinessMetrics(owner: string): SmokeBusinessMetrics {
  const invoices = smokeListInvoices(owner);
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter((item) => item.status === 1).length;
  const unpaidInvoices = totalInvoices - paidInvoices;

  let paidGmvU64 = 0n;
  let pendingGmvU64 = 0n;
  for (const invoice of invoices) {
    if (invoice.status === 1) paidGmvU64 += invoice.amountU64;
    else pendingGmvU64 += invoice.amountU64;
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

export function smokeCheckoutEvents(owner: string, limit = 20): SmokeCheckoutEvent[] {
  const invoices = [...smokeListInvoices(owner)].sort((a, b) => {
    if (a.createdAtMs === b.createdAtMs) return 0;
    return a.createdAtMs > b.createdAtMs ? -1 : 1;
  });

  const events: SmokeCheckoutEvent[] = [];
  for (const invoice of invoices) {
    const baseTime = Number(invoice.createdAtMs);
    events.push({
      id: `${invoice.objectId}-created`,
      txDigest: randomHex(64),
      eventName: "InvoiceCreated",
      sender: owner,
      timestampMs: baseTime,
      invoiceId: invoice.objectId
    });

    if (invoice.status === 1) {
      events.push({
        id: `${invoice.objectId}-paid`,
        txDigest: randomHex(64),
        eventName: "InvoicePaid",
        sender: invoice.buyer || owner,
        timestampMs: baseTime + 1000,
        invoiceId: invoice.objectId
      });
      events.push({
        id: `${invoice.objectId}-receipt`,
        txDigest: randomHex(64),
        eventName: "ReceiptMinted",
        sender: invoice.buyer || owner,
        timestampMs: baseTime + 1200,
        invoiceId: invoice.objectId
      });
    }
  }

  return events.slice(0, Math.max(limit, 1));
}

export function smokeTxProof(input: {
  digest: string;
  status?: "success" | "failure" | "unknown";
  receiptObjectId?: string;
}): SmokeTxProof {
  return {
    digest: input.digest,
    status: input.status || "success",
    checkpoint: `${Math.floor(Date.now() / 1000)}`,
    timestampMs: Date.now(),
    eventCount: input.receiptObjectId ? 3 : 2,
    gasUsedMIST: "1000000",
    createdObjectIds: input.receiptObjectId ? [input.receiptObjectId] : []
  };
}
