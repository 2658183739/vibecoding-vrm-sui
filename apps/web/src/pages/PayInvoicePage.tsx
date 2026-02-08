import type { LocalAgentAction } from "@vibesui/agent";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import {
  appConfig,
  assertRequiredConfigForPay,
  assertRequiredConfigForStableLayerMintPay,
  toExplorerTxUrl
} from "../config";
import { RecentTxHistoryCard } from "../components/RecentTxHistoryCard";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import {
  getLocalAgentHealth,
  getLocalAgentSuggestions,
  openInControlledBrowser
} from "../lib/localAgentClient";
import { isSmokeMode } from "../lib/smokeMode";
import {
  smokeCheckoutEvents,
  smokeGetBalance,
  smokeGetInvoice,
  smokeGetProduct,
  smokePayInvoice,
  smokePreviewUsdc,
  smokeTxProof,
  type SmokeTxFeedback
} from "../lib/smokeState";
import { recordRecentTxHistory } from "../lib/txHistory";
import { ConnectWalletButton, useWalletAccount, useWalletDAppKit } from "../lib/wallet";
import {
  buildPayInvoiceTx,
  fetchCoinBalance,
  fetchInvoice,
  fetchLatestCheckoutEvents,
  fetchProduct,
  fetchTxChainProof,
  normalizeTxFeedback,
  parseErrorMessage,
  type CheckoutEventItem,
  type Invoice,
  type Product,
  type TxChainProof,
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
    return `RPC Request Exception: ${message}`;
  }
  return message;
}

function toTxFeedback(input: SmokeTxFeedback): TxFeedback {
  return {
    digest: input.digest,
    status: input.status,
    explorerUrl: input.explorerUrl,
    errorMessage: input.errorMessage,
    receiptObjectId: input.receiptObjectId
  };
}

function formatTimestamp(timestampMs?: number): string {
  if (!timestampMs) return "-";
  const date = new Date(timestampMs);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function includesInvoiceId(eventItem: CheckoutEventItem, invoiceId: string): boolean {
  if (!eventItem.parsedJson) return false;
  const raw = JSON.stringify(eventItem.parsedJson);
  return raw.includes(invoiceId);
}

function renderProofCard(title: string, proof: TxChainProof | null) {
  return (
    <Card variant="secondary" className="panel-card">
      <Card.Content className="space-y-2 text-sm text-slate-200">
        <p className="font-semibold text-slate-100">{title}</p>
        {!proof && <p className="text-slate-400">No on-chain proof (Complete a tx first).</p>}
        {proof && (
          <>
            <p className="break-all">Digest：{proof.digest}</p>
            <p>Status: {proof.status}</p>
            <p>Checkpoint: {proof.checkpoint ?? "-"}</p>
            <p>Event Count: {proof.eventCount}</p>
            <p>Gas Used(MIST): {proof.gasUsedMIST ?? "-"}</p>
            <p>Time: {formatTimestamp(proof.timestampMs)}</p>
            <p className="break-all">
              Created Objects: {proof.createdObjectIds.length > 0 ? proof.createdObjectIds.join(", ") : "-"}
            </p>
            <a
              href={toExplorerTxUrl(proof.digest)}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-300 underline"
            >
              Verify in Explorer
            </a>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

function localAgentActionLabel(action: LocalAgentAction): string {
  if (action.label && action.label.trim()) return action.label;
  if (action.type === "OPEN_URL") return "Open URL in Controlled Browser";
  if (action.type === "MINT_AND_PAY") return "Execute One-Click Mint+Pay";
  if (action.type === "BURN") return "Go to Redeem Flow";
  if (action.type === "CLAIM") return "Go to Claim Flow";
  if (action.type === "CHECK_TX") return "Check Transaction Status";
  return action.type;
}

interface UiErrorToast {
  id: string;
  title: string;
  message: string;
  details: string;
}

function newErrorToastId(): string {
  return `err_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function stringifyErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "Unknown error details.";
  }
}

export default function PayInvoicePage() {
  const { invoiceId = "" } = useParams();
  const navigate = useNavigate();
  const account = useWalletAccount();
  const accountAddress = account?.address ?? "";
  const dAppKit = useWalletDAppKit();
  const smokeMode = isSmokeMode();

  const payConfigError = useMemo(() => {
    if (smokeMode) return null;
    try {
      assertRequiredConfigForPay();
      return null;
    } catch (error) {
      return parseErrorMessage(error);
    }
  }, [smokeMode]);

  const mintPayConfigError = useMemo(() => {
    if (smokeMode) return null;
    try {
      assertRequiredConfigForStableLayerMintPay();
      return null;
    } catch (error) {
      return parseErrorMessage(error);
    }
  }, [smokeMode]);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [payTxLoading, setPayTxLoading] = useState(false);
  const [payTxError, setPayTxError] = useState<string | null>(null);
  const [payTxResult, setPayTxResult] = useState<TxFeedback | null>(null);

  const [mintPayLoading, setMintPayLoading] = useState(false);
  const [mintPayError, setMintPayError] = useState<string | null>(null);
  const [mintPayResult, setMintPayResult] = useState<TxFeedback | null>(null);
  const [mintPayPreview, setMintPayPreview] = useState<MintAndPayPreview | null>(null);
  const [mintPayPreviewError, setMintPayPreviewError] = useState<string | null>(null);
  const invoiceAmount = invoice?.amountU64;

  const [directProof, setDirectProof] = useState<TxChainProof | null>(null);
  const [mintProof, setMintProof] = useState<TxChainProof | null>(null);
  const [eventFeed, setEventFeed] = useState<CheckoutEventItem[]>([]);
  const [localAgentLoading, setLocalAgentLoading] = useState(false);
  const [localAgentError, setLocalAgentError] = useState<string | null>(null);
  const [localAgentMessage, setLocalAgentMessage] = useState<string | null>(null);
  const [localAgentSuggestLoading, setLocalAgentSuggestLoading] = useState(false);
  const [localAgentSuggestError, setLocalAgentSuggestError] = useState<string | null>(null);
  const [localAgentActions, setLocalAgentActions] = useState<LocalAgentAction[]>([]);
  const [errorToasts, setErrorToasts] = useState<UiErrorToast[]>([]);

  const visibleEvents = useMemo(() => eventFeed.slice(0, 6), [eventFeed]);

  const bumpHistoryRefresh = useCallback(() => {
    setHistoryRefreshKey((prev) => prev + 1);
  }, []);

  const pushErrorToast = useCallback((title: string, message: string, error?: unknown) => {
    const details = error ? stringifyErrorDetails(error) : message;
    setErrorToasts((prev) => [
      { id: newErrorToastId(), title, message, details },
      ...prev
    ].slice(0, 4));
  }, []);

  const dismissErrorToast = useCallback((id: string) => {
    setErrorToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const confirmMintAndPayPolicy = useCallback(
    (amountU64: bigint, currentInvoiceId: string): { ok: true } | { ok: false; message: string } => {
      const callTarget = `${appConfig.contract.packageId}::${appConfig.contract.moduleName}::${appConfig.contract.payInvoiceFn}`;
      const stableCoinType = appConfig.stableLayer.stableCoinType || "未配置";
      const maxAmount = appConfig.policy.maxMintAndPayAmountU64;

      const summary = [
        "Please confirm Mint+Pay transaction:",
        `- Invoice ID: ${currentInvoiceId}`,
        `- Amount(u64): ${amountU64.toString()}`,
        `- StableCoin Type: ${stableCoinType}`,
        `- Call Target: ${callTarget}`,
        `- Policy Max(u64): ${maxAmount.toString()}`
      ].join("\n");

      if (!window.confirm(summary)) {
        return { ok: false, message: "User cancelled transaction confirmation." };
      }

      if (amountU64 > maxAmount) {
        const secondConfirm = window.confirm(
          `Transaction amount ${amountU64.toString()} exceeds policy max ${maxAmount.toString()}.\nPlease confirm again.`
        );
        if (!secondConfirm) {
          return { ok: false, message: "Transaction blocked by policy: Exceeds limit and rejected secondary confirmation." };
        }
      }

      return { ok: true };
    },
    []
  );

  const loadInvoiceData = useCallback(async () => {
    if (!invoiceId) {
      setPageError("Missing invoiceId in URL.");
      setInvoice(null);
      setProduct(null);
      return;
    }

    setPageError(null);

    if (smokeMode) {
      const currentInvoice = smokeGetInvoice(invoiceId);
      if (!currentInvoice) {
        setPageError("Invoice not found in smoke mode.");
        setInvoice(null);
        setProduct(null);
        return;
      }

      setInvoice(currentInvoice);
      setProduct(currentInvoice.productId ? smokeGetProduct(currentInvoice.productId) : null);
      return;
    }

    const currentInvoice = await fetchInvoice(invoiceId);
    setInvoice(currentInvoice);
    setProduct(currentInvoice.productId ? await fetchProduct(currentInvoice.productId) : null);
  }, [invoiceId, smokeMode]);

  const loadEvents = useCallback(async () => {
    if (!invoiceId) {
      setEventFeed([]);
      return;
    }

    if (smokeMode) {
      const owner = accountAddress || "0xsmoke";
      const smokeEvents = smokeCheckoutEvents(owner, 20)
        .filter((item) => item.invoiceId === invoiceId)
        .map((item) => ({
          id: item.id,
          txDigest: item.txDigest,
          eventType: item.eventName,
          eventName: item.eventName,
          sender: item.sender,
          timestampMs: item.timestampMs
        }));
      setEventFeed(smokeEvents);
      return;
    }

    const events = await fetchLatestCheckoutEvents(30);
    const matched = events.filter((item) => includesInvoiceId(item, invoiceId));
    setEventFeed(matched.length > 0 ? matched : events);
  }, [accountAddress, invoiceId, smokeMode]);

  useEffect(() => {
    loadInvoiceData().catch((error) => setPageError(parseErrorMessage(error)));
  }, [loadInvoiceData]);

  useEffect(() => {
    loadEvents().catch((error) => setPageError(parseErrorMessage(error)));
  }, [loadEvents, historyRefreshKey]);

  useEffect(() => {
    async function loadPreview() {
      if (!accountAddress || !invoiceAmount) {
        setMintPayPreview(null);
        setMintPayPreviewError(null);
        return;
      }

      try {
        setMintPayPreviewError(null);

        if (smokeMode) {
          const usdcPreview = smokePreviewUsdc({
            owner: accountAddress,
            usdcType: appConfig.stableLayer.usdcType || "0xsmoke::usdc::USDC",
            amount: invoiceAmount
          });

          setMintPayPreview({
            amount: invoiceAmount,
            totalSelected: usdcPreview.totalSelected,
            selectedCoinIds: usdcPreview.selectedCoinIds,
            mintAmount: invoiceAmount,
            payAmount: invoiceAmount
          });
          return;
        }

        const preview = await previewMintAndPayTx({
          owner: accountAddress,
          amountU64: invoiceAmount
        });
        setMintPayPreview(preview);
      } catch (error) {
        setMintPayPreview(null);
        setMintPayPreviewError(formatRpcAwareError(error));
      }
    }

    loadPreview().catch((error) => setMintPayPreviewError(formatRpcAwareError(error)));
  }, [accountAddress, invoiceAmount, smokeMode]);

  const loadLocalAgentSuggestions = useCallback(async () => {
    if (!invoiceId) {
      setLocalAgentActions([]);
      setLocalAgentSuggestError(null);
      return;
    }

    setLocalAgentSuggestLoading(true);
    setLocalAgentSuggestError(null);

    try {
      const balances: Record<string, string> = {};
      const stableCoinType = appConfig.stableLayer.stableCoinType || undefined;
      const usdcType = appConfig.stableLayer.usdcType || undefined;
      const payCoinType = appConfig.contract.payCoinType || undefined;
      const amount = invoiceAmount?.toString();

      if (accountAddress) {
        const trackedTypes = [stableCoinType, usdcType, payCoinType].filter(
          (value): value is string => Boolean(value)
        );

        if (smokeMode) {
          for (const coinType of trackedTypes) {
            balances[coinType] = smokeGetBalance(accountAddress, coinType).toString();
          }
        } else {
          await Promise.all(
            trackedTypes.map(async (coinType) => {
              try {
                balances[coinType] = (await fetchCoinBalance(accountAddress, coinType)).toString();
              } catch {
                // Keep best-effort context; one failed balance query should not block suggestions.
              }
            })
          );
        }
      }

      const response = await getLocalAgentSuggestions({
        invoiceId,
        url: window.location.href,
        balances,
        stableCoinType,
        amount
      });
      setLocalAgentActions(response.suggestedActions || []);
    } catch (error) {
      setLocalAgentActions([]);
      const message = formatRpcAwareError(error);
      setLocalAgentSuggestError(message);
      pushErrorToast("Local Agent Suggest Failed", message, error);
    } finally {
      setLocalAgentSuggestLoading(false);
    }
  }, [accountAddress, invoiceAmount, invoiceId, pushErrorToast, smokeMode]);

  useEffect(() => {
    loadLocalAgentSuggestions().catch((error) => setLocalAgentSuggestError(formatRpcAwareError(error)));
  }, [loadLocalAgentSuggestions, historyRefreshKey]);

  async function onPay(): Promise<void> {
    if (!account) {
      const message = "Please connect wallet first.";
      setPayTxError(message);
      pushErrorToast("Direct Pay Failed", message);
      return;
    }
    if (!invoice) {
      const message = "Invoice data not loaded.";
      setPayTxError(message);
      pushErrorToast("Direct Pay Failed", message);
      return;
    }
    if (payConfigError) {
      const message = `Config incomplete: ${payConfigError}`;
      setPayTxError(message);
      pushErrorToast("Direct Pay Failed", message);
      return;
    }

    setPayTxLoading(true);
    setPayTxError(null);
    setPayTxResult(null);

    try {
      if (smokeMode) {
        const feedback = smokePayInvoice({
          invoiceId: invoice.objectId,
          buyer: account.address,
          amountU64: invoice.amountU64
        });
        const mapped = toTxFeedback(feedback);
        setPayTxResult(mapped);
        setDirectProof(
          smokeTxProof({
            digest: mapped.digest,
            status: mapped.status,
            receiptObjectId: mapped.receiptObjectId
          })
        );
        if (mapped.status === "failure" && mapped.errorMessage) {
          setPayTxError(mapped.errorMessage);
        }
        bumpHistoryRefresh();
        await loadInvoiceData();
        return;
      }

      const tx = await buildPayInvoiceTx({
        owner: account.address,
        merchantId: invoice.merchantId,
        invoiceId: invoice.objectId,
        amountU64: invoice.amountU64,
        coinType: appConfig.contract.payCoinType
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const normalized = await normalizeTxFeedback(result);
      setPayTxResult(normalized);
      setDirectProof(await fetchTxChainProof(normalized.digest));

      recordRecentTxHistory({
        scene: "pay.direct",
        digest: normalized.digest,
        status: normalized.status,
        explorerUrl: normalized.explorerUrl,
        errorMessage: normalized.errorMessage,
        receiptObjectId: normalized.receiptObjectId
      });
      bumpHistoryRefresh();
      await loadInvoiceData();
    } catch (error) {
      const message = formatRpcAwareError(error);
      setPayTxError(message);
      pushErrorToast("Direct Pay Failed", message, error);
    } finally {
      setPayTxLoading(false);
    }
  }

  async function onPayWithUsdcMintAndPay(): Promise<void> {
    if (!account) {
      const message = "Please connect wallet first.";
      setMintPayError(message);
      pushErrorToast("Mint+Pay Failed", message);
      return;
    }
    if (!invoice) {
      const message = "Invoice data not loaded.";
      setMintPayError(message);
      pushErrorToast("Mint+Pay Failed", message);
      return;
    }
    if (mintPayConfigError) {
      const message = `Config incomplete: ${mintPayConfigError}`;
      setMintPayError(message);
      pushErrorToast("Mint+Pay Failed", message);
      return;
    }

    const policyCheck = confirmMintAndPayPolicy(invoice.amountU64, invoice.objectId);
    if (!policyCheck.ok) {
      setMintPayError(policyCheck.message);
      pushErrorToast("Policy Restriction", policyCheck.message);
      return;
    }

    setMintPayLoading(true);
    setMintPayError(null);
    setMintPayResult(null);

    try {
      if (smokeMode) {
        const feedback = smokePayInvoice({
          invoiceId: invoice.objectId,
          buyer: account.address,
          amountU64: invoice.amountU64
        });
        const mapped = toTxFeedback(feedback);
        setMintPayResult(mapped);
        setMintProof(
          smokeTxProof({
            digest: mapped.digest,
            status: mapped.status,
            receiptObjectId: mapped.receiptObjectId
          })
        );
        if (mapped.status === "failure" && mapped.errorMessage) {
          setMintPayError(mapped.errorMessage);
        }
        bumpHistoryRefresh();
        await loadInvoiceData();
        return;
      }

      const { tx, preview } = await buildMintAndPayTx({
        owner: account.address,
        merchantId: invoice.merchantId,
        invoiceId: invoice.objectId,
        amountU64: invoice.amountU64
      });

      setMintPayPreview(preview);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const normalized = await normalizeTxFeedback(result);
      setMintPayResult(normalized);
      setMintProof(await fetchTxChainProof(normalized.digest));

      recordRecentTxHistory({
        scene: "pay.mint_and_pay",
        digest: normalized.digest,
        status: normalized.status,
        explorerUrl: normalized.explorerUrl,
        errorMessage: normalized.errorMessage,
        receiptObjectId: normalized.receiptObjectId
      });
      bumpHistoryRefresh();
      await loadInvoiceData();
    } catch (error) {
      const message = formatRpcAwareError(error);
      setMintPayError(message);
      pushErrorToast("Mint+Pay Failed", message, error);
    } finally {
      setMintPayLoading(false);
    }
  }

  async function onOpenControlledBrowser(url?: string): Promise<void> {
    setLocalAgentLoading(true);
    setLocalAgentError(null);
    setLocalAgentMessage(null);

    try {
      const targetUrl = url && url.trim() ? url : window.location.href;
      await getLocalAgentHealth();
      const result = await openInControlledBrowser(targetUrl);
      if (result.fallbackUsed) {
        setLocalAgentMessage(
          `Fallback browser open triggered. ${result.warning ? `OpenClaw Warning: ${result.warning}` : ""}`
        );
      } else {
        setLocalAgentMessage("Current invoice page opened in controlled browser.");
      }
    } catch (error) {
      const message = formatRpcAwareError(error);
      setLocalAgentError(message);
      pushErrorToast("Controlled Browser Open Failed", message, error);
    } finally {
      setLocalAgentLoading(false);
    }
  }

  async function onRunLocalAgentAction(action: LocalAgentAction): Promise<void> {
    if (action.disabled || action.disabledReason) {
      const message = action.disabledReason || "Action currently unavailable.";
      setLocalAgentError(message);
      pushErrorToast("Agent Action Unavailable", message);
      return;
    }

    setLocalAgentError(null);
    setLocalAgentMessage(null);

    if (action.type === "OPEN_URL") {
      await onOpenControlledBrowser(action.payload.url);
      return;
    }

    if (action.type === "MINT_AND_PAY") {
      await onPayWithUsdcMintAndPay();
      return;
    }

    if (action.type === "BURN") {
      navigate("/redeem");
      return;
    }

    if (action.type === "CLAIM") {
      navigate("/merchant/claim");
      return;
    }

    if (action.type === "CHECK_TX") {
      const digest = action.payload.digest?.trim();
      if (!digest) {
        const message = "Missing digest, cannot check tx status.";
        setLocalAgentError(message);
        pushErrorToast("Check Tx Status Failed", message);
        return;
      }

      const explorerUrl = toExplorerTxUrl(digest);
      if (!explorerUrl) {
        const message = "Explorer URL not configured for current network.";
        setLocalAgentError(message);
        pushErrorToast("Check Tx Status Failed", message);
        return;
      }

      window.open(explorerUrl, "_blank", "noopener,noreferrer");
      setLocalAgentMessage(`Opened explorer for tx ${digest}.`);
      return;
    }

    const message = `Unsupported action type: ${action.type}`;
    setLocalAgentError(message);
    pushErrorToast("Agent Action Failed", message);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(6,16,30,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Pay Invoice</h1>
            <p className="break-all text-sm text-slate-300">Invoice ID: {invoiceId}</p>
            <p className="text-xs text-slate-400">Pay Coin: {appConfig.contract.payCoinType}</p>
            <p className="text-xs text-slate-400">
              Stable Coin: {appConfig.stableLayer.stableCoinType || "Not Configured"} | USDC Type:
              {appConfig.stableLayer.usdcType || "Not Configured"}
            </p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      {pageError && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">{pageError}</Card.Content>
        </Card>
      )}

      {payConfigError && !smokeMode && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">
            Direct Pay Unavailable: {payConfigError}
          </Card.Content>
        </Card>
      )}

      {mintPayConfigError && !smokeMode && (
        <Card variant="secondary" className="panel-card border-amber-400/40">
          <Card.Content className="text-sm text-amber-200">
            USDC Mint+Pay Unavailable: {mintPayConfigError}
          </Card.Content>
        </Card>
      )}

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p>Product: {product?.title ?? "-"}</p>
          <p>Price: {product?.priceU64.toString() ?? "-"}</p>
          <p>Invoice Amount: {invoice?.amountU64.toString() ?? "-"}</p>
          <p className="break-all">Merchant: {invoice?.merchantId ?? "-"}</p>
          <p>Status: {invoice?.status === 1 ? "Paid" : invoice?.status === 0 ? "Pending" : "-"}</p>
          <p className="break-all">Buyer: {invoice?.buyer ?? "-"}</p>
          <p>Created At(ms): {invoice?.createdAtMs.toString() ?? "-"}</p>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3 text-sm text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-100">
              Mint+Pay Preview (USDC -&gt; BrandUSD -&gt; Pay)
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${smokeMode
                ? "border border-amber-300/40 bg-amber-500/20 text-amber-100"
                : "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                }`}
            >
              {smokeMode ? "Demo Preview" : "Real Chain Preview"}
            </span>
          </div>
          {smokeMode && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Currently in Demo Mode. USDC list is simulated for flow demonstration, not real chain state.
            </p>
          )}
          {!account && <p>Connect wallet to preview selection, mint and pay amounts.</p>}
          {account && !invoice && <p>Invoice not loaded.</p>}
          {mintPayPreviewError && <p className="text-red-300">{mintPayPreviewError}</p>}
          {mintPayPreview && (
            <div className="space-y-1" data-testid="pay-mint-preview">
              <p>
                Est. Mint: {mintPayPreview.mintAmount.toString()} (
                {appConfig.stableLayer.brandUsdType || "BrandUSD"})
              </p>
              <p>
                Est. Pay: {mintPayPreview.payAmount.toString()} (
                {appConfig.stableLayer.brandUsdType || "BrandUSD"})
              </p>
              <p>
                Selected USDC Total: {mintPayPreview.totalSelected.toString()} (
                {appConfig.stableLayer.usdcType || "-"})
              </p>
              <p className="break-all">Selected USDC Objects: {mintPayPreview.selectedCoinIds.join(", ") || "-"}</p>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="pay-direct-btn"
              variant="primary"
              isDisabled={
                !account || !invoice || payTxLoading || invoice?.status === 1 || !!payConfigError
              }
              onPress={onPay}
            >
              {invoice?.status === 1 ? "Invoice Paid" : "Direct Pay"}
            </Button>

            <Button
              data-testid="pay-mint-btn"
              variant="secondary"
              isDisabled={
                !account ||
                !invoice ||
                mintPayLoading ||
                invoice?.status === 1 ||
                !!mintPayConfigError
              }
              onPress={onPayWithUsdcMintAndPay}
            >
              {invoice?.status === 1 ? "Invoice Paid" : "USDC One-Click Pay (Mint+Pay)"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Policy Limit: Default Max {appConfig.policy.maxMintAndPayAmountU64.toString()} (u64). Secondary confirmation required if exceeded.
          </p>

          <TxFeedbackCard
            label="Direct Pay Tx"
            loading={payTxLoading}
            error={payTxError}
            result={payTxResult}
          />
          <TxFeedbackCard
            label="USDC 一键支付交易"
            loading={mintPayLoading}
            error={mintPayError}
            result={mintPayResult}
          />
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-sm font-semibold text-slate-100">Local Agent 快捷动作</p>
          <p className="text-xs text-slate-400">
            页面会向 localhost:3777 请求建议动作，并可一键触发受控打开/一键支付等流程。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isDisabled={localAgentLoading}
              onPress={() => void onOpenControlledBrowser()}
            >
              {localAgentLoading ? "处理中..." : "Open current invoice in controlled browser"}
            </Button>
            <Button
              variant="secondary"
              isDisabled={localAgentSuggestLoading}
              onPress={() => void loadLocalAgentSuggestions()}
            >
              {localAgentSuggestLoading ? "正在刷新建议..." : "刷新 Agent 建议动作"}
            </Button>
          </div>
          {localAgentSuggestError && <p className="text-sm text-red-300">{localAgentSuggestError}</p>}
          {localAgentActions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">建议动作</p>
              <div className="flex flex-wrap gap-2">
                {localAgentActions.map((action, index) => {
                  const isDisabled =
                    Boolean(action.disabled || action.disabledReason) ||
                    localAgentLoading ||
                    payTxLoading ||
                    mintPayLoading;

                  return (
                    <Button
                      key={`${action.type}-${index}`}
                      variant="secondary"
                      isDisabled={isDisabled}
                      onPress={() => void onRunLocalAgentAction(action)}
                    >
                      {localAgentActionLabel(action)}
                    </Button>
                  );
                })}
              </div>
              {localAgentActions
                .filter((action) => action.disabledReason)
                .map((action, index) => (
                  <p key={`${action.type}-reason-${index}`} className="text-xs text-amber-300">
                    {localAgentActionLabel(action)}：{action.disabledReason}
                  </p>
                ))}
            </div>
          )}
          {localAgentActions.length === 0 && !localAgentSuggestLoading && !localAgentSuggestError && (
            <p className="text-xs text-slate-400">暂无建议动作，可点击“刷新 Agent 建议动作”。</p>
          )}
          {localAgentError && <p className="text-sm text-red-300">{localAgentError}</p>}
          {localAgentMessage && <p className="text-sm text-emerald-300">{localAgentMessage}</p>}
        </Card.Content>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {renderProofCard("链上证明：直接支付", directProof)}
        {renderProofCard("链上证明：USDC 一键支付", mintProof)}
      </div>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3 text-sm text-slate-200">
          <p className="font-semibold text-slate-100">该账单相关事件流（可在区块浏览器验证）</p>
          {visibleEvents.length === 0 && <p className="text-slate-400">暂无事件。</p>}
          {visibleEvents.map((eventItem) => (
            <div
              key={eventItem.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <p className="text-xs text-slate-400">{formatTimestamp(eventItem.timestampMs)}</p>
              <p className="text-sm text-slate-100">{eventItem.eventName}</p>
              <p className="break-all text-xs text-slate-400">交易：{eventItem.txDigest}</p>
              <a
                href={toExplorerTxUrl(eventItem.txDigest)}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline"
              >
                在区块浏览器查看该事件
              </a>
            </div>
          ))}
        </Card.Content>
      </Card>

      <RecentTxHistoryCard title="本地最近交易（演示用）" refreshKey={historyRefreshKey} />

      {errorToasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-md flex-col gap-3 px-4">
          {errorToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto rounded-xl border border-red-400/45 bg-slate-950/95 p-3 text-sm text-red-100 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{toast.title}</p>
                  <p className="mt-1 text-red-200">{toast.message}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-white/20 px-2 py-0.5 text-xs text-slate-200"
                  onClick={() => dismissErrorToast(toast.id)}
                >
                  关闭
                </button>
              </div>
              <details className="mt-2 text-xs text-slate-300">
                <summary className="cursor-pointer select-none text-slate-200">查看详情</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/25 p-2">
                  {toast.details}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


