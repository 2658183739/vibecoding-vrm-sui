import { useState } from "react";
import { ConnectButton, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Button, Card } from "@heroui/react";
import { appConfig } from "../config";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
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
    hints.push(
      "Current wallet may not be the configured revenue recipient, or claim permission is missing."
    );
  }
  if (/no rewards|nothing to claim|empty|insufficient|zero/i.test(normalized)) {
    hints.push("There may be no claimable revenue yet for this stable coin.");
  }
  if (/stable|coin type|type argument|type mismatch/i.test(normalized)) {
    hints.push(
      "Stable coin type configuration may be incorrect (`VITE_STABLE_LAYER_STABLE_COIN_TYPE`)."
    );
  }
  if (/rpc|network|timeout|fetch|503|502|500/i.test(normalized)) {
    hints.push("RPC endpoint may be unstable or temporarily unavailable.");
  }
  if (hints.length === 0) {
    hints.push("Check wallet permission and ensure this account is eligible to claim.");
    hints.push("Verify stable-layer config and network settings in `.env`.");
  }

  return hints;
}

export default function MerchantClaimPage() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);
  const [failureHints, setFailureHints] = useState<string[]>([]);

  async function onClaim(): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first.");
      setFailureHints([]);
      return;
    }

    setTxLoading(true);
    setTxError(null);
    setTxResult(null);
    setFailureHints([]);

    try {
      const tx = await buildClaimTx(account.address);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const feedback = await normalizeTxFeedback(result);

      setTxResult(feedback);

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Merchant Claim</h1>
            <p className="text-sm text-slate-300">
              Claim stable-layer revenue to your connected wallet.
            </p>
            <p className="text-xs text-slate-400">
              Stable coin type: {appConfig.stableLayer.stableCoinType || "MISSING"}
            </p>
          </div>
          <ConnectButton />
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="space-y-4">
          <Button variant="primary" isDisabled={!account || txLoading} onPress={onClaim}>
            Claim Revenue
          </Button>
          <TxFeedbackCard label="Claim TX" loading={txLoading} error={txError} result={txResult} />
        </Card.Content>
      </Card>

      {txError && failureHints.length > 0 && (
        <Card variant="secondary">
          <Card.Content className="space-y-2 text-sm text-amber-200">
            <p className="font-semibold">Possible reasons</p>
            <ul className="list-disc space-y-1 pl-5">
              {failureHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
