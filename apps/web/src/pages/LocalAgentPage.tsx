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
      if (!result.ok) pushNotice("error", "Local Agent returned abnormal status.");
    } catch (error) {
      setHealthStatus("disconnected");
      setHealthData(null);
      const message = error instanceof Error ? error.message : "Cannot connect to Local Agent.";
      pushNotice("error", message);
    }
  }

  async function refreshConfig(): Promise<void> {
    setLoadingConfig(true);
    try {
      const result = await getLocalAgentConfig();
      setAgentConfig(result);
      setAllowlistText(formatAllowlistInput(result.domainAllowlist));
      pushNotice("success", "Local Agent config loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load local config.";
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
          ? "Config applied to Local Agent."
          : "Config applied: LLM disabled (provider=none or empty API Key)."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply config.";
      pushNotice("error", message);
    } finally {
      setApplyingConfig(false);
    }
  }

  async function openCurrentInvoiceInControlledBrowser(): Promise<void> {
    if (!isPayPage) {
      pushNotice("info", "Not on /pay/:invoiceId page, operation unavailable.");
      return;
    }

    setOpening(true);
    try {
      const result = await openInControlledBrowser(window.location.href);
      if (result.fallbackUsed) {
        pushNotice(
          "info",
          `OpenClaw unavailable, fell back to system browser. ${result.warning ? `Reason: ${result.warning}` : ""}`
        );
      } else {
        pushNotice("success", "Opened current invoice page in controlled browser.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open controlled browser.";
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
          <h1 className="text-2xl font-bold text-slate-100">Local Agent Integration</h1>
          <p className="text-sm text-slate-300">
            Manage Local Agent connection, allowlist, and LLM settings, and trigger controlled browser to open current invoice.
          </p>
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${statusBadgeClass(healthStatus)}`}
          >
            Connection Status:
            {healthStatus === "connected"
              ? "Connected"
              : healthStatus === "checking"
                ? "Checking"
                : "Disconnected"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={() => void refreshHealth()}>
              Refresh Status
            </Button>
            <Button variant="secondary" isDisabled={loadingConfig} onPress={() => void refreshConfig()}>
              {loadingConfig ? "Loading..." : "Load Local Config"}
            </Button>
          </div>
          <div className="text-xs text-slate-400">
            <p>Agent Addr: `http://localhost:3777`</p>
            <p>Version: {healthData?.version || "-"}</p>
            <p>Time: {healthData?.timestamp || "-"}</p>
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <p className="text-lg font-semibold text-slate-100">Domain Allowlist</p>
          <p className="text-xs text-slate-400">
            One domain or origin per line (e.g. `localhost`, `http://localhost:5173`).
          </p>
          <textarea
            className="h-40 w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
            value={allowlistText}
            onChange={(event) => setAllowlistText(event.currentTarget.value)}
            placeholder={"localhost\nhttp://localhost:5173\n2658183739.github.io"}
          />
          <p className="text-xs text-slate-400">Current Config Item Count: {agentConfig?.domainAllowlist.length || 0}</p>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-4">
          <p className="text-lg font-semibold text-slate-100">LLM Settings (Optional)</p>
          <p className="text-xs text-slate-400">
            API Key is saved in browser localStorage only, not committed to Git. Only provider and llmEnabled are submitted when applying config.
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
            placeholder="Enter API Key (Saved locally only)"
            value={apiKey}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            variant="secondary"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" isDisabled={applyingConfig} onPress={() => void applyConfigToLocalAgent()}>
              {applyingConfig ? "Applying..." : "Apply to Local Agent"}
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary" className="panel-card">
        <Card.Content className="space-y-3">
          <p className="text-lg font-semibold text-slate-100">Controlled Browser Actions</p>
          <p className="text-xs text-slate-400">Current Path: {location.pathname}</p>
          <Button
            variant="primary"
            isDisabled={!isPayPage || opening}
            onPress={() => void openCurrentInvoiceInControlledBrowser()}
          >
            {opening ? "Processing..." : "Open current invoice in controlled browser"}
          </Button>
          {!isPayPage && (
            <p className="text-xs text-amber-300">Only available on /pay/:invoiceId page. Please go to invoice payment page first.</p>
          )}
        </Card.Content>
      </Card>

      <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 space-y-2 px-6">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`rounded-xl border px-3 py-2 text-sm shadow-lg ${notice.type === "success"
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

