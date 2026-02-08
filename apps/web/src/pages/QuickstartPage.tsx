import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { RealChainHealthCard } from "../components/RealChainHealthCard";
import { loadQuickstartProgress } from "../lib/demoProgress";
import { isSmokeMode, setSmokeMode } from "../lib/smokeMode";
import { resetSmokeStore } from "../lib/smokeState";
import { clearRecentTxHistory } from "../lib/txHistory";
import { ConnectWalletButton, useWalletAccount } from "../lib/wallet";

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function QuickstartPage() {
  const navigate = useNavigate();
  const account = useWalletAccount();

  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [smokeEnabled, setSmokeEnabledState] = useState(isSmokeMode());
  const [progress, setProgress] = useState(() => loadQuickstartProgress());

  useEffect(() => {
    const onFocus = () => setRefreshKey((prev) => prev + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    setProgress(loadQuickstartProgress());
    setSmokeEnabledState(isSmokeMode());
  }, [refreshKey]);

  const demoLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}?smoke=1#/quickstart`;

  async function onCopyDemoLink(): Promise<void> {
    if (!demoLink) return;
    const ok = await copyText(demoLink);
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  function onToggleSmokeMode(next: boolean): void {
    setSmokeMode(next);
    setSmokeEnabledState(next);
    setRefreshKey((prev) => prev + 1);
  }

  function onResetDemoState(): void {
    clearRecentTxHistory();
    resetSmokeStore();
    setRefreshKey((prev) => prev + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-slate-100">Stable Layer Quick Demo+</h1>
              <p className="max-w-3xl text-sm text-slate-300">Step-by-step closed loop: Create Invoice, USDC One-Click Pay, T+1 Redemption, Claim Rewards.</p>
              <p className="break-all text-xs text-slate-400">Current Wallet: {account?.address || "-"}</p>
            </div>
            <ConnectWalletButton />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card variant="secondary" className="border border-emerald-400/30 bg-emerald-500/10">
              <Card.Content className="space-y-1">
                <p className="text-xs text-emerald-200">Progress</p>
                <p className="text-3xl font-semibold text-emerald-100">{progress.percentage}%</p>
                <p className="text-xs text-emerald-200">
                  {progress.completed}/{progress.total} Steps Completed
                </p>
              </Card.Content>
            </Card>
            <Card variant="secondary" className="panel-card">
              <Card.Content className="space-y-1">
                <p className="text-xs text-slate-400">Recent Tx Count</p>
                <p className="text-3xl font-semibold text-slate-100">{progress.entries.length}</p>
                <p className="text-xs text-slate-400">From Local Demo History</p>
              </Card.Content>
            </Card>
            <Card variant="secondary" className="panel-card">
              <Card.Content className="space-y-2">
                <p className="text-xs text-slate-400">Demo Mode</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={smokeEnabled ? "primary" : "secondary"}
                    onPress={() => onToggleSmokeMode(true)}
                  >
                    Demo Mode ON
                  </Button>
                  <Button
                    variant={!smokeEnabled ? "primary" : "secondary"}
                    onPress={() => onToggleSmokeMode(false)}
                  >
                    Demo Mode OFF
                  </Button>
                </div>
              </Card.Content>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onPress={onCopyDemoLink}>
              {copied ? "Link Copied" : "Copy Demo Link"}
            </Button>
            <Button variant="secondary" onPress={onResetDemoState}>
              Reset Demo
            </Button>
            <Button variant="primary" onPress={() => setRefreshKey((prev) => prev + 1)}>
              Refresh Progress
            </Button>
          </div>
        </Card.Content>
      </Card>

      <RealChainHealthCard />

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-lg font-semibold text-slate-100">Complete Core Loop in 4 Steps</p>
          <div className="grid gap-3 md:grid-cols-2">
            {progress.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-xl border px-4 py-3 ${step.completed
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/15 bg-white/[0.02]"
                  }`}
              >
                <p className="text-sm font-semibold text-slate-100">
                  {step.completed ? "Completed · " : "Pending · "}
                  {step.title}
                </p>
                <p className="mt-1 text-xs text-slate-300">{step.description}</p>
                <Button className="mt-3" variant="secondary" onPress={() => navigate(step.actionPath)}>
                  Execute
                </Button>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p className="text-lg font-semibold text-slate-100">Why it's better than a simple quickstart</p>
          <p>1. Not just Mint/Redeem/Claim, but covers Merchant Collection loop (Product, Invoice, Receipt).</p>
          <p>2. Provides on-chain proof (Checkpoint, Gas, Event Count, Created Objects) after payment for instant verification.</p>
          <p>3. Metrics page includes Payment Rate, Paid GMV, Pending GMV, directly reflecting growth potential.</p>
          <p>4. Agent converts natural language into transactions, lowering the barrier for new users.</p>
        </Card.Content>
      </Card>
    </div>
  );
}
