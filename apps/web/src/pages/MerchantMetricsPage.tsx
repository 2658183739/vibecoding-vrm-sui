import { useCallback, useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Button, Card } from "@heroui/react";
import { appConfig } from "../config";
import { fetchStableLayerSupplyMetrics, type StableLayerSupplyMetrics } from "../lib/stablelayer";
import { parseErrorMessage } from "../lib/sui";

function formatMetricsError(error: unknown): string {
  const message = parseErrorMessage(error);
  if (/rpc|network|timeout|fetch|503|502|500/i.test(message)) {
    return `RPC error: ${message}`;
  }
  return message;
}

export default function MerchantMetricsPage() {
  const account = useCurrentAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StableLayerSupplyMetrics | null>(null);

  const refreshMetrics = useCallback(async () => {
    if (!account) {
      setError("Please connect wallet first.");
      setMetrics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchStableLayerSupplyMetrics(account.address);
      setMetrics(data);
    } catch (nextError) {
      setMetrics(null);
      setError(formatMetricsError(nextError));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) {
      setMetrics(null);
      setError(null);
      return;
    }

    refreshMetrics().catch((nextError) => setError(formatMetricsError(nextError)));
  }, [account, refreshMetrics]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Merchant Metrics</h1>
            <p className="text-sm text-slate-300">
              Stable-layer supply overview for dashboard monitoring.
            </p>
          </div>
          <ConnectButton />
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="flex items-center justify-between">
          <p className="text-sm text-slate-300">Network: {appConfig.stableLayer.network}</p>
          <Button
            variant="primary"
            isDisabled={!account || loading}
            onPress={() => refreshMetrics()}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </Card.Content>
      </Card>

      {error && (
        <Card variant="secondary">
          <Card.Content className="text-sm text-red-300">{error}</Card.Content>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card variant="secondary">
          <Card.Content className="space-y-2">
            <p className="text-sm text-slate-400">Total Supply (all stable coins)</p>
            <p className="break-all text-xl font-semibold text-slate-100">
              {metrics?.totalSupply ?? "-"}
            </p>
          </Card.Content>
        </Card>

        <Card variant="secondary">
          <Card.Content className="space-y-2">
            <p className="text-sm text-slate-400">Total Supply by Coin Type</p>
            <p className="break-all text-xs text-slate-500">
              {metrics?.coinType ?? appConfig.stableLayer.stableCoinType ?? "-"}
            </p>
            <p className="break-all text-xl font-semibold text-slate-100">
              {metrics?.totalSupplyByType ?? "-"}
            </p>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
