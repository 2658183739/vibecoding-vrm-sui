import type { LocalAgentAction } from "@vibesui/agent";
import type { AgentContext, AgentIntent, AgentParseRequest, AgentParseResponse, AgentSuggestResponse } from "./types.js";

const PAY_KEYWORDS = [
  "pay",
  "invoice",
  "checkout",
  "mint",
  "payment",
  "支付",
  "发票",
  "账单",
  "付款",
  "买单"
];
const REDEEM_KEYWORDS = [
  "redeem",
  "burn",
  "withdraw",
  "cashout",
  "赎回",
  "销毁",
  "提现",
  "t+1"
];
const CLAIM_KEYWORDS = ["claim", "revenue", "reward", "collect", "领取", "收益", "结算"];
const STATUS_KEYWORDS = [
  "status",
  "digest",
  "tx",
  "transaction",
  "progress",
  "状态",
  "进度",
  "交易状态"
];
const HELP_KEYWORDS = ["help", "how", "guide", "feature", "what can you do", "帮助", "怎么", "如何"];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((word) => text.includes(word));
}

function scoreIntent(text: string, keywords: string[]): number {
  return keywords.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
}

function extractAmountFromText(text: string): string | undefined {
  const matches = [...text.matchAll(/\b\d+(\.\d+)?\b/g)];
  for (const match of matches) {
    const value = match[0];
    const index = match.index ?? -1;
    if (index < 0) continue;
    const prev2 = text.slice(Math.max(0, index - 2), index).toLowerCase();
    if (prev2 === "t+") continue;
    return value;
  }
  return undefined;
}

function detectIntent(text: string): AgentIntent {
  const normalized = text.toLowerCase().trim();
  const scored: Array<{ intent: AgentIntent; score: number }> = [
    { intent: "PAY", score: scoreIntent(normalized, PAY_KEYWORDS) },
    { intent: "REDEEM", score: scoreIntent(normalized, REDEEM_KEYWORDS) },
    { intent: "CLAIM", score: scoreIntent(normalized, CLAIM_KEYWORDS) },
    { intent: "STATUS", score: scoreIntent(normalized, STATUS_KEYWORDS) },
    { intent: "HELP", score: scoreIntent(normalized, HELP_KEYWORDS) }
  ];

  scored.sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > 0) return scored[0].intent;
  return "HELP";
}

function extractSlots(
  text: string,
  context?: AgentParseRequest["context"]
): Record<string, string | number | boolean> {
  const slots: Record<string, string | number | boolean> = {};
  const normalized = text.toLowerCase();

  if (context?.invoiceId) slots.invoiceId = context.invoiceId;
  if (context?.stableCoinType) slots.stableCoinType = context.stableCoinType;
  if (context?.digest) slots.digest = context.digest;

  const invoiceMatch = text.match(/0x[a-fA-F0-9]{16,}/);
  if (invoiceMatch) slots.invoiceId = invoiceMatch[0];

  const digestMatch = text.match(
    /(?:digest|tx|hash|交易hash|交易哈希|交易)\s*[:：]?\s*([A-Za-z0-9]{20,120})/i
  );
  if (digestMatch?.[1]) slots.digest = digestMatch[1];

  const amountMatch = extractAmountFromText(text);
  if (amountMatch) slots.amount = amountMatch;

  const allFlag =
    normalized.includes("all") ||
    normalized.includes("full amount") ||
    normalized.includes("全部") ||
    normalized.includes("全额");
  if (allFlag) slots.all = true;

  if (context?.currentPath) slots.currentPath = context.currentPath;
  if (context?.url) slots.url = context.url;

  return slots;
}

function reasoning(intent: AgentIntent, text: string): string {
  if (intent === "PAY") return `Matched payment keywords. Text: ${text.slice(0, 80)}`;
  if (intent === "REDEEM") return `Matched redeem keywords. Text: ${text.slice(0, 80)}`;
  if (intent === "CLAIM") return `Matched claim keywords. Text: ${text.slice(0, 80)}`;
  if (intent === "STATUS") return `Matched status keywords. Text: ${text.slice(0, 80)}`;
  return "No strong transaction keyword matched, fallback to HELP.";
}

function confidenceForIntent(intent: AgentIntent, text: string): number {
  const normalized = text.toLowerCase();
  if (intent === "PAY") return includesAny(normalized, PAY_KEYWORDS) ? 0.9 : 0.6;
  if (intent === "REDEEM") return includesAny(normalized, REDEEM_KEYWORDS) ? 0.88 : 0.6;
  if (intent === "CLAIM") return includesAny(normalized, CLAIM_KEYWORDS) ? 0.85 : 0.6;
  if (intent === "STATUS") return includesAny(normalized, STATUS_KEYWORDS) ? 0.82 : 0.55;
  return 0.5;
}

function parseBigIntSafe(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return BigInt(Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function detectLikelyInsufficientBalance(context?: AgentContext): boolean {
  if (!context) return false;

  const required = parseBigIntSafe(context.amount);
  if (!required || required <= 0n) return false;

  const balances = context.balances || {};
  const values = Object.values(balances)
    .map((item) => parseBigIntSafe(item))
    .filter((item): item is bigint => item !== null);

  if (values.length === 0) return false;

  const maxBalance = values.reduce((max, item) => (item > max ? item : max), 0n);
  return maxBalance < required;
}

function defaultInvoiceUrl(context?: AgentContext): string {
  if (context?.url && context.url.trim()) return context.url.trim();
  if (context?.invoiceId) return `http://localhost:5173/#/pay/${context.invoiceId}`;
  return "http://localhost:5173/#/quickstart";
}

export function parseWithRules(input: AgentParseRequest): AgentParseResponse {
  const text = input.text?.trim() || "";
  const intent = detectIntent(text);
  return {
    intent,
    slots: extractSlots(text, input.context),
    confidence: confidenceForIntent(intent, text),
    reasoningBrief: reasoning(intent, text)
  };
}

export function suggestWithRules(context: AgentParseRequest["context"]): AgentSuggestResponse {
  const actions: LocalAgentAction[] = [];

  if (context?.invoiceId) {
    actions.push({
      type: "OPEN_URL",
      label: "Open current invoice URL",
      payload: { url: defaultInvoiceUrl(context), invoiceId: context.invoiceId }
    });
    actions.push({
      type: "MINT_AND_PAY",
      label: "Run one-click Mint+Pay",
      payload: {
        invoiceId: context.invoiceId,
        stableCoinType: context.stableCoinType,
        amount: context.amount
      }
    });

    if (detectLikelyInsufficientBalance(context)) {
      actions.push({
        type: "OPEN_URL",
        label: "Balance hint: top up funds first",
        payload: { url: defaultInvoiceUrl(context) },
        disabledReason: "Likely insufficient balance for current invoice amount."
      });
    }

    return { suggestedActions: actions };
  }

  actions.push({
    type: "OPEN_URL",
    label: "Open quickstart",
    payload: { url: "http://localhost:5173/#/quickstart" }
  });
  actions.push({
    type: "CLAIM",
    label: "Go to claim flow",
    payload: {}
  });
  actions.push({
    type: "BURN",
    label: "Go to redeem flow",
    payload: {}
  });

  return { suggestedActions: actions };
}
