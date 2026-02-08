import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import { appConfig } from "../config";
import { isSmokeMode } from "../lib/smokeMode";
import { fetchCoinBalance, getSuiClient, parseErrorMessage } from "../lib/sui";
import { useWalletAccount } from "../lib/wallet";

interface HealthState {
  checkpoint: string;
  payCoinBalance: string;
  usdcBalance: string;
  stableBalance: string;
  error: string | null;
}

function requiredConfigIssues(): string[] {
  const issues: string[] = [];
  if (appConfig.contract.packageId === "0x0") issues.push("Missing VITE_PACKAGE_ID");
  if (!appConfig.objectIds.merchantId) issues.push("Missing VITE_MERCHANT_ID");
  if (!appConfig.stableLayer.stableCoinType) issues.push("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE");
  if (!appConfig.stableLayer.usdcType) issues.push("Missing VITE_STABLE_LAYER_USDC_TYPE");
  if (!appConfig.stableLayer.brandUsdType) issues.push("Missing VITE_STABLE_LAYER_BRAND_USD_TYPE");
  return issues;
}

export function RealChainHealthCard() {
  const account = useWalletAccount();
  const smokeMode = isSmokeMode();
  const configIssues = useMemo(() => requiredConfigIssues(), []);

  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<HealthState>({
    checkpoint: "-",
    payCoinBalance: "-",
    usdcBalance: "-",
    stableBalance: "-",
    error: null
  });

  const refresh = useCallback(async () => {
    if (smokeMode) {
      setState({
        checkpoint: "Demo Mode",
        payCoinBalance: "Simulated",
        usdcBalance: "Simulated",
        stableBalance: "Simulated",
        error: null
      });
      return;
    }

    setLoading(true);
    try {
      const checkpoint = await getSuiClient().getLatestCheckpointSequenceNumber();
      if (!account?.address) {
        setState({
          checkpoint,
          payCoinBalance: "-",
          usdcBalance: "-",
          stableBalance: "-",
          error: null
        });
        return;
      }

      const [payCoinBalance, usdcBalance, stableBalance] = await Promise.all([
        fetchCoinBalance(account.address, appConfig.contract.payCoinType)
          .then((v) => v.toString())
          .catch(() => "-"),
        appConfig.stableLayer.usdcType
          ? fetchCoinBalance(account.address, appConfig.stableLayer.usdcType)
            .then((v) => v.toString())
            .catch(() => "-")
          : Promise.resolve("-"),
        appConfig.stableLayer.stableCoinType
          ? fetchCoinBalance(account.address, appConfig.stableLayer.stableCoinType)
            .then((v) => v.toString())
            .catch(() => "-")
          : Promise.resolve("-")
      ]);

      setState({
        checkpoint,
        payCoinBalance,
        usdcBalance,
        stableBalance,
        error: null
      });
    } catch (error) {
      setState((prev) => ({ ...prev, error: parseErrorMessage(error) }));
    } finally {
      setLoading(false);
    }
  }, [account?.address, smokeMode]);

  useEffect(() => {
    refresh().catch((error) =>
      setState((prev) => ({ ...prev, error: parseErrorMessage(error) }))
    );
  }, [refresh]);

  return (
    <Card variant="secondary" className="panel-card">
      <Card.Content className="space-y-3 text-sm text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-100">Chain Health</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${smokeMode
                ? "border border-amber-300/40 bg-amber-500/20 text-amber-100"
                : "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
              }`}
          >
            {smokeMode ? "Demo Mode (Simulated)" : "Real Chain Mode"}
          </span>
        </div>

        <p className="break-all text-xs text-slate-400">Network: {appConfig.network}</p>
        <p className="break-all text-xs text-slate-400">RPC：{appConfig.rpcUrl}</p>
        <p className="break-all text-xs text-slate-400">Package：{appConfig.contract.packageId}</p>
        <p className="break-all text-xs text-slate-400">
          Merchant: {appConfig.objectIds.merchantId || "Not Configured"}
        </p>
        <p className="break-all text-xs text-slate-400">Latest Checkpoint: {state.checkpoint}</p>
        <p className="break-all text-xs text-slate-400">
          Pay Coin Balance ({appConfig.contract.payCoinType}): {state.payCoinBalance}
        </p>
        <p className="break-all text-xs text-slate-400">
          USDC Balance ({appConfig.stableLayer.usdcType || "Not Configured"}): {state.usdcBalance}
        </p>
        <p className="break-all text-xs text-slate-400">
          BrandUSD Balance ({appConfig.stableLayer.stableCoinType || "Not Configured"}): {state.stableBalance}
        </p>

        {configIssues.length > 0 && !smokeMode && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Config Gaps: {configIssues.join(", ")}
          </div>
        )}
        {state.error && !smokeMode && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            RPC Check Failed: {state.error}
          </div>
        )}
        <Button variant="secondary" isDisabled={loading} onPress={() => refresh()}>
          {loading ? "Refreshing..." : "Refresh Status"}
        </Button>
      </Card.Content>
    </Card>
  );
}
