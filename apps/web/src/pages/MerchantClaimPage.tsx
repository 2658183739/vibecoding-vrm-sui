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
    hints.push("当前钱包可能不是收益接收方，或尚未被授予领取权限。");
  }
  if (/no rewards|nothing to claim|empty|insufficient|zero/i.test(normalized)) {
    hints.push("当前稳定币暂无可领取收益。");
  }
  if (/stable|coin type|type argument|type mismatch/i.test(normalized)) {
    hints.push("稳定币类型配置可能错误（`VITE_STABLE_LAYER_STABLE_COIN_TYPE`）。");
  }
  if (/rpc|network|timeout|fetch|503|502|500/i.test(normalized)) {
    hints.push("RPC 节点可能不稳定或暂时不可用。");
  }

  if (hints.length === 0) {
    hints.push("请检查钱包权限，确认该地址具备领取资格。");
    hints.push("请核对 `.env` 中 stable-layer 与网络配置。");
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
      setTxError("请先连接钱包。");
      setFailureHints([]);
      return;
    }
    if (claimConfigError) {
      setTxError(`配置不完整：${claimConfigError}`);
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
        const message = feedback.errorMessage || "领取交易执行失败。";
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">商户收益领取</h1>
            <p className="text-sm text-slate-300">
              触发 stable-layer 领取逻辑，将可领取收益发送到当前钱包。
            </p>
            <p className="text-xs text-slate-400">
              稳定币类型：{appConfig.stableLayer.stableCoinType || "未配置"}
            </p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      {claimConfigError && !smokeMode && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">
            领取功能不可用：{claimConfigError}
          </Card.Content>
        </Card>
      )}

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <Button
            data-testid="claim-submit-btn"
            variant="primary"
            isDisabled={!account || txLoading || !!claimConfigError}
            onPress={onClaim}
          >
            领取收益
          </Button>
          <TxFeedbackCard label="领取交易" loading={txLoading} error={txError} result={txResult} />
        </Card.Content>
      </Card>

      {txError && failureHints.length > 0 && (
        <Card variant="secondary" className="panel-card border-amber-400/30">
          <Card.Content className="space-y-2 text-sm text-amber-200">
            <p className="font-semibold">可能原因</p>
            <ul className="list-disc space-y-1 pl-5">
              {failureHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}

      <RecentTxHistoryCard title="本地最近交易（演示用）" refreshKey={historyRefreshKey} />
    </div>
  );
}

