import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input } from "@heroui/react";
import { appConfig, assertRequiredConfigForStableLayerBurn } from "../config";
import { RecentTxHistoryCard } from "../components/RecentTxHistoryCard";
import { RedemptionModeBanner } from "../components/RedemptionModeBanner";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import { isSmokeMode } from "../lib/smokeMode";
import { smokeBurn, smokeGetBalance } from "../lib/smokeState";
import { recordRecentTxHistory } from "../lib/txHistory";
import { ConnectWalletButton, useWalletAccount, useWalletDAppKit } from "../lib/wallet";
import {
  fetchCoinBalance,
  normalizeTxFeedback,
  parseErrorMessage,
  type TxFeedback
} from "../lib/sui";
import { buildBurnTx, type BurnTxPreview } from "../lib/tx/buildBurnTx";

const SMOKE_STABLE_COIN_TYPE = "0xsmoke::brandusd::BRAND_USD";

function formatRpcAwareError(error: unknown): string {
  const message = parseErrorMessage(error);
  if (/rpc|fetch|network|timeout|503|502|500/i.test(message)) {
    return `RPC 请求异常：${message}`;
  }
  return message;
}

function parsePositiveAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;

  try {
    const value = BigInt(trimmed);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

export default function RedeemPage() {
  const account = useWalletAccount();
  const dAppKit = useWalletDAppKit();
  const smokeMode = isSmokeMode();
  const stableCoinType =
    appConfig.stableLayer.stableCoinType || (smokeMode ? SMOKE_STABLE_COIN_TYPE : "");
  const burnConfigError = useMemo(() => {
    if (smokeMode) return null;
    try {
      assertRequiredConfigForStableLayerBurn();
      return null;
    } catch (error) {
      return parseErrorMessage(error);
    }
  }, [smokeMode]);

  const [balance, setBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [burnAmountInput, setBurnAmountInput] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);
  const [txPreview, setTxPreview] = useState<BurnTxPreview | null>(null);

  const parsedAmount = useMemo(() => parsePositiveAmount(burnAmountInput), [burnAmountInput]);

  const bumpHistoryRefresh = useCallback(() => {
    setHistoryRefreshKey((prev) => prev + 1);
  }, []);

  const loadBalance = useCallback(async () => {
    if (!account?.address) {
      setBalance(0n);
      setBalanceError(null);
      return;
    }

    if (!stableCoinType) {
      setBalance(0n);
      setBalanceError("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);

    try {
      if (smokeMode) {
        setBalance(smokeGetBalance(account.address, stableCoinType));
        return;
      }

      const nextBalance = await fetchCoinBalance(account.address, stableCoinType);
      setBalance(nextBalance);
    } catch (error) {
      setBalance(0n);
      setBalanceError(formatRpcAwareError(error));
    } finally {
      setBalanceLoading(false);
    }
  }, [account?.address, smokeMode, stableCoinType]);

  useEffect(() => {
    loadBalance().catch((error) => setBalanceError(formatRpcAwareError(error)));
  }, [loadBalance]);

  async function submitBurn(mode: "amount" | "all"): Promise<void> {
    if (!account) {
      setTxError("请先连接钱包。");
      return;
    }

    if (!stableCoinType) {
      setTxError("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
      return;
    }
    if (burnConfigError) {
      setTxError(`配置不完整：${burnConfigError}`);
      return;
    }

    if (mode === "amount") {
      if (!parsedAmount) {
        setTxError("请输入合法赎回数量（u64 正整数）。");
        return;
      }
      if (parsedAmount > balance) {
        setTxError(`BrandUSD 余额不足：需要 ${parsedAmount.toString()}，当前 ${balance.toString()}`);
        return;
      }
    }

    if (mode === "all" && balance <= 0n) {
      setTxError("BrandUSD 余额为 0，暂无可赎回资产。");
      return;
    }

    setTxLoading(true);
    setTxError(null);
    setTxResult(null);

    try {
      if (smokeMode) {
        const smoke = smokeBurn({
          owner: account.address,
          coinType: stableCoinType,
          mode,
          amountU64: mode === "amount" ? parsedAmount ?? undefined : undefined
        });

        setTxPreview({
          mode,
          burnAmount: mode === "amount" ? parsedAmount ?? undefined : undefined
        });

        setTxResult({
          digest: smoke.digest,
          status: smoke.status,
          explorerUrl: smoke.explorerUrl,
          errorMessage: smoke.errorMessage,
          receiptObjectId: smoke.receiptObjectId
        });

        if (smoke.errorMessage) {
          setTxError(smoke.errorMessage);
        }

        bumpHistoryRefresh();
        await loadBalance();
        return;
      }

      const built = await buildBurnTx({
        owner: account.address,
        mode,
        amountU64: mode === "amount" ? parsedAmount ?? undefined : undefined
      });

      setTxPreview(built.preview);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: built.tx });
      const normalized = await normalizeTxFeedback(result);
      setTxResult(normalized);

      recordRecentTxHistory({
        scene: mode === "all" ? "redeem.burn_all" : "redeem.burn_amount",
        digest: normalized.digest,
        status: normalized.status,
        explorerUrl: normalized.explorerUrl,
        errorMessage: normalized.errorMessage,
        receiptObjectId: normalized.receiptObjectId
      });

      bumpHistoryRefresh();
      await loadBalance();
    } catch (error) {
      setTxError(formatRpcAwareError(error));
    } finally {
      setTxLoading(false);
    }
  }

  const amountPreview = parsedAmount
    ? `预计赎回 ${parsedAmount.toString()} ${stableCoinType}（按 T+1 结算）`
    : "请输入数量以查看赎回预览。";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">BrandUSD 赎回</h1>
            <p className="text-sm text-slate-300">
              通过 stable-layer-sdk 发起 Burn，将 BrandUSD 按规则赎回。
            </p>
            <p className="text-xs text-slate-400">稳定币类型：{stableCoinType || "未配置"}</p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      <RedemptionModeBanner />

      {burnConfigError && !smokeMode && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">
            赎回功能不可用：{burnConfigError}
          </Card.Content>
        </Card>
      )}

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p className="break-all">钱包地址：{account?.address || "-"}</p>
          <p>BrandUSD 余额：{balance.toString()}</p>
          {balanceLoading && <p className="text-amber-300">正在刷新余额...</p>}
          {balanceError && <p className="text-red-300">{balanceError}</p>}
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <h2 className="text-base font-semibold text-slate-100">赎回操作</h2>
          <Input
            aria-label="赎回数量"
            inputMode="numeric"
            placeholder="请输入赎回数量（u64）"
            value={burnAmountInput}
            onChange={(event) => setBurnAmountInput(event.currentTarget.value)}
            variant="secondary"
          />
          <p className="text-xs text-slate-400">{amountPreview}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="redeem-burn-amount-btn"
              variant="primary"
              isDisabled={!account || txLoading || !parsedAmount || !!burnConfigError}
              onPress={() => submitBurn("amount")}
            >
              按数量赎回
            </Button>
            <Button
              data-testid="redeem-burn-all-btn"
              variant="secondary"
              isDisabled={!account || txLoading || balance <= 0n || !!burnConfigError}
              onPress={() => submitBurn("all")}
            >
              一键全部赎回
            </Button>
          </div>
        </Card.Content>
      </Card>

      {(txPreview || txLoading || txError || txResult) && (
        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-2 text-sm text-slate-200">
            <p className="font-semibold text-slate-100">交易预览</p>
            {!txPreview && <p className="text-slate-400">暂无预览。</p>}
            {txPreview?.mode === "amount" && (
              <p>赎回模式：按数量（{txPreview.burnAmount?.toString() ?? "0"}）</p>
            )}
            {txPreview?.mode === "all" && <p>赎回模式：全部余额</p>}
            <p>结算路径：T+1（本 MVP 默认）</p>
          </Card.Content>
        </Card>
      )}

      <TxFeedbackCard label="赎回交易" loading={txLoading} error={txError} result={txResult} />

      <RecentTxHistoryCard title="本地最近交易（演示用）" refreshKey={historyRefreshKey} />
    </div>
  );
}
