import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Card, Input } from "@heroui/react";
import {
  getLocalAgentConfig,
  getLocalAgentHealth,
  openInControlledBrowser,
  updateLocalAgentConfig,
  type LocalAgentConfig,
  type LocalAgentHealth
} from "../lib/localAgentClient";

type HealthStatus = "checking" | "connected" | "disconnected";
type NoticeType = "success" | "error" | "info";

interface NoticeItem {
  id: string;
  type: NoticeType;
  text: string;
}

const LOCAL_AGENT_UI_STORAGE_KEY = "stableflow.local_agent.ui.v1";

function buildNoticeId(): string {
  return `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseAllowlistInput(raw: string): string[] {
  const tokens = raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

function formatAllowlistInput(items: string[]): string {
  return items.join("\n");
}

function loadStoredAgentUi(): {
  provider: "none" | "openai" | "anthropic";
  apiKey: string;
} {
  if (typeof window === "undefined") return { provider: "none", apiKey: "" };
  try {
    const raw = window.localStorage.getItem(LOCAL_AGENT_UI_STORAGE_KEY);
    if (!raw) return { provider: "none", apiKey: "" };
    const parsed = JSON.parse(raw) as { provider?: string; apiKey?: string };
    const provider =
      parsed.provider === "openai" || parsed.provider === "anthropic" ? parsed.provider : "none";
    return { provider, apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "" };
  } catch {
    return { provider: "none", apiKey: "" };
  }
}

function persistAgentUi(provider: string, apiKey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LOCAL_AGENT_UI_STORAGE_KEY,
    JSON.stringify({
      provider:
        provider === "openai" || provider === "anthropic" || provider === "none"
          ? provider
          : "none",
      apiKey
    })
  );
}

function statusBadgeClass(status: HealthStatus): string {
  if (status === "connected") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (status === "disconnected") return "border-red-400/40 bg-red-500/15 text-red-200";
  return "border-amber-400/40 bg-amber-500/15 text-amber-100";
}

export default function LocalAgentPage() {
  const location = useLocation();

  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [healthData, setHealthData] = useState<LocalAgentHealth | null>(null);
  const [agentConfig, setAgentConfig] = useState<LocalAgentConfig | null>(null);
  const [allowlistText, setAllowlistText] = useState("");
  const [provider, setProvider] = useState<"none" | "openai" | "anthropic">("none");
  const [apiKey, setApiKey] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [opening, setOpening] = useState(false);
  const [notices, setNotices] = useState<NoticeItem[]>([]);

  const invoiceId = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "pay" && parts[1]) return parts[1];
    return "";
  }, [location.pathname]);

  const isPayPage = Boolean(invoiceId);

  function pushNotice(type: NoticeType, text: string): void {
    const item: NoticeItem = { id: buildNoticeId(), type, text };
    setNotices((prev) => [item, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((entry) => entry.id !== item.id));
    }, 3600);
  }

  async function refreshHealth(): Promise<void> {
    setHealthStatus("checking");
    try {
      const result = await getLocalAgentHealth();
      setHealthData(result);
      setHealthStatus(result.ok ? "connected" : "disconnected");
      if (!result.ok) pushNotice("error", "本地 Agent 返回异常状态。");
    } catch (error) {
      setHealthStatus("disconnected");
      setHealthData(null);
      const message = error instanceof Error ? error.message : "无法连接本地 Agent。";
      pushNotice("error", message);
    }
  }

  async function refreshConfig(): Promise<void> {
    setLoadingConfig(true);
    try {
      const result = await getLocalAgentConfig();
      setAgentConfig(result);
      setAllowlistText(formatAllowlistInput(result.domainAllowlist));
      pushNotice("success", "已读取本地 Agent 配置。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取本地配置失败。";
      pushNotice("error", message);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function applyConfigToLocalAgent(): Promise<void> {
    setApplyingConfig(true);
    try {
      const allowlist = parseAllowlistInput(allowlistText);
      const llmEnabled = provider !== "none" && apiKey.trim().length > 0;
      const next = await updateLocalAgentConfig({
        domainAllowlist: allowlist,
        llmProvider: provider,
        llmEnabled
      });

      setAgentConfig(next);
      setAllowlistText(formatAllowlistInput(next.domainAllowlist));
      persistAgentUi(provider, apiKey);
      pushNotice(
        "success",
        llmEnabled
          ? "配置已应用到本地 Agent。"
          : "配置已应用：当前未启用 LLM（provider=none 或 API Key 为空）。"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "应用配置失败。";
      pushNotice("error", message);
    } finally {
      setApplyingConfig(false);
    }
  }

  async function openCurrentInvoiceInControlledBrowser(): Promise<void> {
    if (!isPayPage) {
      pushNotice("info", "当前不在 /pay/:invoiceId 页面，无法执行该操作。");
      return;
    }

    setOpening(true);
    try {
      const result = await openInControlledBrowser(window.location.href);
      if (result.fallbackUsed) {
        pushNotice(
          "info",
          `OpenClaw 不可用，已回退系统浏览器。${result.warning ? `原因：${result.warning}` : ""}`
        );
      } else {
        pushNotice("success", "已在受控浏览器中打开当前账单页面。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "打开受控浏览器失败。";
      pushNotice("error", message);
    } finally {
      setOpening(false);
    }
  }

  useEffect(() => {
    const cached = loadStoredAgentUi();
    setProvider(cached.provider);
    setApiKey(cached.apiKey);
    void refreshHealth();
    void refreshConfig();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-100">Local Agent 集成</h1>
          <p className="text-sm text-slate-300">
            管理本地 Agent 连接、白名单与 LLM 设置，并触发受控浏览器打开当前账单页面。
          </p>
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${statusBadgeClass(healthStatus)}`}
          >
            连接状态：
            {healthStatus === "connected"
              ? "已连接"
              : healthStatus === "checking"
                ? "检查中"
                : "未连接"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={() => void refreshHealth()}>
              刷新连接状态
            </Button>
            <Button variant="secondary" isDisabled={loadingConfig} onPress={() => void refreshConfig()}>
              {loadingConfig ? "读取中..." : "读取本地配置"}
            </Button>
          </div>
          <div className="text-xs text-slate-400">
            <p>Agent 地址：`http://localhost:3777`</p>
            <p>版本：{healthData?.version || "-"}</p>
            <p>时间：{healthData?.timestamp || "-"}</p>
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <p className="text-lg font-semibold text-slate-100">Domain Allowlist</p>
          <p className="text-xs text-slate-400">
            每行一个域名或 origin（例如 `localhost`、`http://localhost:5173`）。
          </p>
          <textarea
            className="h-40 w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
            value={allowlistText}
            onChange={(event) => setAllowlistText(event.currentTarget.value)}
            placeholder={"localhost\nhttp://localhost:5173\n2658183739.github.io"}
          />
          <p className="text-xs text-slate-400">当前后端配置项数量：{agentConfig?.domainAllowlist.length || 0}</p>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <p className="text-lg font-semibold text-slate-100">LLM 设置（可选）</p>
          <p className="text-xs text-slate-400">
            API Key 仅存于当前浏览器 localStorage，不会写入 Git。应用配置时只会提交 provider 与 llmEnabled。
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Provider</span>
            <select
              className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
              value={provider}
              onChange={(event) =>
                setProvider(event.currentTarget.value as "none" | "openai" | "anthropic")
              }
            >
              <option value="none">none</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
          </label>
          <Input
            aria-label="Local agent llm api key"
            type="password"
            placeholder="输入 API Key（仅本地浏览器保存）"
            value={apiKey}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            variant="secondary"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" isDisabled={applyingConfig} onPress={() => void applyConfigToLocalAgent()}>
              {applyingConfig ? "应用中..." : "应用到本地 Agent"}
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-lg font-semibold text-slate-100">受控浏览器动作</p>
          <p className="text-xs text-slate-400">当前路径：{location.pathname}</p>
          <Button
            variant="primary"
            isDisabled={!isPayPage || opening}
            onPress={() => void openCurrentInvoiceInControlledBrowser()}
          >
            {opening ? "处理中..." : "Open current invoice in controlled browser"}
          </Button>
          {!isPayPage && (
            <p className="text-xs text-amber-300">仅在 /pay/:invoiceId 页面可用，请先进入账单支付页。</p>
          )}
        </Card.Content>
      </Card>

      <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 space-y-2 px-6">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`rounded-xl border px-3 py-2 text-sm shadow-lg ${
              notice.type === "success"
                ? "border-emerald-400/35 bg-emerald-500/20 text-emerald-100"
                : notice.type === "error"
                  ? "border-red-400/35 bg-red-500/20 text-red-100"
                  : "border-sky-400/35 bg-sky-500/20 text-sky-100"
            }`}
          >
            {notice.text}
          </div>
        ))}
      </div>
    </div>
  );
}

