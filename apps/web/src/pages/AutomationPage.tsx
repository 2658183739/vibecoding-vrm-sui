import { useMemo, useState } from "react";
import { Button, Card, Input } from "@heroui/react";
import { ConnectWalletButton } from "../lib/wallet";
import {
  buildLocalAutomationPlan,
  clearLocalAutomationHistory,
  loadLocalAutomationHistory,
  runLocalAutomationPlan,
  saveDraftLocalAutomationSession,
  type LocalAutomationSession
} from "../lib/localAutomation";

function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AutomationPage() {
  const [goal, setGoal] = useState("整理 Downloads，生成分类报告，并保留冲突文件。");
  const [workspaceRoot, setWorkspaceRoot] = useState("E:/competition/VibeSui黑客松");
  const [downloadsDir, setDownloadsDir] = useState("C:/Users/<你的用户名>/Downloads");
  const [allowedPrefixesText, setAllowedPrefixesText] = useState("node,git,ffmpeg,tar,pnpm");
  const [dryRun, setDryRun] = useState(true);
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [autoApproveHighRisk, setAutoApproveHighRisk] = useState(false);
  const [session, setSession] = useState<LocalAutomationSession | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const history = useMemo(() => {
    void refreshKey;
    return loadLocalAutomationHistory(12);
  }, [refreshKey]);

  function parseAllowedPrefixes(): string[] {
    return allowedPrefixesText
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  function onBuildPlan(): void {
    setError(null);
    const cleanGoal = goal.trim();
    if (!cleanGoal) {
      setError("请先输入任务目标。");
      return;
    }

    try {
      const built = buildLocalAutomationPlan({
        goal: cleanGoal,
        workspaceRoot: workspaceRoot.trim() || ".",
        downloadsDir: downloadsDir.trim() || "",
        dryRun,
        allowNetwork,
        allowedCommandPrefixes: parseAllowedPrefixes()
      });

      const draft = saveDraftLocalAutomationSession({
        goal: cleanGoal,
        plan: built.plan,
        guard: built.guard,
        markdown: built.markdown
      });

      setSession(draft);
      setRefreshKey((prev) => prev + 1);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "计划生成失败。";
      setError(message);
    }
  }

  async function onRunPlan(): Promise<void> {
    if (!session) return;
    setRunLoading(true);
    setError(null);

    try {
      const completed = await runLocalAutomationPlan(
        {
          goal: session.goal,
          plan: session.plan,
          guard: session.guard
        },
        {
          simulate: dryRun,
          autoApproveHighRisk
        }
      );
      setSession(completed);
      setRefreshKey((prev) => prev + 1);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "执行失败。";
      setError(message);
    } finally {
      setRunLoading(false);
    }
  }

  function onClearHistory(): void {
    clearLocalAutomationHistory();
    setRefreshKey((prev) => prev + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card shadow-[0_20px_60px_rgba(5,12,22,0.45)]">
        <Card.Content className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-100">本地自治控制台</h1>
            <p className="text-sm text-slate-300">
              以安全策略驱动本地任务编排，先生成可审计计划，再执行。保留现有 Sui 与 StableLayer
              交易链路，不做替换。
            </p>
          </div>
          <ConnectWalletButton />
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-4">
            <p className="text-lg font-semibold text-slate-100">1) 定义任务目标</p>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>任务目标</span>
              <textarea
                className="h-24 w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
                value={goal}
                onChange={(event) => setGoal(event.currentTarget.value)}
                placeholder="例如：整理下载目录并生成分类报告"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">工作区目录</span>
                <Input
                  aria-label="workspace root"
                  value={workspaceRoot}
                  onChange={(event) => setWorkspaceRoot(event.currentTarget.value)}
                  variant="secondary"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">下载目录</span>
                <Input
                  aria-label="downloads dir"
                  value={downloadsDir}
                  onChange={(event) => setDownloadsDir(event.currentTarget.value)}
                  variant="secondary"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">允许命令前缀（逗号分隔）</span>
              <Input
                aria-label="allowed command prefixes"
                value={allowedPrefixesText}
                onChange={(event) => setAllowedPrefixesText(event.currentTarget.value)}
                variant="secondary"
              />
            </label>

            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.currentTarget.checked)}
                />
                Dry Run（仅模拟）
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowNetwork}
                  onChange={(event) => setAllowNetwork(event.currentTarget.checked)}
                />
                允许网络步骤
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoApproveHighRisk}
                  onChange={(event) => setAutoApproveHighRisk(event.currentTarget.checked)}
                />
                自动批准高风险步骤
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onPress={onBuildPlan}>
                生成计划
              </Button>
              <Button
                variant="secondary"
                isDisabled={!session || runLoading}
                onPress={() => onRunPlan()}
              >
                {runLoading ? "执行中..." : "执行计划"}
              </Button>
              <Button variant="secondary" isDisabled={!session} onPress={() => session && downloadMarkdown(`local-automation-${session.plan.id}.md`, session.markdown)}>
                导出 Markdown
              </Button>
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </Card.Content>
        </Card>

        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-3 text-sm text-slate-200">
            <p className="text-lg font-semibold text-slate-100">2) 安全守卫状态</p>
            {!session && <p className="text-slate-400">先生成计划后查看守卫检查结果。</p>}
            {session && (
              <>
                <p>
                  计划：<span className="text-slate-100">{session.plan.intent}</span>
                </p>
                <p>
                  守卫结论：
                  <span className={session.guard.safe ? "text-emerald-300" : "text-red-300"}>
                    {session.guard.safe ? "通过" : "阻断"}
                  </span>
                </p>
                {session.guard.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                    <p className="font-semibold text-amber-200">警告</p>
                    {session.guard.warnings.map((item) => (
                      <p key={item} className="text-amber-100">
                        - {item}
                      </p>
                    ))}
                  </div>
                )}
                {session.guard.blockedReasons.length > 0 && (
                  <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2">
                    <p className="font-semibold text-red-200">阻断原因</p>
                    {session.guard.blockedReasons.map((item) => (
                      <p key={item} className="text-red-100">
                        - {item}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card.Content>
        </Card>
      </div>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-lg font-semibold text-slate-100">3) 计划步骤</p>
          {!session && <p className="text-sm text-slate-400">暂无计划。</p>}
          {session?.plan.steps.map((step, index) => (
            <div
              key={step.id}
              className="rounded-xl border border-white/15 bg-white/[0.02] px-4 py-3 text-sm text-slate-200"
            >
              <p className="font-semibold text-slate-100">
                {index + 1}. {step.title}
              </p>
              <p>{step.details}</p>
              <p className="text-xs text-slate-400">
                kind={step.kind} | risk={step.risk} | approval=
                {step.requiresApproval ? "yes" : "no"}
              </p>
              {step.command && <p className="text-xs text-slate-400">command: {step.command}</p>}
            </div>
          ))}
        </Card.Content>
      </Card>

      {session?.result && (
        <Card variant="secondary" className="panel-card">
          <Card.Content className="space-y-3 text-sm text-slate-200">
            <p className="text-lg font-semibold text-slate-100">4) 执行结果</p>
            <p>
              状态：
              <span
                className={
                  session.result.status === "completed" ? "text-emerald-300" : "text-amber-300"
                }
              >
                {session.result.status}
              </span>
            </p>
            {session.result.records.map((record) => (
              <div
                key={record.stepId}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <p>
                  {record.stepId} · {record.status}
                </p>
                <p className="text-xs text-slate-400">{record.output}</p>
              </div>
            ))}
          </Card.Content>
        </Card>
      )}

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3 text-sm text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold text-slate-100">本地历史记录</p>
            <Button variant="secondary" onPress={onClearHistory} isDisabled={history.length === 0}>
              清空历史
            </Button>
          </div>

          {history.length === 0 && <p className="text-slate-400">暂无历史记录。</p>}

          {history.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3"
            >
              <p className="text-xs text-slate-400">{item.createdAtIso}</p>
              <p className="font-semibold text-slate-100">{item.goal}</p>
              <p className="text-xs text-slate-400">
                {item.plan.intent} · {item.result?.status || "draft"}
              </p>
              <div className="mt-2">
                <Button
                  variant="secondary"
                  onPress={() => downloadMarkdown(`local-automation-${item.plan.id}.md`, item.markdown)}
                >
                  导出此条 Markdown
                </Button>
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
