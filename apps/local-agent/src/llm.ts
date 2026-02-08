import type { AgentIntent, AgentParseRequest, AgentParseResponse, LlmProvider } from "./types.js";

const ALLOWED_INTENTS: AgentIntent[] = ["PAY", "REDEEM", "CLAIM", "STATUS", "HELP"];
const ALLOWED_SLOT_KEYS = new Set([
  "invoiceId",
  "amount",
  "all",
  "digest",
  "stableCoinType",
  "url",
  "currentPath"
]);

function ensureIntent(input: unknown): AgentIntent | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (ALLOWED_INTENTS.includes(normalized as AgentIntent)) return normalized as AgentIntent;
  return null;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizePrimitive(raw: unknown): string | number | boolean | null {
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  return null;
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

function extractExplicitSignals(input: AgentParseRequest): {
  invoiceId?: string;
  amount?: string;
  digest?: string;
  stableCoinType?: string;
  allRequested: boolean;
} {
  const text = input.text || "";
  const normalized = text.toLowerCase();

  const invoiceMatch = text.match(/0x[a-fA-F0-9]{16,}/);
  const amountMatch = extractAmountFromText(text);
  const stableCoinTypeMatch = text.match(/0x[a-fA-F0-9]+::[a-zA-Z_][\w]*::[a-zA-Z_][\w]*/);
  const digestMatch = text.match(/(?:digest|tx|hash|交易hash|交易哈希|交易)\s*[:：]?\s*([A-Za-z0-9]{20,120})/i);

  return {
    invoiceId: invoiceMatch?.[0],
    amount: amountMatch,
    digest: digestMatch?.[1],
    stableCoinType: stableCoinTypeMatch?.[0],
    allRequested:
      normalized.includes("all") ||
      normalized.includes("full amount") ||
      normalized.includes("全部") ||
      normalized.includes("全额")
  };
}

function sanitizeSlots(
  value: unknown,
  input: AgentParseRequest
): { slots: Record<string, string | number | boolean>; unsafeDetected: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { slots: {}, unsafeDetected: false };
  }

  const explicit = extractExplicitSignals(input);
  const context = input.context || {};
  const slots: Record<string, string | number | boolean> = {};
  let unsafeDetected = false;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_SLOT_KEYS.has(key)) {
      unsafeDetected = true;
      continue;
    }

    const normalizedRaw = normalizePrimitive(raw);
    if (normalizedRaw === null) {
      unsafeDetected = true;
      continue;
    }

    if (key === "amount") {
      const amount = typeof normalizedRaw === "number" ? String(normalizedRaw) : String(normalizedRaw);
      if (explicit.amount && amount === explicit.amount) {
        slots.amount = amount;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "invoiceId") {
      if (typeof normalizedRaw !== "string") {
        unsafeDetected = true;
      } else if (
        (explicit.invoiceId && normalizedRaw === explicit.invoiceId) ||
        (typeof context.invoiceId === "string" && normalizedRaw === context.invoiceId)
      ) {
        slots.invoiceId = normalizedRaw;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "digest") {
      if (typeof normalizedRaw !== "string") {
        unsafeDetected = true;
      } else if (
        (explicit.digest && normalizedRaw === explicit.digest) ||
        (typeof context.digest === "string" && normalizedRaw === context.digest)
      ) {
        slots.digest = normalizedRaw;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "stableCoinType") {
      if (typeof normalizedRaw !== "string") {
        unsafeDetected = true;
      } else if (
        (explicit.stableCoinType && normalizedRaw === explicit.stableCoinType) ||
        (typeof context.stableCoinType === "string" && normalizedRaw === context.stableCoinType)
      ) {
        slots.stableCoinType = normalizedRaw;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "all") {
      if (typeof normalizedRaw === "boolean" && normalizedRaw && explicit.allRequested) {
        slots.all = true;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "url") {
      if (
        typeof normalizedRaw === "string" &&
        typeof context.url === "string" &&
        normalizedRaw === context.url
      ) {
        slots.url = normalizedRaw;
      } else {
        unsafeDetected = true;
      }
      continue;
    }

    if (key === "currentPath") {
      if (
        typeof normalizedRaw === "string" &&
        typeof context.currentPath === "string" &&
        normalizedRaw === context.currentPath
      ) {
        slots.currentPath = normalizedRaw;
      } else {
        unsafeDetected = true;
      }
      continue;
    }
  }

  return { slots, unsafeDetected };
}

function normalizeLlmOutput(raw: unknown, input: AgentParseRequest): AgentParseResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const intent = ensureIntent(obj.intent);
  if (!intent) return null;

  const sanitized = sanitizeSlots(obj.slots, input);
  if (sanitized.unsafeDetected) return null;

  return {
    intent,
    slots: sanitized.slots,
    confidence: clampConfidence(obj.confidence),
    reasoningBrief:
      typeof obj.reasoningBrief === "string" && obj.reasoningBrief.trim()
        ? obj.reasoningBrief.trim()
        : "LLM returned validated structured intent output."
  };
}

function parseJsonPayload(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return parseJsonPayload(text.slice(start, end + 1));
}

export interface LlmParseInput {
  provider: LlmProvider;
  apiKey?: string;
  model?: string;
  userInput: AgentParseRequest;
}

function buildPrompt(input: AgentParseRequest): string {
  return JSON.stringify(
    {
      task: "Parse user intent for Sui payment assistant (intent + slots only)",
      allowedIntents: ALLOWED_INTENTS,
      allowedSlots: [...ALLOWED_SLOT_KEYS],
      strictRules: [
        "Never generate transaction or tool instructions.",
        "Never infer amount/address/digest not explicitly present in user text.",
        "Return JSON only."
      ],
      userText: input.text,
      context: input.context || {}
    },
    null,
    2
  );
}

async function callOpenAi(input: LlmParseInput): Promise<unknown> {
  const model = input.model || process.env.LLM_MODEL || "gpt-4o-mini";
  const response = await fetch(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Return JSON only: {intent,slots,confidence,reasoningBrief}. " +
            "intent must be one of PAY,REDEEM,CLAIM,STATUS,HELP. " +
            "Do not generate transaction steps. Do not infer amount/address/digest."
        },
        { role: "user", content: buildPrompt(input.userInput) }
      ]
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || "";
  return extractFirstJsonObject(content);
}

async function callAnthropic(input: LlmParseInput): Promise<unknown> {
  const model = input.model || process.env.LLM_MODEL || "claude-3-5-sonnet-latest";
  const response = await fetch(
    process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": input.apiKey || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0,
        system:
          "Return JSON only: {intent,slots,confidence,reasoningBrief}. " +
          "intent must be one of PAY,REDEEM,CLAIM,STATUS,HELP. " +
          "Do not generate transaction steps. Do not infer amount/address/digest.",
        messages: [{ role: "user", content: buildPrompt(input.userInput) }]
      }),
      signal: AbortSignal.timeout(10_000)
    }
  );

  if (!response.ok) return null;
  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((item) => item.type === "text")?.text || "";
  return extractFirstJsonObject(text);
}

export async function parseWithLlm(input: LlmParseInput): Promise<AgentParseResponse | null> {
  if (!input.apiKey || input.provider === "none") return null;

  try {
    const raw = input.provider === "openai" ? await callOpenAi(input) : await callAnthropic(input);
    return normalizeLlmOutput(raw, input.userInput);
  } catch {
    return null;
  }
}
