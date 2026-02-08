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
              <h1 className="text-3xl font-bold text-slate-100">稳定层快速演示+</h1>
              <p className="max-w-3xl text-sm text-slate-300">按步骤完成闭环：创建账单、USDC 一键支付、T+1 赎回、收益领取。</p>
              <p className="break-all text-xs text-slate-400">当前钱包：{account?.address || "-"}</p>
            </div>
            <ConnectWalletButton />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card variant="secondary" className="border border-emerald-400/30 bg-emerald-500/10">
              <Card.Content className="space-y-1">
                <p className="text-xs text-emerald-200">流程完成度</p>
                <p className="text-3xl font-semibold text-emerald-100">{progress.percentage}%</p>
                <p className="text-xs text-emerald-200">
                  {progress.completed}/{progress.total} 步已完成
                </p>
              </Card.Content>
            </Card>
            <Card variant="secondary" className="panel-card">
              <Card.Content className="space-y-1">
                <p className="text-xs text-slate-400">最近交易数</p>
                <p className="text-3xl font-semibold text-slate-100">{progress.entries.length}</p>
                <p className="text-xs text-slate-400">来自本地演示轨迹</p>
              </Card.Content>
            </Card>
            <Card variant="secondary" className="panel-card">
              <Card.Content className="space-y-2">
                <p className="text-xs text-slate-400">演示模式</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={smokeEnabled ? "primary" : "secondary"}
                    onPress={() => onToggleSmokeMode(true)}
                  >
                    演示模式 开
                  </Button>
                  <Button
                    variant={!smokeEnabled ? "primary" : "secondary"}
                    onPress={() => onToggleSmokeMode(false)}
                  >
                    演示模式 关
                  </Button>
                </div>
              </Card.Content>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onPress={onCopyDemoLink}>
              {copied ? "已复制演示链接" : "复制演示链接"}
            </Button>
            <Button variant="secondary" onPress={onResetDemoState}>
              重置演示状态
            </Button>
            <Button variant="primary" onPress={() => setRefreshKey((prev) => prev + 1)}>
              刷新进度
            </Button>
          </div>
        </Card.Content>
      </Card>

      <RealChainHealthCard />

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-lg font-semibold text-slate-100">四步完成核心闭环</p>
          <div className="grid gap-3 md:grid-cols-2">
            {progress.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-xl border px-4 py-3 ${
                  step.completed
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/15 bg-white/[0.02]"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">
                  {step.completed ? "已完成 · " : "未完成 · "}
                  {step.title}
                </p>
                <p className="mt-1 text-xs text-slate-300">{step.description}</p>
                <Button className="mt-3" variant="secondary" onPress={() => navigate(step.actionPath)}>
                  去执行
                </Button>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-2 text-sm text-slate-200">
          <p className="text-lg font-semibold text-slate-100">为什么它比普通快速引导更强</p>
          <p>1. 不只覆盖铸造、赎回、领取，还包含商户收款闭环（商品、账单、回执）。</p>
          <p>2. 支付后提供链上证明（检查点、Gas、事件数、创建对象），可即刻验真。</p>
          <p>3. 指标页包含支付转化率、已支付 GMV、待支付 GMV，直接体现增长潜力。</p>
          <p>4. Agent 可将自然语言转成交易动作，降低新用户学习门槛。</p>
        </Card.Content>
      </Card>
    </div>
  );
}
