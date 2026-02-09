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
    return `RPC Request Exception: ${message}`;
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
      setBalanceError("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE config.");
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
      setTxError("Please connect wallet first.");
      return;
    }

    if (!stableCoinType) {
      setTxError("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE config.");
      return;
    }
    if (burnConfigError) {
      setTxError(`Config incomplete: ${burnConfigError}`);
      return;
    }

    if (mode === "amount") {
      if (!parsedAmount) {
        setTxError("Please enter valid amount (u64 positive integer).");
        return;
      }
      if (parsedAmount > balance) {
        setTxError(`Insufficient BrandUSD: Need ${parsedAmount.toString()}, Current ${balance.toString()}`);
        return;
      }
    }

    if (mode === "all" && balance <= 0n) {
      setTxError("BrandUSD balance is 0, nothing to redeem.");
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
    ? `Estimated Burn: ${parsedAmount.toString()} ${stableCoinType} (Settled T+1)`
    : "Enter amount to see preview.";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <span className="text-2xl">🔥</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 text-glow">
              Redeem BrandUSD
            </h1>
            <p className="text-slate-400 text-sm">Burn your stablecoins to redeem underlying assets.</p>
          </div>
        </div>
        <ConnectWalletButton />
      </div>

      <RedemptionModeBanner />

      <div className="grid md:grid-cols-2 gap-8 relative z-10">
        {/* Left: Burn Form */}
        <div className="space-y-6">
          <div className="panel-card p-6 border-t-4 border-t-amber-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white">Burn Request</h2>
              <div className="text-right">
                <p className="text-xs text-slate-400">Available Balance</p>
                <p className="font-mono text-amber-400 font-bold">
                  {balanceLoading ? "..." : balance.toString()} <span className="text-xs text-slate-500">BrandUSD</span>
                </p>
              </div>
            </div>

            <div className="bg-black/20 rounded-xl p-4 mb-6 border border-white/5">
              {/* @ts-ignore */}
              <Input
                label="Amount to Burn"
                placeholder="0.00"
                labelPlacement="outside"
                value={burnAmountInput}
                onChange={(e) => setBurnAmountInput(e.target.value)}
                endContent={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">BrandUSD</span>
                    <button
                      onClick={() => setBurnAmountInput(balance.toString())}
                      className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded hover:bg-amber-500/30 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                }
                classNames={{
                  input: "bg-transparent text-white font-mono text-lg",
                  inputWrapper: "bg-transparent shadow-none border-b border-white/10 hover:border-amber-500/50 focus-within:!border-amber-500 px-0 rounded-none transition-colors group-data-[focus=true]:bg-transparent"
                }}
              />
              <p className="text-xs text-slate-500 mt-2 text-right">
                {amountPreview}
              </p>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full h-12 text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/20"
                isDisabled={!account || txLoading || !parsedAmount || !!burnConfigError}
                onPress={() => submitBurn("amount")}
              >
                {txLoading ? "Processing..." : "Confirm Burn"}
              </Button>
            </div>

            {burnConfigError && !smokeMode && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-300">
                ⚠️ Config Error: {burnConfigError}
              </div>
            )}
          </div>

          {(txPreview || txResult) && (
            <div className="panel-card p-4 bg-white/5">
              <h3 className="text-sm font-bold text-slate-300 mb-2">Transaction Status</h3>
              <TxFeedbackCard label="Burn Tx" loading={txLoading} error={txError} result={txResult} />
            </div>
          )}
        </div>

        {/* Right: Info & History */}
        <div className="space-y-6">
          <div className="panel-card p-6 bg-gradient-to-br from-slate-900 to-slate-900/50">
            <h3 className="text-slate-100 font-bold mb-4 flex items-center gap-2">
              <span>ℹ️</span> Redemption Rules
            </h3>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                Settlement Cycle: <span className="text-white">T+1 Days</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                Minimum Amount: <span className="text-white">100 BrandUSD</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                Fee: <span className="text-white">0.05%</span> (Waived for MVP)
              </li>
            </ul>
          </div>

          <div className="panel-card p-6 min-h-[300px]">
            <h3 className="text-lg font-bold text-white mb-4">Redemption History</h3>
            <RecentTxHistoryCard title="" refreshKey={historyRefreshKey} />
          </div>
        </div>
      </div>

      {/* Background Decor */}
      <div className="fixed bottom-[20%] left-[10%] w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-3xl pointer-events-none -z-10" />
    </div>
  );
}
