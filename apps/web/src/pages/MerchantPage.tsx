import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Input } from "@heroui/react";
import { type Transaction } from "@mysten/sui/transactions";
import { appConfig, assertRequiredConfigForMerchant } from "../config";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import { isSmokeMode } from "../lib/smokeMode";
import {
  smokeCreateInvoice,
  smokeCreateProduct,
  smokeListInvoices,
  smokeListProducts
} from "../lib/smokeState";
import { ConnectWalletButton, useWalletAccount, useWalletDAppKit } from "../lib/wallet";
import {
  buildCreateInvoiceTx,
  buildCreateProductTx,
  fetchInvoices,
  fetchProducts,
  normalizeTxFeedback,
  parseErrorMessage,
  type Invoice,
  type Product,
  type TxFeedback
} from "../lib/sui";

type TxKind = "create-product" | "create-invoice";
type InvoiceFilter = "all" | "unpaid" | "paid";

function parsePositiveU64(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const value = BigInt(trimmed);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

function formatInvoiceStatus(status: number): string {
  if (status === 1) return "Paid";
  if (status === 0) return "Pending";
  return `Unknown(${status})`;
}

async function copyText(value: string): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
}

export default function MerchantPage() {
  const account = useWalletAccount();
  const dAppKit = useWalletDAppKit();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");

  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [txKind, setTxKind] = useState<TxKind | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);

  const smokeMode = isSmokeMode();
  const merchantConfigError = useMemo(() => {
    if (smokeMode) return null;
    try {
      assertRequiredConfigForMerchant();
      return null;
    } catch (error) {
      return parseErrorMessage(error);
    }
  }, [smokeMode]);
  const merchantReady = smokeMode || !merchantConfigError;
  const parsedPrice = useMemo(() => parsePositiveU64(price), [price]);
  const canCreateProduct = useMemo(
    () => title.trim().length > 0 && parsedPrice !== null,
    [title, parsedPrice]
  );
  const canCreateInvoice = useMemo(() => selectedProductId.length > 0, [selectedProductId]);

  const filteredInvoices = useMemo(() => {
    const sorted = [...invoices].sort((a, b) => {
      if (a.createdAtMs === b.createdAtMs) return 0;
      return a.createdAtMs > b.createdAtMs ? -1 : 1;
    });

    if (invoiceFilter === "all") return sorted;
    if (invoiceFilter === "paid") return sorted.filter((item) => item.status === 1);
    return sorted.filter((item) => item.status !== 1);
  }, [invoices, invoiceFilter]);

  const paidCount = useMemo(() => invoices.filter((item) => item.status === 1).length, [invoices]);
  const unpaidCount = useMemo(
    () => invoices.filter((item) => item.status !== 1).length,
    [invoices]
  );

  const loadData = useCallback(async () => {
    if (!account?.address) {
      setProducts([]);
      setInvoices([]);
      return;
    }

    if (smokeMode) {
      const nextProducts = smokeListProducts(account.address);
      const nextInvoices = smokeListInvoices(account.address);
      setProducts(nextProducts);
      setInvoices(nextInvoices);
      if (!selectedProductId && nextProducts[0]?.objectId) {
        setSelectedProductId(nextProducts[0].objectId);
      }
      return;
    }

    const [nextProducts, nextInvoices] = await Promise.all([
      fetchProducts(account.address),
      fetchInvoices(account.address)
    ]);

    setProducts(nextProducts);
    setInvoices(nextInvoices);

    if (!selectedProductId && nextProducts[0]?.objectId) {
      setSelectedProductId(nextProducts[0].objectId);
    }
  }, [account?.address, selectedProductId, smokeMode]);

  useEffect(() => {
    loadData().catch((error) => setTxError(parseErrorMessage(error)));
  }, [loadData]);

  async function runTx(
    kind: TxKind,
    txFactory: () => Promise<Transaction> | Transaction
  ): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first.");
      return;
    }

    setTxKind(kind);
    setTxLoading(true);
    setTxError(null);
    setTxResult(null);

    try {
      const tx = await txFactory();
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTxResult(await normalizeTxFeedback(result));
      await loadData();
    } catch (error) {
      setTxError(parseErrorMessage(error));
    } finally {
      setTxLoading(false);
    }
  }

  async function onCreateProduct(): Promise<void> {
    if (!parsedPrice) {
      setTxError("Please enter valid price (u64 positive integer).");
      return;
    }

    if (smokeMode && account) {
      setTxKind("create-product");
      setTxLoading(true);
      setTxError(null);
      setTxResult(null);
      try {
        const feedback = smokeCreateProduct({
          owner: account.address,
          merchantId: appConfig.objectIds.merchantId || "0xsmoke_merchant",
          title: title.trim(),
          priceU64: parsedPrice
        });
        setTxResult(feedback);
        setTitle("");
        setPrice("");
        await loadData();
      } finally {
        setTxLoading(false);
      }
      return;
    }

    await runTx("create-product", () =>
      buildCreateProductTx({ title: title.trim(), priceU64: parsedPrice })
    );
    setTitle("");
    setPrice("");
  }

  async function onCreateInvoice(): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first.");
      return;
    }

    if (!selectedProductId) {
      setTxError("Please select a product first.");
      return;
    }

    if (smokeMode) {
      setTxKind("create-invoice");
      setTxLoading(true);
      setTxError(null);
      setTxResult(null);
      try {
        const feedback = smokeCreateInvoice({
          owner: account.address,
          merchantId: appConfig.objectIds.merchantId || "0xsmoke_merchant",
          productId: selectedProductId
        });
        setTxResult(feedback);
        await loadData();
      } finally {
        setTxLoading(false);
      }
      return;
    }

    await runTx("create-invoice", () =>
      buildCreateInvoiceTx({
        owner: account.address,
        productId: selectedProductId
      })
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <span className="text-2xl">🛍️</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400 text-glow">
                Merchant Console
              </h1>
              <p className="text-slate-400 text-sm">Manage products, issue invoices, and track revenue.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 w-fit">
            <span className="text-violet-500">MERCHANT_ID:</span>
            <span className="truncate max-w-[200px]">{appConfig.objectIds.merchantId || "NOT_CONFIGURED"}</span>
            <button onClick={() => copyText(appConfig.objectIds.merchantId || "")} className="hover:text-white transition-colors">📋</button>
          </div>
        </div>
        <div className="relative z-10">
          <ConnectWalletButton />
        </div>

        {/* Background Decorative Elements */}
        <div className="absolute top-[-50px] left-[20%] w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[20px] right-[10%] w-48 h-48 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {!merchantReady && (
        <div className="panel-card border-red-500/30 bg-red-900/10 p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-red-400 font-bold">Configuration Incomplete</h3>
            <p className="text-red-300/80 text-sm">{merchantConfigError}</p>
          </div>
        </div>
      )}

      {/* Stats HUD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Products", value: products.length, color: "text-violet-400", border: "border-violet-500/30", bg: "bg-violet-500/5" },
          { label: "Pending Revenue", value: unpaidCount, sub: "Invoices", color: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/5" },
          { label: "Settled Orders", value: paidCount, sub: "Invoices", color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5" }
        ].map((stat, i) => (
          <div key={i} className={`panel-card p-5 border-l-4 ${stat.border.replace('border', 'border-l')} ${stat.bg} relative overflow-hidden group`}>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-end gap-2">
                <span className={`text-4xl font-bold ${stat.color}`}>{stat.value}</span>
                {stat.sub && <span className="text-sm text-slate-500 mb-1.5">{stat.sub}</span>}
              </div>
            </div>
            <div className={`absolute right-0 bottom-0 p-4 opacity-5 transform scale-150 group-hover:scale-125 transition-transform duration-500 ${stat.color}`}>
              <span className="text-6xl">❖</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Actions (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Create Product Panel */}
          <div className="panel-card p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-violet-500 rounded-full" />
              Create Product
            </h2>
            <div className="space-y-4">
              {/* @ts-ignore */}
              <Input
                label="Product Title"
                placeholder="e.g., Cyberpunk Jacket"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                classNames={{
                  input: "bg-transparent text-white",
                  inputWrapper: "bg-black/20 border-white/10 hover:border-violet-500/50 focus-within:!border-violet-500 transition-colors"
                }}
              />
              {/* @ts-ignore */}
              <Input
                label="Price (USD)"
                placeholder="e.g., 50"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                classNames={{
                  input: "bg-transparent text-white",
                  inputWrapper: "bg-black/20 border-white/10 hover:border-violet-500/50 focus-within:!border-violet-500 transition-colors"
                }}
                startContent={<span className="text-slate-500">$</span>}
              />
              <Button
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold shadow-lg shadow-violet-900/20"
                isDisabled={!account || !merchantReady || !canCreateProduct || txLoading}
                onPress={onCreateProduct}
              >
                {txKind === "create-product" && txLoading ? "Minting..." : "Mint Product Object"}
              </Button>
            </div>
          </div>

          {/* Create Invoice Panel */}
          <div className="panel-card p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-cyan-500 rounded-full" />
              New Invoice
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 ml-1">Select Product</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500 transition-colors appearance-none"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  {products.length === 0 && <option value="">No Products Available</option>}
                  {products.map((p) => (
                    <option key={p.objectId} value={p.objectId} className="bg-slate-900">
                      {p.title} — ${p.priceU64.toString()}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-900/20"
                isDisabled={!account || !merchantReady || !canCreateInvoice || txLoading}
                onPress={onCreateInvoice}
              >
                {txKind === "create-invoice" && txLoading ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={() => loadData()} className="nav-pill text-xs flex items-center gap-2 hover:bg-white/5">
              ⟳ Refresh
            </button>
            <Link to="/merchant/claim" className="nav-pill text-xs flex items-center gap-2 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30">
              💰 Claim Rewards
            </Link>
          </div>
        </div>

        {/* Right Column: Invoices & History (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <TxFeedbackCard
            label={txKind === "create-product" ? "Product Creation" : txKind === "create-invoice" ? "Invoice Generation" : "Transaction"}
            loading={txLoading}
            error={txError}
            result={txResult}
          />

          <div className="panel-card p-6 min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Invoice History</h2>
              <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
                {[
                  { id: "all", label: "All" },
                  { id: "unpaid", label: "Pending" },
                  { id: "paid", label: "Paid" }
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setInvoiceFilter(filter.id as any)}
                    className={`
                            px-4 py-1.5 rounded-md text-xs font-medium transition-all
                            ${invoiceFilter === filter.id
                        ? "bg-slate-700 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      }
                          `}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredInvoices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 border border-dashed border-slate-700/50 rounded-2xl bg-white/5">
                  <span className="text-4xl mb-2 opacity-30">📜</span>
                  <p>No invoices found</p>
                </div>
              )}

              {filteredInvoices.map((inv) => (
                <div
                  key={inv.objectId}
                  className={`
                           group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all
                           ${inv.status === 1
                      ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30"
                      : "bg-white/5 border-white/5 hover:border-violet-500/30 hover:bg-white/10"
                    }
                        `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`
                              w-10 h-10 rounded-full flex items-center justify-center text-lg mt-1
                              ${inv.status === 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}
                           `}>
                      {inv.status === 1 ? "✓" : "⏳"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 bg-black/30 px-1.5 py-0.5 rounded">
                          {inv.objectId.slice(0, 6)}...{inv.objectId.slice(-4)}
                        </span>
                        <button onClick={() => copyText(inv.objectId)} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white text-xs">❏</button>
                      </div>
                      <div className="font-bold text-white text-lg mt-1">
                        ${inv.amountU64.toString()} <span className="text-xs text-slate-500 font-normal uppercase">USDC</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Buyer: {inv.buyer ? <span className="text-slate-300">{inv.buyer.slice(0, 6)}...</span> : <span className="italic">Waiting for payment...</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {inv.status === 1 ? (
                      <div className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-bold border border-emerald-500/20">
                        PAID
                      </div>
                    ) : (
                      <Link
                        to={`/pay/${inv.objectId}`}
                        className="px-4 py-2 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-sm font-medium border border-white/10 hover:border-cyan-500/50 transition-all flex items-center gap-2"
                      >
                        Pay Now →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
