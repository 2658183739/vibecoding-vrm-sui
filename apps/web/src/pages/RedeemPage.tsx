import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Button, Card, Input } from "@heroui/react";
import { appConfig } from "../config";
import { RedemptionModeBanner } from "../components/RedemptionModeBanner";
import { TxFeedbackCard } from "../components/TxFeedbackCard";
import {
  fetchCoinBalance,
  normalizeTxFeedback,
  parseErrorMessage,
  type TxFeedback
} from "../lib/sui";
import { buildBurnTx, type BurnTxPreview } from "../lib/tx/buildBurnTx";

function formatRpcAwareError(error: unknown): string {
  const message = parseErrorMessage(error);
  if (/rpc|fetch|network|timeout|503|502|500/i.test(message)) {
    return `RPC error: ${message}`;
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
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [balance, setBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [burnAmountInput, setBurnAmountInput] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxFeedback | null>(null);
  const [txPreview, setTxPreview] = useState<BurnTxPreview | null>(null);

  const parsedAmount = useMemo(() => parsePositiveAmount(burnAmountInput), [burnAmountInput]);

  const loadBalance = useCallback(async () => {
    if (!account?.address) {
      setBalance(0n);
      setBalanceError(null);
      return;
    }

    if (!appConfig.stableLayer.stableCoinType) {
      setBalance(0n);
      setBalanceError("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE in .env");
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);

    try {
      const nextBalance = await fetchCoinBalance(
        account.address,
        appConfig.stableLayer.stableCoinType
      );
      setBalance(nextBalance);
    } catch (error) {
      setBalance(0n);
      setBalanceError(formatRpcAwareError(error));
    } finally {
      setBalanceLoading(false);
    }
  }, [account?.address]);

  useEffect(() => {
    loadBalance().catch((error) => setBalanceError(formatRpcAwareError(error)));
  }, [loadBalance]);

  async function submitBurn(mode: "amount" | "all"): Promise<void> {
    if (!account) {
      setTxError("Please connect wallet first");
      return;
    }

    if (!appConfig.stableLayer.stableCoinType) {
      setTxError("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE in .env");
      return;
    }

    if (mode === "amount") {
      if (!parsedAmount) {
        setTxError("Please input a valid burn amount (u64 integer)");
        return;
      }

      if (parsedAmount > balance) {
        setTxError(
          `Insufficient BrandUSD balance: need=${parsedAmount.toString()}, have=${balance.toString()}`
        );
        return;
      }
    }

    if (mode === "all" && balance <= 0n) {
      setTxError("BrandUSD balance is 0, nothing to burn");
      return;
    }

    setTxLoading(true);
    setTxError(null);
    setTxResult(null);

    try {
      const built = await buildBurnTx({
        owner: account.address,
        mode,
        amountU64: mode === "amount" ? (parsedAmount ?? undefined) : undefined
      });

      setTxPreview(built.preview);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: built.tx });
      setTxResult(await normalizeTxFeedback(result));
      await loadBalance();
    } catch (error) {
      setTxError(formatRpcAwareError(error));
    } finally {
      setTxLoading(false);
    }
  }

  const amountPreview = parsedAmount
    ? `Will burn ${parsedAmount.toString()} ${appConfig.stableLayer.stableCoinType} via T+1 redemption`
    : "Input amount to preview burn";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Redeem BrandUSD</h1>
            <p className="text-sm text-slate-300">
              Burn BrandUSD and redeem USDC through stable-layer-sdk.
            </p>
            <p className="text-xs text-slate-400">
              Stable coin type: {appConfig.stableLayer.stableCoinType || "MISSING"}
            </p>
          </div>
          <ConnectButton />
        </Card.Content>
      </Card>

      <RedemptionModeBanner />

      <Card variant="secondary">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p>Wallet: {account?.address || "-"}</p>
          <p>BrandUSD balance: {balance.toString()}</p>
          {balanceLoading && <p className="text-amber-300">Refreshing balance...</p>}
          {balanceError && <p className="text-red-300">{balanceError}</p>}
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Burn Amount</h2>
          <Input
            aria-label="Burn amount"
            inputMode="numeric"
            placeholder="Input burn amount (u64)"
            value={burnAmountInput}
            onChange={(event) => setBurnAmountInput(event.currentTarget.value)}
            variant="secondary"
          />
          <p className="text-xs text-slate-400">{amountPreview}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              isDisabled={!account || txLoading || !parsedAmount}
              onPress={() => submitBurn("amount")}
            >
              Burn Amount
            </Button>
            <Button
              variant="secondary"
              isDisabled={!account || txLoading || balance <= 0n}
              onPress={() => submitBurn("all")}
            >
              Burn All
            </Button>
          </div>
        </Card.Content>
      </Card>

      {(txPreview || txLoading || txError || txResult) && (
        <Card variant="secondary">
          <Card.Content className="space-y-2 text-sm text-slate-200">
            <p className="font-semibold text-slate-100">Transaction Preview</p>
            {!txPreview && <p className="text-slate-400">No preview yet.</p>}
            {txPreview?.mode === "amount" && (
              <p>Burn mode: amount ({txPreview.burnAmount?.toString() ?? "0"})</p>
            )}
            {txPreview?.mode === "all" && <p>Burn mode: all balance</p>}
            <p>Settlement path: T+1 (default in this MVP)</p>
          </Card.Content>
        </Card>
      )}

      <TxFeedbackCard
        label="Redeem Burn TX"
        loading={txLoading}
        error={txError}
        result={txResult}
      />
    </div>
  );
}
