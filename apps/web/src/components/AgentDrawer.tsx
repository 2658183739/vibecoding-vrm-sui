import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input } from "@heroui/react";
import {
  CheckoutAgentEngine,
  type AgentMemory,
  type AgentOutput,
  type SuggestedAction
} from "@vibesui/agent";
import { appConfig } from "../config";
import {
  createWebAgentToolbox,
  getInvoice as queryInvoice,
  getTxStatus as queryTxStatus
} from "../lib/agentTools";
import {
  runAgentFullPlaybook,
  type PlaybookStepStatus,
  type PlaybookStepUpdate
} from "../lib/agentPlaybook";
import { loadQuickstartProgress } from "../lib/demoProgress";
import { isSmokeMode, setSmokeMode } from "../lib/smokeMode";
import {
  smokeBurn,
  smokeClaim,
  smokeGetInvoice,
  smokePayInvoice,
  type SmokeTxFeedback
} from "../lib/smokeState";
import { normalizeTxFeedback, parseErrorMessage, type TxFeedback } from "../lib/sui";
import { ConnectWalletButton, useWalletAccount, useWalletDAppKit } from "../lib/wallet";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}

interface TimelineRecord {
  id: string;
  timestampMs: number;
  output: AgentOutput;
  collapsed: boolean;
}

type PanelKey =
  | "quickPrompts"
  | "suggestions"
  | "coach"
  | "config"
  | "context"
  | "timeline"
  | "action";

type PanelState = Record<PanelKey, boolean>;

const AGENT_KEY_STORAGE_KEY = "stableflow.agent.key";
const AGENT_ENDPOINT_STORAGE_KEY = "stableflow.agent.endpoint";
const AGENT_MODEL_STORAGE_KEY = "stableflow.agent.model";
const AGENT_LLM_MODE_STORAGE_KEY = "stableflow.agent.llm_mode";
const AGENT_COACH_MODE_STORAGE_KEY = "stableflow.agent.coach_mode";
const AGENT_TIMELINE_STORAGE_KEY = "stableflow.agent.timeline.v1";
const AGENT_HISTORY_MARKDOWN_STORAGE_KEY = "stableflow.agent.history.markdown.v1";
const AGENT_TIMELINE_MAX_ITEMS = 40;

const QUICK_PROMPTS = [
  "What features does this project have?",
  "How to quickly demo this project?",
  "One-click execute playbook",
  "Start full demo",
  "Continue to next step",
  "What is my current balance?",
  "How to config Bailian Key?",
  "Pay current invoice for me",
  "Redeem all for me",
  "Claim rewards for me"
] as const;

function summarizeOutput(output: AgentOutput): string {
  const firstStep = output.steps[0]?.title || "-";
  const firstAction = output.suggestedActions[0]?.label || "-";
  return `Intent: ${output.intent}\nFirst Step: ${firstStep}\nSuggested Action: ${firstAction}`;
}

function stepColor(status: AgentOutput["steps"][number]["status"]): string {
  if (status === "completed") return "text-emerald-300";
  if (status === "in_progress") return "text-amber-300";
  if (status === "failed") return "text-red-300";
  return "text-slate-400";
}

function actionNeedsWallet(actionType: string): boolean {
  return (
    actionType === "RUN_DEMO_PLAYBOOK" ||
    actionType === "PAY_MINT_AND_PAY" ||
    actionType === "REDEEM_ALL" ||
    actionType === "REDEEM_AMOUNT" ||
    actionType === "CLAIM_REVENUE"
  );
}

function parseInvoiceIdFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "pay" && parts[1]) return parts[1];
  return undefined;
}

function buildMessageId(): string {
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function statusLabel(status: PlaybookStepStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "success") return "Success";
  if (status === "skipped") return "Skipped";
  return "Failed";
}

function deriveGoalHints(text: string): string[] {
  const goals: string[] = [];
  const normalized = text.toLowerCase();
  if (normalized.includes("demo") || normalized.includes("演示")) goals.push("demo");
  if (normalized.includes("pay") || normalized.includes("支付")) goals.push("pay");
  if (normalized.includes("redeem") || normalized.includes("赎回")) goals.push("redeem");
  if (normalized.includes("claim") || normalized.includes("领取")) goals.push("claim");
  if (normalized.includes("feature") || normalized.includes("guide") || normalized.includes("how to")) goals.push("guide");
  return goals;
}

function safeLoadTimeline(): TimelineRecord[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(AGENT_TIMELINE_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as TimelineRecord[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .slice(0, AGENT_TIMELINE_MAX_ITEMS)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : buildMessageId(),
        timestampMs: typeof item.timestampMs === "number" ? item.timestampMs : Date.now(),
        output: item.output,
        collapsed: Boolean(item.collapsed)
      }));
  } catch {
    return [];
  }
}

function safeLoadHistoryMarkdown(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AGENT_HISTORY_MARKDOWN_STORAGE_KEY) || "";
}

function saveTimeline(next: TimelineRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_TIMELINE_STORAGE_KEY, JSON.stringify(next));
}

function saveHistoryMarkdown(next: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_HISTORY_MARKDOWN_STORAGE_KEY, next);
}

function buildHistoryMarkdownEntry(output: AgentOutput, timestampMs: number): string {
  const lines: string[] = [];
  lines.push(`### ${formatTime(timestampMs)} · ${output.intent}`);
  lines.push("");
  lines.push("Steps:");
  output.steps.forEach((step) => {
    lines.push(`- [${step.status}] ${step.title}：${step.details}`);
  });
  lines.push("");
  lines.push("Suggested Actions:");
  output.suggestedActions.forEach((action) => {
    lines.push(`- ${action.label} (${action.actionType})`);
  });
  lines.push("");
  return lines.join("\n");
}

function exportMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function toTxFeedback(input: SmokeTxFeedback): TxFeedback {
  return {
    digest: input.digest,
    status: input.status,
    explorerUrl: input.explorerUrl,
    errorMessage: input.errorMessage,
    receiptObjectId: input.receiptObjectId
  };
}

export function AgentDrawer() {
  const account = useWalletAccount();
  const dAppKit = useWalletDAppKit();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoadingType, setActionLoadingType] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildMessageId(),
      role: "assistant",
      text: "Assistant is ready. You can ask 'What features does this project have', 'How to demo', 'What to do next', or ask me to execute transaction actions directly."
    }
  ]);
  const [latestOutput, setLatestOutput] = useState<AgentOutput | null>(null);
  const [timeline, setTimeline] = useState<TimelineRecord[]>(() => safeLoadTimeline());
  const [historyMarkdown, setHistoryMarkdown] = useState<string>(() => safeLoadHistoryMarkdown());
  const [actionError, setActionError] = useState<string | null>(null);
  const [txFeedback, setTxFeedback] = useState<TxFeedback | null>(null);
  const [panelState, setPanelState] = useState<PanelState>({
    quickPrompts: false,
    suggestions: false,
    coach: false,
    config: false,
    context: false,
    timeline: false,
    action: false
  });

  const [agentKeyInput, setAgentKeyInput] = useState("");
  const [agentEndpoint, setAgentEndpoint] = useState("");
  const [agentModel, setAgentModel] = useState(appConfig.agent.model);
  const [llmModeEnabled, setLlmModeEnabled] = useState(appConfig.agent.enableLlmMode);
  const [showAgentKey, setShowAgentKey] = useState(false);
  const [agentConfigSaved, setAgentConfigSaved] = useState(false);

  const [coachModeEnabled, setCoachModeEnabled] = useState(false);
  const [memoryState, setMemoryState] = useState<AgentMemory>({
    userGoals: [],
    completedActions: [],
    recentPaths: [],
    recentDigests: []
  });

  const engine = useMemo(() => new CheckoutAgentEngine(), []);
  const toolbox = useMemo(
    () => (account ? createWebAgentToolbox(account.address) : null),
    [account]
  );

  const quickstartProgress = loadQuickstartProgress();
  const nextDemoStep = quickstartProgress.steps.find((item) => !item.completed);

  useEffect(() => {
    const cachedKey = localStorage.getItem(AGENT_KEY_STORAGE_KEY) || "";
    const cachedEndpoint =
      localStorage.getItem(AGENT_ENDPOINT_STORAGE_KEY) || appConfig.agent.endpoint;
    const cachedModel = localStorage.getItem(AGENT_MODEL_STORAGE_KEY) || appConfig.agent.model;
    const cachedMode =
      localStorage.getItem(AGENT_LLM_MODE_STORAGE_KEY) === "1" || appConfig.agent.enableLlmMode;
    const cachedCoachMode = localStorage.getItem(AGENT_COACH_MODE_STORAGE_KEY) === "1";

    setAgentKeyInput(cachedKey);
    setAgentEndpoint(cachedEndpoint);
    setAgentModel(cachedModel);
    setLlmModeEnabled(cachedMode);
    setCoachModeEnabled(cachedCoachMode);
    setAgentConfigSaved(Boolean(cachedKey || cachedEndpoint));
  }, []);

  useEffect(() => {
    saveTimeline(timeline);
  }, [timeline]);

  useEffect(() => {
    saveHistoryMarkdown(historyMarkdown);
  }, [historyMarkdown]);

  function togglePanel(key: PanelKey): void {
    setPanelState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function appendTimeline(output: AgentOutput): void {
    const timestampMs = Date.now();
    const record: TimelineRecord = {
      id: buildMessageId(),
      timestampMs,
      output,
      collapsed: false
    };

    setTimeline((prev) => {
      const next = [
        record,
        ...prev.map((item, index) => (index === 0 ? { ...item, collapsed: true } : item))
      ];
      return next.slice(0, AGENT_TIMELINE_MAX_ITEMS);
    });

    const entry = buildHistoryMarkdownEntry(output, timestampMs);
    setHistoryMarkdown((prev) => {
      const prefix = prev.trim().length > 0 ? `${prev.trim()}\n\n` : "";
      return `${prefix}${entry}`.trim();
    });
  }

  function toggleTimelineCollapse(id: string): void {
    setTimeline((prev) =>
      prev.map((item) => (item.id === id ? { ...item, collapsed: !item.collapsed } : item))
    );
  }

  function onClearTimeline(): void {
    setTimeline([]);
    setHistoryMarkdown("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_TIMELINE_STORAGE_KEY);
      window.localStorage.removeItem(AGENT_HISTORY_MARKDOWN_STORAGE_KEY);
    }
  }

  function toTimelineMarkdown(): string {
    const now = new Date();
    const lines: string[] = [];
    lines.push("# Agent Demo Log");
    lines.push("");
    lines.push(`- Export Time: ${now.toLocaleString()}`);
    lines.push(`- Current Path: ${location.pathname}`);
    lines.push(`- Current Wallet: ${account?.address || "-"}`);
    lines.push(`- Current Mode: ${isSmokeMode() ? "Smoke Demo Mode" : "Real Chain Mode"}`);
    lines.push("");
    lines.push("## Demo Progress");
    lines.push(`- Completion Rate: ${quickstartProgress.percentage}%`);
    for (const step of quickstartProgress.steps) {
      lines.push(`- [${step.completed ? "x" : " "}] ${step.title} (${step.actionPath})`);
    }
    lines.push("");
    lines.push("## History (Markdown)");
    lines.push("");
    if (historyMarkdown.trim().length > 0) {
      lines.push(historyMarkdown.trim());
      lines.push("");
      return lines.join("\n");
    }

    lines.push("- No records");
    lines.push("");

    return lines.join("\n");
  }

  function onExportTimelineMarkdown(): void {
    const content = toTimelineMarkdown();
    const filename = `agent-demo-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
    exportMarkdownFile(filename, content);
  }

  async function onCopyHistoryMarkdown(): Promise<void> {
    const content = toTimelineMarkdown();
    try {
      await navigator.clipboard.writeText(content);
      setMessages((prev) => [
        ...prev,
        { id: buildMessageId(), role: "system", text: "History Markdown copied." }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: buildMessageId(), role: "system", text: "Copy failed, please use export function." }
      ]);
    }
  }

  async function onSend(rawText?: string): Promise<void> {
    const text = (rawText ?? input).trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id: buildMessageId(), role: "user", text }]);
    setInput("");
    setLoading(true);
    setActionError(null);

    try {
      const invoiceId = parseInvoiceIdFromPath(location.pathname);
      let balances: Record<string, string> = {};
      if (account && toolbox) {
        try {
          balances = await toolbox.getBalances(account.address);
        } catch {
          balances = {};
        }
      }
      const completedActions = quickstartProgress.steps
        .filter((item) => item.completed)
        .map((item) => item.id);
      const appendedGoals = deriveGoalHints(text);

      const nextMemory: AgentMemory = {
        guideMode: coachModeEnabled,
        lastIntent: memoryState.lastIntent,
        userGoals: Array.from(new Set([...(memoryState.userGoals || []), ...appendedGoals])).slice(
          0,
          8
        ),
        completedActions,
        recentPaths: [location.pathname, ...(memoryState.recentPaths || [])].slice(0, 8),
        recentDigests: lastDigest
          ? [lastDigest, ...(memoryState.recentDigests || [])].slice(0, 8)
          : (memoryState.recentDigests || []).slice(0, 8)
      };

      const output = await engine.run(
        {
          userInput: text,
          context: {
            invoiceId,
            stableCoinType: appConfig.stableLayer.stableCoinType,
            balances,
            address: account?.address,
            currentPath: location.pathname,
            lastDigest
          },
          memory: nextMemory
        },
        toolbox ?? undefined
      );

      setLatestOutput(output);
      setMemoryState({ ...nextMemory, lastIntent: output.intent });
      appendTimeline(output);

      setMessages((prev) => [
        ...prev,
        {
          id: buildMessageId(),
          role: "assistant",
          text: `${summarizeOutput(output)}\n(Expand "Suggested Actions" panel to execute)`
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { id: buildMessageId(), role: "assistant", text: `Execution Exception: ${parseErrorMessage(error)}` }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function executeAction(action: SuggestedAction): Promise<void> {
    setActionLoadingType(action.actionType);
    setActionError(null);

    try {
      if (!toolbox && actionNeedsWallet(action.actionType)) {
        throw new Error("Current action requires wallet signature, please connect wallet first.");
      }

      if (action.actionType === "NAVIGATE") {
        const path = typeof action.payload?.path === "string" ? action.payload.path : "/merchant";
        navigate(path);
        setMessages((prev) => [
          ...prev,
          { id: buildMessageId(), role: "system", text: `Navigated to ${path}` }
        ]);
        return;
      }

      if (action.actionType === "RUN_DEMO_PLAYBOOK") {
        if (!account) throw new Error("Please connect wallet first.");

        const playbookMessages: string[] = [];
        const playbookResult = await runAgentFullPlaybook({
          owner: account.address,
          signAndExecuteTransaction: (input) => dAppKit.signAndExecuteTransaction(input),
          onStepUpdate: (step: PlaybookStepUpdate) => {
            playbookMessages.push(`[${statusLabel(step.status)}] ${step.title} - ${step.details}`);
            setMessages((prev) => [
              ...prev,
              {
                id: buildMessageId(),
                role: "system",
                text: `[Playbook] ${statusLabel(step.status)}: ${step.title}\n${step.details}`
              }
            ]);
          }
        });

        if (playbookResult.lastTx) {
          setTxFeedback(playbookResult.lastTx);
          setLastDigest(playbookResult.lastTx.digest || undefined);
          setMemoryState((prev) => ({
            ...prev,
            recentDigests: playbookResult.lastTx?.digest
              ? [playbookResult.lastTx.digest, ...(prev.recentDigests || [])].slice(0, 8)
              : prev.recentDigests
          }));
        }

        if (playbookResult.invoiceId) {
          setMessages((prev) => [
            ...prev,
            {
              id: buildMessageId(),
              role: "assistant",
              text: `Invoice created by playbook: ${playbookResult.invoiceId}\nYou can go to /pay/${playbookResult.invoiceId} to verify.`
            }
          ]);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "assistant",
            text: playbookResult.success
              ? `Playbook execution completed.\n${playbookMessages.join("\n")}`
              : `Playbook execution aborted: ${playbookResult.errorMessage || "Unknown Error"}\n${playbookMessages.join("\n")}`
          }
        ]);

        if (!playbookResult.success) {
          setActionError(playbookResult.errorMessage || "Playbook execution failed.");
        }
        return;
      }

      if (action.actionType === "ENABLE_SMOKE_AND_GOTO_QUICKSTART") {
        enableDemoModeAndGotoQuickstart();
        return;
      }

      if (action.actionType === "GOTO_NEXT_DEMO_STEP") {
        gotoNextDemoStep();
        setMessages((prev) => [
          ...prev,
          { id: buildMessageId(), role: "system", text: "Navigated to next demo step page." }
        ]);
        return;
      }

      if (action.actionType === "EXPORT_DEMO_LOG") {
        onExportTimelineMarkdown();
        setMessages((prev) => [
          ...prev,
          { id: buildMessageId(), role: "system", text: "History Markdown exported." }
        ]);
        return;
      }

      if (action.actionType === "SHOW_CONTEXT") {
        const invoiceId = parseInvoiceIdFromPath(location.pathname) || "-";
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text:
              `Current Context:\n` +
              `Path=${location.pathname}\n` +
              `Wallet=${account?.address || "-"}\n` +
              `InvoiceId=${invoiceId}\n` +
              `StableCoinType=${appConfig.stableLayer.stableCoinType || "-"}\n` +
              `Last Digest=${lastDigest || "-"}`
          }
        ]);
        return;
      }

      if (action.actionType === "CHECK_TX_STATUS") {
        const digest =
          typeof action.payload?.digest === "string" ? action.payload.digest : lastDigest;
        if (!digest) throw new Error("Missing digest to query.");

        const status = await queryTxStatus(digest);
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text: `Tx ${status.digest}: ${status.status}${status.explorerUrl ? ` | ${status.explorerUrl}` : ""}`
          }
        ]);
        return;
      }

      if (action.actionType === "REFRESH_INVOICE") {
        const invoiceId =
          typeof action.payload?.invoiceId === "string"
            ? action.payload.invoiceId
            : parseInvoiceIdFromPath(location.pathname);
        if (!invoiceId) throw new Error("Missing Invoice ID.");

        const invoice = await queryInvoice(invoiceId);
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text: `Invoice ${invoice.objectId}: Amount=${invoice.amountU64}, Status=${invoice.status}, Buyer=${invoice.buyer || "-"}`
          }
        ]);
        return;
      }

      if (action.actionType === "SHOW_HELP") {
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "assistant",
            text: "You can ask: 'What features does this project have', 'How to demo', 'What to do next', 'Pay current invoice', 'Redeem all'."
          }
        ]);
        return;
      }

      if (isSmokeMode()) {
        if (!account) {
          throw new Error("Current action is smoke mode tx, please connect wallet first.");
        }

        const stableCoinType =
          appConfig.stableLayer.stableCoinType || "0xsmoke::brandusd::BRAND_USD";

        let smokeFeedback: SmokeTxFeedback;
        if (action.actionType === "PAY_MINT_AND_PAY") {
          const invoiceId =
            typeof action.payload?.invoiceId === "string"
              ? action.payload.invoiceId
              : parseInvoiceIdFromPath(location.pathname);
          if (!invoiceId) throw new Error("Pay action missing invoiceId.");

          const invoice = smokeGetInvoice(invoiceId);
          if (!invoice) throw new Error("Invoice not found in smoke mode, cannot pay.");

          smokeFeedback = smokePayInvoice({
            invoiceId: invoice.objectId,
            buyer: account.address,
            amountU64: invoice.amountU64
          });
        } else if (action.actionType === "REDEEM_ALL") {
          smokeFeedback = smokeBurn({
            owner: account.address,
            coinType: stableCoinType,
            mode: "all"
          });
        } else if (action.actionType === "REDEEM_AMOUNT") {
          const amount = typeof action.payload?.amount === "string" ? action.payload.amount : "1";
          smokeFeedback = smokeBurn({
            owner: account.address,
            coinType: stableCoinType,
            mode: "amount",
            amountU64: BigInt(amount)
          });
        } else if (action.actionType === "CLAIM_REVENUE") {
          smokeFeedback = smokeClaim(account.address);
        } else {
          smokeFeedback = {
            digest: "",
            status: "failure",
            explorerUrl: "",
            errorMessage: `Smoke mode does not support action: ${action.actionType}`
          };
        }

        const feedback = toTxFeedback(smokeFeedback);
        setTxFeedback(feedback);
        setPanelState((prev) => ({ ...prev, action: true }));
        setLastDigest(feedback.digest || undefined);
        setMemoryState((prev) => ({
          ...prev,
          recentDigests: feedback.digest
            ? [feedback.digest, ...(prev.recentDigests || [])].slice(0, 8)
            : prev.recentDigests
        }));

        if (feedback.status === "failure") {
          setActionError(feedback.errorMessage || "Action failed.");
        }

        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text: `Action ${action.actionType} Completed: Status ${feedback.status}, digest=${feedback.digest || "-"}`
          }
        ]);
        return;
      }

      let tx;
      if (action.actionType === "PAY_MINT_AND_PAY") {
        const invoiceId =
          typeof action.payload?.invoiceId === "string"
            ? action.payload.invoiceId
            : parseInvoiceIdFromPath(location.pathname);
        if (!invoiceId) throw new Error("Pay action missing invoiceId.");
        tx = await toolbox!.buildMintAndPayTx(invoiceId);
      } else if (action.actionType === "REDEEM_ALL") {
        tx = await toolbox!.buildBurnTx({ all: true });
      } else if (action.actionType === "REDEEM_AMOUNT") {
        const amount = typeof action.payload?.amount === "string" ? action.payload.amount : "1";
        tx = await toolbox!.buildBurnTx({ amount });
      } else if (action.actionType === "CLAIM_REVENUE") {
        tx = await toolbox!.buildClaimTx();
      } else {
        throw new Error(`Unsupported action type: ${action.actionType}`);
      }

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const feedback = await normalizeTxFeedback(result);
      setTxFeedback(feedback);
      setPanelState((prev) => ({ ...prev, action: true }));
      setLastDigest(feedback.digest || undefined);
      setMemoryState((prev) => ({
        ...prev,
        recentDigests: feedback.digest
          ? [feedback.digest, ...(prev.recentDigests || [])].slice(0, 8)
          : prev.recentDigests
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: buildMessageId(),
          role: "system",
          text: `Action ${action.actionType} Completed: Status=${feedback.status}, digest=${feedback.digest || "-"}`
        }
      ]);
    } catch (error) {
      const message = parseErrorMessage(error);
      setActionError(message);
      setPanelState((prev) => ({ ...prev, action: true }));
      setMessages((prev) => [
        ...prev,
        { id: buildMessageId(), role: "system", text: `Action Failed: ${message}` }
      ]);
    } finally {
      setActionLoadingType(null);
    }
  }

  function saveAgentConfig(): void {
    const key = agentKeyInput.trim();
    const endpoint = agentEndpoint.trim();
    const model = agentModel.trim() || appConfig.agent.model;

    if (key) localStorage.setItem(AGENT_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(AGENT_KEY_STORAGE_KEY);

    if (endpoint) localStorage.setItem(AGENT_ENDPOINT_STORAGE_KEY, endpoint);
    else localStorage.removeItem(AGENT_ENDPOINT_STORAGE_KEY);

    localStorage.setItem(AGENT_MODEL_STORAGE_KEY, model);
    localStorage.setItem(AGENT_LLM_MODE_STORAGE_KEY, llmModeEnabled ? "1" : "0");
    localStorage.setItem(AGENT_COACH_MODE_STORAGE_KEY, coachModeEnabled ? "1" : "0");
    setAgentConfigSaved(Boolean(key || endpoint));
  }

  function handleCoachToggle(next: boolean): void {
    setCoachModeEnabled(next);
    localStorage.setItem(AGENT_COACH_MODE_STORAGE_KEY, next ? "1" : "0");
  }

  function enableDemoModeAndGotoQuickstart(): void {
    setSmokeMode(true);
    navigate("/quickstart");
    setMessages((prev) => [
      ...prev,
      { id: buildMessageId(), role: "system", text: "Enabled Smoke Demo Mode and navigated to /quickstart." }
    ]);
  }

  function gotoNextDemoStep(): void {
    if (!nextDemoStep) {
      navigate("/merchant/metrics");
      return;
    }
    navigate(nextDemoStep.actionPath);
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        <span className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-100">
          {agentConfigSaved ? "Agent Config Saved" : "Agent Config Unsaved"}
        </span>
        <Button className="agent-fab" onPress={() => setOpen(true)}>
          AI Assistant
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-900/20 backdrop-blur-xl transition-all">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
              <div>
                <p className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-lg font-bold text-transparent">
                  Checkout AI Assistant
                </p>
                <p className="text-xs text-slate-400">
                  Support Project Q&A · Demo Guide · Transaction Execution
                </p>
              </div>
              <Button
                variant="ghost"
                isIconOnly
                className="rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                onPress={() => setOpen(false)}
              >
                ✕
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Card variant="secondary" className="panel-card">
                <Card.Content className="space-y-3">
                  <p className="text-xs text-slate-400">Default shows chat only. Click buttons to expand panels.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={panelState.suggestions ? "primary" : "secondary"}
                      onPress={() => togglePanel("suggestions")}
                    >
                      Suggested Actions
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.quickPrompts ? "primary" : "secondary"}
                      onPress={() => togglePanel("quickPrompts")}
                    >
                      Quick Prompts
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.timeline ? "primary" : "secondary"}
                      onPress={() => togglePanel("timeline")}
                    >
                      Timeline/History
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.coach ? "primary" : "secondary"}
                      onPress={() => togglePanel("coach")}
                    >
                      Demo Coach
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.context ? "primary" : "secondary"}
                      onPress={() => togglePanel("context")}
                    >
                      Current Context
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.config ? "primary" : "secondary"}
                      onPress={() => togglePanel("config")}
                    >
                      Agent Config
                    </Button>
                    <Button
                      size="sm"
                      variant={panelState.action ? "primary" : "secondary"}
                      onPress={() => togglePanel("action")}
                    >
                      Action Result
                    </Button>
                  </div>
                </Card.Content>
              </Card>

              <Card variant="secondary" className="panel-card">
                <Card.Content className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-sm ${message.role === "user"
                        ? "ml-8 bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 text-emerald-100 ring-1 ring-emerald-500/30"
                        : message.role === "assistant"
                          ? "mr-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 text-slate-100 ring-1 ring-white/10"
                          : "mx-4 bg-sky-500/10 text-sky-100 ring-1 ring-sky-500/20"
                        }`}
                    >
                      {message.text}
                    </div>
                  ))}
                </Card.Content>
              </Card>

              {panelState.suggestions && (
                <Card variant="secondary" className="panel-card">
                  <Card.Content className="space-y-3">
                    {!latestOutput && (
                      <p className="text-sm text-slate-400">No suggestions yet. Send a message to generate suggested actions.</p>
                    )}
                    {latestOutput && (
                      <>
                        <p className="text-sm font-semibold text-slate-100">
                          Current Suggestion ({latestOutput.intent})
                        </p>
                        <div className="space-y-2">
                          {latestOutput.steps.map((step) => (
                            <div
                              key={`${step.title}-${step.details}`}
                              className="rounded-lg border border-white/10 px-3 py-2"
                            >
                              <p className={`text-sm font-medium ${stepColor(step.status)}`}>{step.title}</p>
                              <p className="text-xs text-slate-300">{step.details}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {latestOutput.suggestedActions.map((action, index) => {
                            const disabled =
                              loading ||
                              actionLoadingType !== null ||
                              (actionNeedsWallet(action.actionType) && !account);
                            return (
                              <Button
                                key={`${action.label}-${action.actionType}`}
                                data-testid={`agent-action-${action.actionType}`}
                                variant={index === 0 ? "primary" : "secondary"}
                                isDisabled={disabled}
                                onPress={() => executeAction(action)}
                              >
                                {actionLoadingType === action.actionType ? "Working..." : action.label}
                              </Button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </Card.Content>
                </Card>
              )}

              {panelState.quickPrompts && (
                <Card variant="secondary" className="panel-card">
                  <Card.Content className="space-y-2">
                    <p className="text-xs text-slate-400">Click to send directly.</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-all hover:scale-105 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
                          onClick={() => onSend(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </Card.Content>
                </Card>
              )}

              {panelState.timeline && (
                <Card variant="secondary" className="panel-card">
                  <Card.Content className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-100">Step Timeline (Collapsible)</p>
                      <p className="text-xs text-slate-400">{timeline.length} Items</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      History is stored locally in Markdown format, can be copied/exported.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid="agent-copy-md-btn"
                        variant="secondary"
                        isDisabled={timeline.length === 0}
                        onPress={onCopyHistoryMarkdown}
                      >
                        Copy Markdown
                      </Button>
                      <Button
                        data-testid="agent-export-md-btn"
                        variant="secondary"
                        isDisabled={timeline.length === 0}
                        onPress={onExportTimelineMarkdown}
                      >
                        Export Demo Log Markdown
                      </Button>
                      <Button
                        data-testid="agent-clear-timeline-btn"
                        variant="secondary"
                        isDisabled={timeline.length === 0}
                        onPress={onClearTimeline}
                      >
                        Clear Timeline
                      </Button>
                    </div>
                    {timeline.length === 0 && (
                      <p className="text-xs text-slate-400">No records. Send a command to see it here.</p>
                    )}
                    {timeline.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left"
                          onClick={() => toggleTimelineCollapse(item.id)}
                        >
                          <span className="text-sm text-slate-100">
                            {item.output.intent} · {formatTime(item.timestampMs)}
                          </span>
                          <span className="text-xs text-slate-400">{item.collapsed ? "Expand" : "Collapse"}</span>
                        </button>
                        {!item.collapsed && (
                          <div className="space-y-2 border-t border-white/10 px-3 py-2">
                            {item.output.steps.map((step) => (
                              <div
                                key={`${item.id}-${step.title}`}
                                className="rounded bg-white/[0.03] px-2 py-1.5"
                              >
                                <p className={`text-xs font-medium ${stepColor(step.status)}`}>{step.title}</p>
                                <p className="text-xs text-slate-300">{step.details}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </Card.Content>
                </Card>
              )}

              {panelState.coach && (
                <Card variant="secondary" className="panel-card border-emerald-400/30">
                  <Card.Content className="space-y-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-emerald-200">Demo Coach Mode</p>
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={coachModeEnabled}
                          onChange={(event) => handleCoachToggle(event.currentTarget.checked)}
                        />
                        Enable
                      </label>
                    </div>
                    <p className="text-xs text-slate-300">
                      Progress: {quickstartProgress.percentage}% ({quickstartProgress.completed}/
                      {quickstartProgress.total}）
                    </p>
                    <p className="text-xs text-slate-300">
                      Next: {nextDemoStep ? nextDemoStep.title : "All steps completed"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onPress={enableDemoModeAndGotoQuickstart}>
                        Enable Smoke & Go to Quickstart
                      </Button>
                      <Button variant="secondary" onPress={gotoNextDemoStep}>
                        Skip to Next Page
                      </Button>
                      <Button variant="primary" onPress={() => onSend("Continue to next step")}>
                        Suggest Next Step
                      </Button>
                    </div>
                    <p className="text-xs text-amber-300">
                      Current Mode: {isSmokeMode() ? "Smoke Demo Mode ON" : "Real Chain Mode"}
                    </p>
                  </Card.Content>
                </Card>
              )}

              {panelState.context && (
                <Card variant="secondary" className="panel-card">
                  <Card.Content className="space-y-1 text-xs text-slate-300">
                    <p className="break-all">Wallet: {account?.address || "-"}</p>
                    <p>Current Path: {location.pathname}</p>
                    <p>InvoiceId：{parseInvoiceIdFromPath(location.pathname) || "-"}</p>
                    {!account && <ConnectWalletButton />}
                  </Card.Content>
                </Card>
              )}

              {panelState.config && (
                <Card variant="secondary" className="panel-card border-cyan-400/30">
                  <Card.Content className="space-y-3 text-xs text-slate-300">
                    <p className="text-sm font-semibold text-cyan-200">Agent Config (Local Save)</p>
                    <p>Config saved in browser localStorage only, will not be on-chain or committed to repo.</p>
                    <Input
                      aria-label="Agent endpoint"
                      placeholder="Compatible Endpoint (e.g. https://dashscope.aliyuncs.com/compatible-mode/v1)"
                      value={agentEndpoint}
                      onChange={(event) => setAgentEndpoint(event.currentTarget.value)}
                      variant="secondary"
                    />
                    <Input
                      aria-label="Agent model"
                      placeholder="Model Name (default qwen3-max)"
                      value={agentModel}
                      onChange={(event) => setAgentModel(event.currentTarget.value)}
                      variant="secondary"
                    />
                    <Input
                      aria-label="Agent key"
                      type={showAgentKey ? "text" : "password"}
                      placeholder="Enter Agent Key (e.g. sk-...)"
                      value={agentKeyInput}
                      onChange={(event) => setAgentKeyInput(event.currentTarget.value)}
                      variant="secondary"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={llmModeEnabled}
                        onChange={(event) => setLlmModeEnabled(event.currentTarget.checked)}
                      />
                      Enable LLM Enhanced Mode (Default Off)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onPress={() => setShowAgentKey((prev) => !prev)}>
                        {showAgentKey ? "Hide Key" : "Show Key"}
                      </Button>
                      <Button variant="primary" onPress={saveAgentConfig}>
                        Save Config
                      </Button>
                    </div>
                  </Card.Content>
                </Card>
              )}

              {panelState.action && (
                <Card variant="secondary" className="panel-card">
                  <Card.Content className="space-y-2 text-sm">
                    <p className="font-semibold text-slate-100">Action Result</p>
                    {!actionError && !txFeedback && <p className="text-slate-400">No action result.</p>}
                    {actionError && <p className="text-red-300">{actionError}</p>}
                    {txFeedback && (
                      <div className="space-y-1 text-slate-200">
                        <p className="break-all">Digest：{txFeedback.digest || "-"}</p>
                        <p>Status: {txFeedback.status}</p>
                        {txFeedback.explorerUrl && (
                          <a
                            className="text-emerald-300 underline"
                            href={txFeedback.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Explorer
                          </a>
                        )}
                      </div>
                    )}
                  </Card.Content>
                </Card>
              )}
            </div>

            <div className="space-y-3 border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Agent Input"
                  placeholder="Input: Features/How to demo/Next step/Pay/Redeem/Claim/Check status"
                  value={input}
                  onChange={(event) => setInput(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onSend();
                    }
                  }}
                  variant="secondary"
                />
                <Button
                  data-testid="agent-send-btn"
                  className="agent-send-btn"
                  isDisabled={loading}
                  onPress={() => onSend()}
                >
                  {loading ? "Processing..." : "Send Command"}
                </Button>
                <Button
                  variant={panelState.quickPrompts ? "primary" : "secondary"}
                  onPress={() => togglePanel("quickPrompts")}
                >
                  Quick Prompts
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
