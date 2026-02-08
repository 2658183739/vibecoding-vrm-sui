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
  if (status === 1) return "已支付";
  if (status === 0) return "待支付";
  return `未知(${status})`;
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
      setTxError("请先连接钱包。");
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
      setTxError("请输入合法商品价格（u64 正整数）。");
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
      setTxError("请先连接钱包。");
      return;
    }

    if (!selectedProductId) {
      setTxError("请先选择商品。");
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">商户控制台</h1>
            <p className="text-sm text-slate-300">创建商品、签发账单，并复制支付链接给买家。</p>
            <p className="mt-2 break-all text-xs text-slate-400">
              商户对象 ID：{appConfig.objectIds.merchantId || "未配置"}
            </p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      {!merchantReady && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">
            配置不完整：{merchantConfigError}
          </Card.Content>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-xs text-slate-400">商品总数</p>
            <p className="text-xl font-semibold text-slate-100">{products.length}</p>
          </Card.Content>
        </Card>
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-xs text-slate-400">待支付账单</p>
            <p className="text-xl font-semibold text-amber-300">{unpaidCount}</p>
          </Card.Content>
        </Card>
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-xs text-slate-400">已支付账单</p>
            <p className="text-xl font-semibold text-emerald-300">{paidCount}</p>
          </Card.Content>
        </Card>
      </div>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-lg border border-violet-400/40 px-3 py-1 text-sm text-violet-300 transition hover:bg-violet-500/10"
            onClick={() => loadData().catch((error) => setTxError(parseErrorMessage(error)))}
          >
            刷新商品与账单
          </button>
          <Link
            className="rounded-lg border border-emerald-400/40 px-3 py-1 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            to="/merchant/claim"
          >
            前往收益领取
          </Link>
          <Link
            className="rounded-lg border border-sky-400/40 px-3 py-1 text-sm text-sky-300 transition hover:bg-sky-500/10"
            to="/merchant/metrics"
          >
            前往指标看板
          </Link>
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">创建商品</h2>
            <Input
              aria-label="商品标题"
              placeholder="请输入商品名称"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              variant="secondary"
            />
            <Input
              aria-label="商品价格"
              placeholder="请输入价格（u64）"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.currentTarget.value)}
              variant="secondary"
            />
            <Button
              data-testid="merchant-create-product-btn"
              variant="primary"
              isDisabled={!account || !merchantReady || !canCreateProduct || txLoading}
              onPress={onCreateProduct}
            >
              创建商品
            </Button>
          </Card.Content>
        </Card>

        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">创建账单</h2>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>选择商品</span>
              <select
                data-testid="merchant-product-select"
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.currentTarget.value)}
              >
                {products.length === 0 && <option value="">暂无商品</option>}
                {products.map((product) => (
                  <option key={product.objectId} value={product.objectId}>
                    {product.title} ({product.priceU64.toString()})
                  </option>
                ))}
              </select>
            </label>
            <Button
              data-testid="merchant-create-invoice-btn"
              variant="secondary"
              isDisabled={!account || !merchantReady || !canCreateInvoice || txLoading}
              onPress={onCreateInvoice}
            >
              创建账单
            </Button>
          </Card.Content>
        </Card>
      </div>

      <TxFeedbackCard
        label={
          txKind === "create-product"
            ? "创建商品交易"
            : txKind === "create-invoice"
              ? "创建账单交易"
              : "交易反馈"
        }
        loading={txLoading}
        error={txError}
        result={txResult}
      />

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">已创建账单</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                data-testid="merchant-invoice-filter-all"
                className={`rounded-full border px-3 py-1 transition ${
                  invoiceFilter === "all"
                    ? "border-sky-300 bg-sky-500/20 text-sky-100"
                    : "border-white/20 text-slate-300 hover:bg-white/5"
                }`}
                onClick={() => setInvoiceFilter("all")}
              >
                全部
              </button>
              <button
                type="button"
                data-testid="merchant-invoice-filter-unpaid"
                className={`rounded-full border px-3 py-1 transition ${
                  invoiceFilter === "unpaid"
                    ? "border-amber-300 bg-amber-500/20 text-amber-100"
                    : "border-white/20 text-slate-300 hover:bg-white/5"
                }`}
                onClick={() => setInvoiceFilter("unpaid")}
              >
                待支付
              </button>
              <button
                type="button"
                data-testid="merchant-invoice-filter-paid"
                className={`rounded-full border px-3 py-1 transition ${
                  invoiceFilter === "paid"
                    ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                    : "border-white/20 text-slate-300 hover:bg-white/5"
                }`}
                onClick={() => setInvoiceFilter("paid")}
              >
                已支付
              </button>
            </div>
          </div>

          {filteredInvoices.length === 0 && (
            <p className="text-sm text-slate-300">当前筛选条件下暂无账单。</p>
          )}

          {filteredInvoices.map((invoice) => (
            <div
              key={invoice.objectId}
              data-testid="merchant-invoice-item"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <div className="space-y-1">
                <p className="break-all text-sm text-slate-100">账单 ID：{invoice.objectId}</p>
                <p className="break-all text-xs text-slate-400">
                  金额={invoice.amountU64.toString()} | 状态={formatInvoiceStatus(invoice.status)} |
                  买家={invoice.buyer ?? "-"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-400/40 px-3 py-1 text-sm text-slate-200 transition hover:bg-slate-500/10"
                  onClick={() => copyText(invoice.objectId)}
                >
                  复制ID
                </button>
                <Link
                  className="rounded-lg border border-emerald-400/40 px-3 py-1 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
                  to={`/pay/${invoice.objectId}`}
                >
                  去支付页
                </Link>
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
