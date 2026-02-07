import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Button, Card, Input } from "@heroui/react";
import { type Transaction } from "@mysten/sui/transactions";
import { Link } from "react-router-dom";
import { appConfig } from "../config";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
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

export default function MerchantPage() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [txKind, setTxKind] = useState<TxKind | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);

  const merchantIdConfigured = appConfig.objectIds.merchantId.length > 0;
  const canCreateProduct = useMemo(
    () => title.trim().length > 0 && Number(price) > 0,
    [title, price]
  );
  const canCreateInvoice = useMemo(() => selectedProductId.length > 0, [selectedProductId]);

  const loadData = useCallback(async () => {
    if (!account?.address) {
      setProducts([]);
      setInvoices([]);
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
  }, [account?.address, selectedProductId]);

  useEffect(() => {
    loadData().catch((error) => setTxError(parseErrorMessage(error)));
  }, [loadData]);

  async function runTx(
    kind: TxKind,
    txFactory: () => Promise<Transaction> | Transaction
  ): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first");
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

  async function onCreateProduct() {
    const parsed = BigInt(Math.floor(Number(price)));
    await runTx("create-product", () =>
      buildCreateProductTx({ title: title.trim(), priceU64: parsed })
    );
  }

  async function onCreateInvoice() {
    await runTx("create-invoice", () => buildCreateInvoiceTx(selectedProductId));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Merchant Console</h1>
            <p className="text-sm text-slate-300">
              Create products, issue invoices, and open pay links.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Configured merchant object: {appConfig.objectIds.merchantId || "MISSING"}
            </p>
          </div>
          <ConnectButton />
        </Card.Content>
      </Card>

      {!merchantIdConfigured && (
        <Card variant="secondary">
          <Card.Content className="text-sm text-red-300">
            Missing `VITE_MERCHANT_ID` in `.env`.
          </Card.Content>
        </Card>
      )}

      <Card variant="secondary">
        <Card.Content className="flex flex-wrap gap-3">
          <Link
            className="rounded-lg border border-emerald-400/40 px-3 py-1 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            to="/merchant/claim"
          >
            Open Claim Page
          </Link>
          <Link
            className="rounded-lg border border-sky-400/40 px-3 py-1 text-sm text-sky-300 transition hover:bg-sky-500/10"
            to="/merchant/metrics"
          >
            Open Metrics Page
          </Link>
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="secondary">
          <Card.Content className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Create Product</h2>
            <Input
              aria-label="Product title"
              placeholder="Product title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              variant="secondary"
            />
            <Input
              aria-label="Product price"
              placeholder="Price (u64)"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.currentTarget.value)}
              variant="secondary"
            />
            <Button
              variant="primary"
              isDisabled={!account || !merchantIdConfigured || !canCreateProduct || txLoading}
              onPress={onCreateProduct}
            >
              Create Product
            </Button>
          </Card.Content>
        </Card>

        <Card variant="secondary">
          <Card.Content className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Create Invoice</h2>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Product</span>
              <select
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.currentTarget.value)}
              >
                {products.length === 0 && <option value="">No product</option>}
                {products.map((product) => (
                  <option key={product.objectId} value={product.objectId}>
                    {product.title} ({product.priceU64.toString()})
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              isDisabled={!account || !merchantIdConfigured || !canCreateInvoice || txLoading}
              onPress={onCreateInvoice}
            >
              Create Invoice
            </Button>
          </Card.Content>
        </Card>
      </div>

      <TxFeedbackCard
        label={
          txKind === "create-product"
            ? "Create Product TX"
            : txKind === "create-invoice"
              ? "Create Invoice TX"
              : "Transaction Feedback"
        }
        loading={txLoading}
        error={txError}
        result={txResult}
      />

      <Card variant="secondary">
        <Card.Content className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Created Invoices</h2>
          {invoices.length === 0 && (
            <p className="text-sm text-slate-300">No invoices found in current wallet.</p>
          )}
          {invoices.map((invoice) => (
            <div
              key={invoice.objectId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-sm text-slate-100">Invoice: {invoice.objectId}</p>
                <p className="text-xs text-slate-400">
                  amount={invoice.amountU64.toString()} | status={invoice.status} | buyer=
                  {invoice.buyer ?? "-"}
                </p>
              </div>
              <Link
                className="rounded-lg border border-emerald-400/40 px-3 py-1 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
                to={`/pay/${invoice.objectId}`}
              >
                Open Pay Page
              </Link>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
