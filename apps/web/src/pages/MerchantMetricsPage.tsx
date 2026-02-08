import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import { appConfig, toExplorerTxUrl } from "../config";
import { isSmokeMode } from "../lib/smokeMode";
import {
  smokeBusinessMetrics,
  smokeCheckoutEvents,
  smokeSupplyMetrics,
  type SmokeCheckoutEvent
} from "../lib/smokeState";
import { fetchStableLayerSupplyMetrics, type StableLayerSupplyMetrics } from "../lib/stablelayer";
import {
  fetchLatestCheckoutEvents,
  fetchMerchantBusinessMetrics,
  parseErrorMessage,
  type CheckoutEventItem,
  type MerchantBusinessMetrics
} from "../lib/sui";
import { ConnectWalletButton, useWalletAccount } from "../lib/wallet";

function formatMetricsError(error: unknown): string {
  const message = parseErrorMessage(error);
  if (/rpc|network|timeout|fetch|503|502|500/i.test(message)) {
    return `RPC Request Exception: ${message}`;
  }
  return message;
}

function formatTimestamp(timestampMs?: number): string {
  if (!timestampMs) return "-";
  const date = new Date(timestampMs);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

function toEventItemsFromSmoke(items: SmokeCheckoutEvent[]): CheckoutEventItem[] {
  return items.map((item) => ({
    id: item.id,
    txDigest: item.txDigest,
    eventType: item.eventName,
    eventName: item.eventName,
    sender: item.sender,
    timestampMs: item.timestampMs
  }));
}

export default function MerchantMetricsPage() {
  const account = useWalletAccount();
  const accountAddress = account?.address ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplyMetrics, setSupplyMetrics] = useState<StableLayerSupplyMetrics | null>(null);
  const [businessMetrics, setBusinessMetrics] = useState<MerchantBusinessMetrics | null>(null);
  const [events, setEvents] = useState<CheckoutEventItem[]>([]);

  const eventRows = useMemo(() => events.slice(0, 8), [events]);

  const refreshMetrics = useCallback(async () => {
    if (!accountAddress) {
      setError("Please connect wallet first.");
      setSupplyMetrics(null);
      setBusinessMetrics(null);
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isSmokeMode()) {
        const coinType = appConfig.stableLayer.stableCoinType || "0xsmoke::brand_usd::BRAND_USD";
        const supply = smokeSupplyMetrics(coinType);
        const business = smokeBusinessMetrics(accountAddress);
        const smokeEvents = toEventItemsFromSmoke(smokeCheckoutEvents(accountAddress, 20));

        setSupplyMetrics({
          totalSupply: supply.totalSupply,
          totalSupplyByType: supply.totalSupplyByType,
          coinType
        });
        setBusinessMetrics(business);
        setEvents(smokeEvents);
        return;
      }

      const [supply, business, chainEvents] = await Promise.all([
        fetchStableLayerSupplyMetrics(accountAddress),
        fetchMerchantBusinessMetrics(accountAddress),
        fetchLatestCheckoutEvents(20)
      ]);

      setSupplyMetrics(supply);
      setBusinessMetrics(business);
      setEvents(chainEvents);
    } catch (nextError) {
      setSupplyMetrics(null);
      setBusinessMetrics(null);
      setEvents([]);
      setError(formatMetricsError(nextError));
    } finally {
      setLoading(false);
    }
  }, [accountAddress]);

  useEffect(() => {
    if (!accountAddress) {
      setSupplyMetrics(null);
      setBusinessMetrics(null);
      setEvents([]);
      setError(null);
      return;
    }

    refreshMetrics().catch((nextError) => setError(formatMetricsError(nextError)));
  }, [accountAddress, refreshMetrics]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Merchant Metrics</h1>
            <p className="text-sm text-slate-300">
              Show Stablecoin Supply, Business Metrics, and On-chain Events for quick verification.
            </p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="flex items-center justify-between">
          <p className="text-sm text-slate-300">Network: {appConfig.stableLayer.network}</p>
          <Button
            data-testid="metrics-refresh-btn"
            variant="primary"
            isDisabled={!account || loading}
            onPress={() => refreshMetrics()}
          >
            {loading ? "Refreshing..." : "Refresh Data"}
          </Button>
        </Card.Content>
      </Card>

      {error && (
        <Card variant="secondary" className="panel-card border-red-400/40">
          <Card.Content className="text-sm text-red-300">{error}</Card.Content>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-sm text-slate-400">Payment Rate</p>
            <p className="text-2xl font-semibold text-emerald-300">
              {businessMetrics ? formatRate(businessMetrics.paymentRatePercent) : "-"}
            </p>
          </Card.Content>
        </Card>
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-sm text-slate-400">Paid GMV (u64)</p>
            <p className="break-all text-xl font-semibold text-slate-100">
              {businessMetrics?.paidGmvU64.toString() ?? "-"}
            </p>
          </Card.Content>
        </Card>
        <Card variant="secondary" className="panel-card">
          <Card.Content>
            <p className="text-sm text-slate-400">Pending GMV (u64)</p>
            <p className="break-all text-xl font-semibold text-amber-300">
              {businessMetrics?.pendingGmvU64.toString() ?? "-"}
            </p>
          </Card.Content>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-2">
            <p className="text-sm text-slate-400">Total Supply (All Stablecoins)</p>
            <p className="break-all text-xl font-semibold text-slate-100">
              {supplyMetrics?.totalSupply ?? "-"}
            </p>
          </Card.Content>
        </Card>

        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-2">
            <p className="text-sm text-slate-400">Supply by Type</p>
            <p className="break-all text-xs text-slate-500">
              {supplyMetrics?.coinType ?? appConfig.stableLayer.stableCoinType ?? "-"}
            </p>
            <p className="break-all text-xl font-semibold text-slate-100">
              {supplyMetrics?.totalSupplyByType ?? "-"}
            </p>
          </Card.Content>
        </Card>
      </div>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3 text-sm text-slate-200">
          <p className="font-semibold text-slate-100">Recent On-chain Events (Checkout)</p>
          {eventRows.length === 0 && <p className="text-slate-400">No events.</p>}
          {eventRows.map((eventItem) => (
            <div
              key={eventItem.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <p className="text-xs text-slate-400">{formatTimestamp(eventItem.timestampMs)}</p>
              <p className="text-sm text-slate-100">
                {eventItem.eventName} · {eventItem.txDigest.slice(0, 10)}...
              </p>
              <p className="break-all text-xs text-slate-400">Sender: {eventItem.sender || "-"}</p>
              <a
                href={toExplorerTxUrl(eventItem.txDigest)}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline"
              >
                Verify in Explorer
              </a>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
