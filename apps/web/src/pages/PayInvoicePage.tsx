import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ConnectButton, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Button, Card } from "@heroui/react";
import { appConfig } from "../config";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import {
  buildPayInvoiceTx,
  fetchInvoice,
  fetchProduct,
  normalizeTxFeedback,
  parseErrorMessage,
  type Invoice,
  type Product,
  type TxFeedback
} from "../lib/sui";
import {
  buildMintAndPayTx,
  previewMintAndPayTx,
  type MintAndPayPreview
} from "../lib/tx/buildMintAndPayTx";

function formatRpcAwareError(error: unknown): string {
  const message = parseErrorMessage(error);
  if (/rpc|fetch|network|timeout|503|502|500/i.test(message)) {
    return `RPC error: ${message}`;
  }
  return message;
}

export default function PayInvoicePage() {
  const { invoiceId = "" } = useParams();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [payTxLoading, setPayTxLoading] = useState(false);
  const [payTxError, setPayTxError] = useState<string | null>(null);
  const [payTxResult, setPayTxResult] = useState<TxFeedback | null>(null);

  const [mintPayLoading, setMintPayLoading] = useState(false);
  const [mintPayError, setMintPayError] = useState<string | null>(null);
  const [mintPayResult, setMintPayResult] = useState<TxFeedback | null>(null);
  const [mintPayPreview, setMintPayPreview] = useState<MintAndPayPreview | null>(null);
  const [mintPayPreviewError, setMintPayPreviewError] = useState<string | null>(null);

  const loadInvoiceData = useCallback(async () => {
    if (!invoiceId) {
      setPageError("Missing invoice id in URL");
      setInvoice(null);
      setProduct(null);
      return;
    }

    setPageError(null);
    const currentInvoice = await fetchInvoice(invoiceId);
    setInvoice(currentInvoice);

    if (currentInvoice.productId) {
      setProduct(await fetchProduct(currentInvoice.productId));
      return;
    }

    setProduct(null);
  }, [invoiceId]);

  useEffect(() => {
    loadInvoiceData().catch((error) => setPageError(parseErrorMessage(error)));
  }, [loadInvoiceData]);

  useEffect(() => {
    async function loadPreview() {
      if (!account || !invoice) {
        setMintPayPreview(null);
        setMintPayPreviewError(null);
        return;
      }

      try {
        setMintPayPreviewError(null);
        const preview = await previewMintAndPayTx({
          owner: account.address,
          amountU64: invoice.amountU64
        });
        setMintPayPreview(preview);
      } catch (error) {
        setMintPayPreview(null);
        setMintPayPreviewError(formatRpcAwareError(error));
      }
    }

    loadPreview().catch((error) => setMintPayPreviewError(formatRpcAwareError(error)));
  }, [account, invoice]);

  async function onPay(): Promise<void> {
    if (!account) {
      setPayTxError("Please connect wallet first");
      return;
    }

    if (!invoice) {
      setPayTxError("Invoice not loaded");
      return;
    }

    setPayTxLoading(true);
    setPayTxError(null);
    setPayTxResult(null);

    try {
      const tx = await buildPayInvoiceTx({
        owner: account.address,
        merchantId: invoice.merchantId,
        invoiceId: invoice.objectId,
        amountU64: invoice.amountU64,
        coinType: appConfig.contract.payCoinType
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setPayTxResult(await normalizeTxFeedback(result));
      await loadInvoiceData();
    } catch (error) {
      setPayTxError(formatRpcAwareError(error));
    } finally {
      setPayTxLoading(false);
    }
  }

  async function onPayWithUsdcMintAndPay(): Promise<void> {
    if (!account) {
      setMintPayError("Please connect wallet first");
      return;
    }

    if (!invoice) {
      setMintPayError("Invoice not loaded");
      return;
    }

    setMintPayLoading(true);
    setMintPayError(null);
    setMintPayResult(null);

    try {
      const { tx, preview } = await buildMintAndPayTx({
        owner: account.address,
        merchantId: invoice.merchantId,
        invoiceId: invoice.objectId,
        amountU64: invoice.amountU64
      });

      setMintPayPreview(preview);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setMintPayResult(await normalizeTxFeedback(result));
      await loadInvoiceData();
    } catch (error) {
      setMintPayError(formatRpcAwareError(error));
    } finally {
      setMintPayLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Pay Invoice</h1>
            <p className="text-sm text-slate-300">Invoice ID: {invoiceId}</p>
            <p className="text-xs text-slate-400">
              Pay coin type: {appConfig.contract.payCoinType}
            </p>
            <p className="text-xs text-slate-400">
              Stable coin type: {appConfig.stableLayer.stableCoinType || "MISSING"} | USDC type:{" "}
              {appConfig.stableLayer.usdcType || "MISSING"}
            </p>
          </div>
          <ConnectButton />
        </Card.Content>
      </Card>

      {pageError && (
        <Card variant="secondary">
          <Card.Content className="text-sm text-red-300">{pageError}</Card.Content>
        </Card>
      )}

      <Card variant="secondary">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p>Product: {product?.title ?? "-"}</p>
          <p>Product price: {product?.priceU64.toString() ?? "-"}</p>
          <p>Invoice amount: {invoice?.amountU64.toString() ?? "-"}</p>
          <p>Merchant object: {invoice?.merchantId ?? "-"}</p>
          <p>Invoice status: {invoice?.status ?? "-"}</p>
          <p>Buyer: {invoice?.buyer ?? "-"}</p>
          <p>Created at(ms): {invoice?.createdAtMs.toString() ?? "-"}</p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="space-y-3 text-sm text-slate-200">
          <h2 className="text-base font-semibold text-slate-100">
            Mint+Pay Preview (USDC -&gt; BrandUSD -&gt; Pay)
          </h2>
          {!account && <p>Connect wallet to preview USDC selection and mint/pay amount.</p>}
          {account && !invoice && <p>Invoice not loaded yet.</p>}
          {mintPayPreviewError && <p className="text-red-300">{mintPayPreviewError}</p>}
          {mintPayPreview && (
            <div className="space-y-1">
              <p>
                Will mint: {mintPayPreview.mintAmount.toString()} (
                {appConfig.stableLayer.brandUsdType || "BrandUSD"})
              </p>
              <p>
                Will pay: {mintPayPreview.payAmount.toString()} (
                {appConfig.stableLayer.brandUsdType || "BrandUSD"})
              </p>
              <p>
                USDC selected total: {mintPayPreview.totalSelected.toString()} (
                {appConfig.stableLayer.usdcType})
              </p>
              <p className="break-all">
                USDC coins: {mintPayPreview.selectedCoinIds.join(", ") || "-"}
              </p>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              isDisabled={!account || !invoice || payTxLoading || invoice?.status === 1}
              onPress={onPay}
            >
              {invoice?.status === 1 ? "Already Paid" : "Pay"}
            </Button>

            <Button
              variant="secondary"
              isDisabled={!account || !invoice || mintPayLoading || invoice?.status === 1}
              onPress={onPayWithUsdcMintAndPay}
            >
              {invoice?.status === 1 ? "Already Paid" : "Pay with USDC (Mint+Pay in one TX)"}
            </Button>
          </div>

          <TxFeedbackCard
            label="Pay Invoice TX"
            loading={payTxLoading}
            error={payTxError}
            result={payTxResult}
          />
          <TxFeedbackCard
            label="Pay with USDC (Mint+Pay) TX"
            loading={mintPayLoading}
            error={mintPayError}
            result={mintPayResult}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
