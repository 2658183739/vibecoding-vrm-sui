import { useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import { appConfig, assertRequiredConfigForStableLayerCore } from "../config";
import { RecentTxHistoryCard } from "../components/RecentTxHistoryCard";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import { isSmokeMode } from "../lib/smokeMode";
import { smokeClaim } from "../lib/smokeState";
import { recordRecentTxHistory } from "../lib/txHistory";
import { ConnectWalletButton, useWalletAccount, useWalletDAppKit } from "../lib/wallet";
import { buildClaimTx } from "../lib/stablelayer";
import { normalizeTxFeedback, parseErrorMessage, type TxFeedback } from "../lib/sui";

function inferClaimHints(message: string): string[] {
  const normalized = message.toLowerCase();
  const hints: string[] = [];

  if (
    /permission|not authorized|not owner|not allowed|forbidden|unauthorized|sender/i.test(
      normalized
    )
  ) {
    hints.push("Current wallet may not be the recipient, or has not been granted claim permission.");
  }
  if (/no rewards|nothing to claim|empty|insufficient|zero/i.test(normalized)) {
    hints.push("No rewards available for the current stablecoin.");
  }
  if (/stable|coin type|type argument|type mismatch/i.test(normalized)) {
    hints.push("Stablecoin type config may be incorrect (`VITE_STABLE_LAYER_STABLE_COIN_TYPE`).");
  }
  if (/rpc|network|timeout|fetch|503|502|500/i.test(normalized)) {
    hints.push("RPC node may be unstable or temporarily unavailable.");
  }

  if (hints.length === 0) {
    hints.push("Please check wallet permissions to confirm eligibility.");
    hints.push("Please verify `.env` stable-layer and network config.");
  }

  return hints;
}

export default function MerchantClaimPage() {
  const account = useWalletAccount();
  const dAppKit = useWalletDAppKit();
  const smokeMode = isSmokeMode();
  const claimConfigError = useMemo(() => {
    if (smokeMode) return null;
    try {
      assertRequiredConfigForStableLayerCore();
      return null;
    } catch (error) {
      return parseErrorMessage(error);
    }
  }, [smokeMode]);

  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);
  const [failureHints, setFailureHints] = useState<string[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  async function onClaim(): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first.");
      setFailureHints([]);
      return;
    }
    if (claimConfigError) {
      setTxError(`Config incomplete: ${claimConfigError}`);
      setFailureHints([]);
      return;
    }

    setTxLoading(true);
    setTxError(null);
    setTxResult(null);
    setFailureHints([]);

    try {
      if (smokeMode) {
        const smoke = smokeClaim(account.address);
        setTxResult({
          digest: smoke.digest,
          status: smoke.status,
          explorerUrl: smoke.explorerUrl,
          errorMessage: smoke.errorMessage,
          receiptObjectId: smoke.receiptObjectId
        });

        if (smoke.errorMessage) {
          setTxError(smoke.errorMessage);
          setFailureHints(inferClaimHints(smoke.errorMessage));
        }

        setHistoryRefreshKey((prev) => prev + 1);
        return;
      }

      const tx = await buildClaimTx(account.address);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const feedback = await normalizeTxFeedback(result);

      setTxResult(feedback);
      recordRecentTxHistory({
        scene: "merchant.claim",
        digest: feedback.digest,
        status: feedback.status,
        explorerUrl: feedback.explorerUrl,
        errorMessage: feedback.errorMessage,
        receiptObjectId: feedback.receiptObjectId
      });
      setHistoryRefreshKey((prev) => prev + 1);

      if (feedback.status === "failure") {
        const message = feedback.errorMessage || "Claim transaction failed.";
        setTxError(message);
        setFailureHints(inferClaimHints(message));
      }
    } catch (error) {
      const message = parseErrorMessage(error);
      setTxError(message);
      setFailureHints(inferClaimHints(message));
    } finally {
      setTxLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <span className="text-2xl">💰</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 text-glow">
              Merchant Claim
            </h1>
            <p className="text-slate-400 text-sm">Withdraw your earnings from the protocol.</p>
          </div>
        </div>
        <ConnectWalletButton />
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 gap-8 relative z-10">
        {/* Left Panel: Action */}
        <div className="space-y-6">
          <div className="panel-card p-6 border-t-4 border-t-emerald-500">
            <h2 className="text-lg font-bold text-white mb-4">Claimable Balance</h2>

            <div className="bg-emerald-900/10 rounded-xl p-6 border border-emerald-500/20 mb-6 text-center">
              <p className="text-slate-400 text-sm uppercase tracking-widest mb-2">Stablecoin Type</p>
              <p className="font-mono text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded inline-block mb-4">
                {appConfig.stableLayer.stableCoinType || "Not Configured"}
              </p>

              <div className="py-4">
                <span className="text-5xl font-bold text-white">---</span>
                <span className="text-xl text-slate-500 ml-2">USDC</span>
              </div>
              <p className="text-xs text-slate-500 italic">Balance fetching not yet implemented in demo UI</p>
            </div>

            <Button
              className="w-full h-12 text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-900/20"
              isDisabled={!account || txLoading || !!claimConfigError}
              onPress={onClaim}
            >
              {txLoading ? "Processing..." : "Claim Rewards Now"}
            </Button>

            {claimConfigError && !smokeMode && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-300">
                ⚠️ Config Error: {claimConfigError}
              </div>
            )}
          </div>

          <TxFeedbackCard label="Claim Transaction" loading={txLoading} error={txError} result={txResult} />
        </div>

        {/* Right Panel: Hints & History */}
        <div className="space-y-6">
          {txError && failureHints.length > 0 && (
            <div className="panel-card p-6 border-red-500/30 bg-red-900/5 animate-fade-in">
              <h3 className="text-red-400 font-bold mb-3 flex items-center gap-2">
                <span>⚠️</span> Troubleshooting
              </h3>
              <ul className="space-y-2">
                {failureHints.map((hint, i) => (
                  <li key={i} className="flex gap-2 text-sm text-red-200/80">
                    <span className="text-red-500">•</span>
                    {hint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel-card p-6 min-h-[300px]">
            <h3 className="text-lg font-bold text-white mb-4">Recent Claims</h3>
            <RecentTxHistoryCard title="" refreshKey={historyRefreshKey} />
          </div>
        </div>
      </div>

      {/* Background Decor */}
      <div className="fixed top-[20%] right-[10%] w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-3xl pointer-events-none -z-10" />
    </div>
  );
}

