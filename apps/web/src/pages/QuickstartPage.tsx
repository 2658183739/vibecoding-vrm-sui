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
      <div className="panel-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 text-glow">
              Stable Layer Quick Demo+
            </h1>
            <p className="max-w-3xl text-slate-300">
              Experience the future of Web3 payments: Atomic Mint+Pay, One-Click Redemption, and AI-Powered Automation.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-black/20 px-3 py-1 rounded-full w-fit">
              <span>WALLET:</span>
              <span className="text-cyan-400">{account?.address || "NOT CONNECTED"}</span>
            </div>
          </div>
          <ConnectWalletButton />
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="relative group overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-900/10 p-6 transition-all hover:bg-emerald-900/20">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-6xl">📊</span>
            </div>
            <p className="text-sm font-medium text-emerald-400 uppercase tracking-wider mb-1">Current Progress</p>
            <p className="text-4xl font-bold text-emerald-100 mb-2">{progress.percentage}%</p>
            <div className="w-full h-1.5 bg-emerald-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress.percentage}%` }} />
            </div>
            <p className="text-xs text-emerald-400/70 mt-2">
              {progress.completed}/{progress.total} Steps Completed
            </p>
          </div>

          <div className="panel-card p-6 flex flex-col justify-center relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Local Transactions</p>
            <p className="text-4xl font-bold text-white mb-2">{progress.entries.length}</p>
            <p className="text-xs text-slate-500">Session History Count</p>
          </div>

          <div className="panel-card p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Demo Environment</p>
                <p className={`text-xl font-bold ${smokeEnabled ? "text-amber-400" : "text-cyan-400"}`}>
                  {smokeEnabled ? "SMOKE MODE" : "REAL CHAIN"}
                </p>
              </div>
              <div className={`w-3 h-3 rounded-full animate-pulse ${smokeEnabled ? "bg-amber-500" : "bg-cyan-500"}`} />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onToggleSmokeMode(true)}
                className={`nav-pill text-xs px-3 py-1 ${smokeEnabled ? "active border-amber-500/50 text-amber-300 bg-amber-500/10" : ""}`}
              >
                Smoke
              </button>
              <button
                onClick={() => onToggleSmokeMode(false)}
                className={`nav-pill text-xs px-3 py-1 ${!smokeEnabled ? "active border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : ""}`}
              >
                Real
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-white/5">
          <button onClick={onCopyDemoLink} className="nav-pill text-sm flex items-center gap-2 group">
            <span className="group-hover:text-cyan-300">{copied ? "✓ Copied" : "🔗 Share Demo Link"}</span>
          </button>
          <button onClick={onResetDemoState} className="nav-pill text-sm hover:border-red-500/50 hover:text-red-300 hover:bg-red-500/10">
            ↺ Reset State
          </button>
          <button onClick={() => setRefreshKey(k => k + 1)} className="nav-pill text-sm">
            ⟳ Refresh
          </button>
        </div>
      </div>

      <RealChainHealthCard />

      <div className="panel-card p-8">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm">01</span>
          Core Flow
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {progress.steps.map((step, idx) => (
            <div
              key={step.id}
              onClick={() => navigate(step.actionPath)}
              className={`
                  relative overflow-hidden rounded-xl border p-5 transition-all cursor-pointer group
                  ${step.completed
                  ? "border-emerald-500/30 bg-emerald-900/5 hover:bg-emerald-900/10"
                  : "border-white/5 bg-white/5 hover:border-cyan-500/30 hover:bg-cyan-900/5"
                }
                `}
            >
              {/* Glow Effect */}
              <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl transition-opacity opacity-0 group-hover:opacity-20 ${step.completed ? "bg-emerald-500" : "bg-cyan-500"}`} />

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${step.completed
                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    : "border-slate-600 text-slate-400 bg-black/20"
                    }`}>
                    STEP 0{idx + 1}
                  </span>
                  {step.completed && <span className="text-emerald-400 text-lg">✓</span>}
                </div>

                <h3 className={`font-bold mb-2 ${step.completed ? "text-emerald-100" : "text-slate-100 group-hover:text-cyan-100"}`}>
                  {step.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4 flex-1">
                  {step.description}
                </p>

                <button className={`w-full py-2 rounded-lg text-xs font-bold tracking-wider transition-colors ${step.completed
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-white/5 text-slate-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-300"
                  }`}>
                  {step.completed ? "COMPLETED" : "EXECUTE ->"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-card p-6 border-l-4 border-l-purple-500">
        <h3 className="text-lg font-bold text-white mb-2">Why Stableflow?</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-400">
          <p>• <strong className="text-slate-200">Merchant Loop:</strong> Not just payments, but a full lifecycle including Product, Invoice, and Receipt management.</p>
          <p>• <strong className="text-slate-200">Instant Finality:</strong> On-chain proof with Checkpoints and Events immediately after payment.</p>
          <p>• <strong className="text-slate-200">Business Metrics:</strong> Real-time dashboards for TVL, GMV, and Conversion Rates.</p>
          <p>• <strong className="text-slate-200">AI Automation:</strong> Local Agent converts natural language into complex transactions.</p>
        </div>
      </div>
    </div>
  );
}
