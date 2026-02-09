import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, sanitizeConfigPatch, updateConfig } from "./configStore.js";
import { parseWithLlm } from "./llm.js";
import { parseWithRules, suggestWithRules } from "./ruleEngine.js";
import { isOriginAllowed, isUrlAllowed } from "./security.js";
import { OpenClawBrowserAdapter, OpenClawCommandError } from "./browser/OpenClawBrowserAdapter.js";
import { SystemBrowserAdapter } from "./browser/SystemBrowserAdapter.js";
import { writeAuditLog } from "./auditLog.js";
import { loadLocalEnvFiles } from "./loadEnv.js";
import { readVersion } from "./version.js";
import type {
  AgentContext,
  AgentIntent,
  AgentParseRequest,
  AgentParseResponse,
  AgentSuggestRequest,
  HealthResponse,
  LocalAgentConfig
} from "./types.js";

loadLocalEnvFiles();

const port = Number(process.env.LOCAL_AGENT_PORT || process.env.PORT || 3777);
const version = readVersion();
const openClawBrowserAdapter = new OpenClawBrowserAdapter();
const systemBrowserAdapter = new SystemBrowserAdapter();
const llmApiKey = process.env.LLM_API_KEY?.trim();
const llmModel = process.env.LLM_MODEL?.trim();
const ALLOWED_INTENTS = new Set<AgentIntent>(["PAY", "REDEEM", "CLAIM", "STATUS", "HELP"]);

function configResponse(config: LocalAgentConfig) {
  return {
    domainAllowlist: config.domainAllowlist,
    llmEnabled: config.llmEnabled,
    llmProvider: config.llmProvider
  };
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function writeError(res: ServerResponse, statusCode: number, message: string): void {
  writeJson(res, statusCode, { ok: false, error: message });
}

function normalizeOpenClawError(error: unknown): string {
  if (error instanceof OpenClawCommandError) {
    const stderr = error.details?.stderr;
    const stdout = error.details?.stdout;
    const detail = stderr || stdout || "";
    if (detail) return `${error.message} ${detail}`.trim();
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown OpenClaw error";
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += next.length;
    if (total > 1_000_000) {
      throw new Error("Request body too large (>1MB).");
    }
    chunks.push(next);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowlist: string[]
): { allowed: boolean; hasOrigin: boolean } {
  const origin = req.headers.origin;
  if (!origin) return { allowed: true, hasOrigin: false };

  const allowed = isOriginAllowed(origin, allowlist);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  return { allowed, hasOrigin: true };
}

function normalizeContext(input: unknown): AgentContext {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as AgentContext;
}

function readUrlFromContext(context?: AgentContext): string | undefined {
  if (!context || typeof context.url !== "string") return undefined;
  const value = context.url.trim();
  return value || undefined;
}

function readInvoiceIdFromContext(context?: AgentContext): string | undefined {
  if (!context || typeof context.invoiceId !== "string") return undefined;
  const value = context.invoiceId.trim();
  return value || undefined;
}

function sanitizeParseResult(
  candidate: AgentParseResponse | null | undefined,
  fallback: AgentParseResponse
): AgentParseResponse {
  if (!candidate) return fallback;

  const normalizedIntent =
    typeof candidate.intent === "string" ? candidate.intent.toUpperCase() : fallback.intent;
  if (!ALLOWED_INTENTS.has(normalizedIntent as AgentIntent)) {
    return {
      ...fallback,
      intent: "HELP",
      reasoningBrief: `${fallback.reasoningBrief} (Intent not allowlisted, forced to HELP)`
    };
  }

  const nextSlots =
    candidate.slots && typeof candidate.slots === "object" && !Array.isArray(candidate.slots)
      ? candidate.slots
      : fallback.slots;
  const nextConfidence =
    typeof candidate.confidence === "number"
      ? Math.max(0, Math.min(1, candidate.confidence))
      : fallback.confidence;
  const nextReasoning =
    typeof candidate.reasoningBrief === "string" && candidate.reasoningBrief.trim()
      ? candidate.reasoningBrief.trim()
      : fallback.reasoningBrief;

  return {
    intent: normalizedIntent as AgentIntent,
    slots: nextSlots,
    confidence: nextConfidence,
    reasoningBrief: nextReasoning
  };
}

function pickTarget(body: Record<string, unknown>): string {
  const candidates = [body.target, body.ref, body.selector];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function ensureActiveTabAllowed(allowlist: string[]): Promise<string> {
  const currentUrl = await openClawBrowserAdapter.getActiveUrl();
  if (!currentUrl) {
    throw new Error("Cannot verify current tab URL from OpenClaw. Open a dApp URL first.");
  }

  const allowed = isUrlAllowed(currentUrl, allowlist);
  if (!allowed.allowed) {
    throw new Error(`Current tab is blocked by allowlist: ${currentUrl}`);
  }

  return allowed.normalizedUrl;
}

const loaded = await loadConfig();
let runtimeConfig = loaded;

const server = createServer(async (req, res) => {
  const corsState = setCorsHeaders(req, res, runtimeConfig.config.domainAllowlist);
  if (req.method === "OPTIONS") {
    if (corsState.hasOrigin && !corsState.allowed) {
      writeError(res, 403, "Origin is not in allowlist.");
      return;
    }
    writeJson(res, 200, { ok: true });
    return;
  }

  if (corsState.hasOrigin && !corsState.allowed) {
    writeError(res, 403, "Origin is not in allowlist.");
    return;
  }

  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (method === "GET" && pathname === "/") {
      writeJson(res, 200, {
        ok: true,
        service: "VibeSui Local Agent",
        version,
        status: "running",
        docs: "https://github.com/2658183739/vibecoding-vrm-sui"
      });
      return;
    }

    if (method === "GET" && pathname === "/health") {
      const payload: HealthResponse = {
        ok: true,
        version,
        timestamp: new Date().toISOString()
      };
      writeJson(res, 200, payload);
      return;
    }

    if (method === "GET" && pathname === "/config") {
      writeJson(res, 200, configResponse(runtimeConfig.config));
      return;
    }

    if (method === "POST" && pathname === "/config") {
      const body = await readJsonBody(req);
      const patch = sanitizeConfigPatch(body);
      runtimeConfig = await updateConfig(runtimeConfig, patch);
      writeJson(res, 200, configResponse(runtimeConfig.config));
      return;
    }

    if (method === "POST" && pathname === "/agent/parse") {
      const body = (await readJsonBody(req)) as Partial<AgentParseRequest>;
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const context = normalizeContext(body.context);
      if (!text) {
        await writeAuditLog({
          action: "agent.parse",
          result: "rejected",
          url: readUrlFromContext(context),
          invoiceId: readInvoiceIdFromContext(context),
          detail: "Missing text."
        });
        writeError(res, 400, "Missing text.");
        return;
      }

      const input: AgentParseRequest = { text, context };
      const ruleResult = parseWithRules(input);

      const requestedProvider =
        typeof body.provider === "string" ? body.provider : runtimeConfig.config.llmProvider;
      const requestedKey = typeof body.apiKey === "string" && body.apiKey ? body.apiKey : llmApiKey;
      const requestedModel =
        typeof body.model === "string" && body.model ? body.model : llmModel;

      const canUseLlm = requestedProvider !== "none" && Boolean(requestedKey);

      if (!canUseLlm) {
        const safeOutput = sanitizeParseResult(ruleResult, ruleResult);
        await writeAuditLog({
          action: "agent.parse",
          result: "ok",
          url: readUrlFromContext(context),
          invoiceId: readInvoiceIdFromContext(context),
          intent: safeOutput.intent
        });
        writeJson(res, 200, safeOutput);
        return;
      }

      const llmResult = await parseWithLlm({
        provider: requestedProvider,
        apiKey: requestedKey,
        model: requestedModel,
        userInput: input
      });

      if (!llmResult) {
        const safeOutput = sanitizeParseResult(
          {
            ...ruleResult,
            reasoningBrief: `${ruleResult.reasoningBrief} (LLM unavailable, fallback to rules)`
          },
          ruleResult
        );
        await writeAuditLog({
          action: "agent.parse",
          result: "ok",
          url: readUrlFromContext(context),
          invoiceId: readInvoiceIdFromContext(context),
          intent: safeOutput.intent
        });
        writeJson(res, 200, safeOutput);
        return;
      }

      const safeOutput = sanitizeParseResult(llmResult, ruleResult);
      await writeAuditLog({
        action: "agent.parse",
        result: "ok",
        url: readUrlFromContext(context),
        invoiceId: readInvoiceIdFromContext(context),
        intent: safeOutput.intent
      });
      writeJson(res, 200, safeOutput);
      return;
    }

    if (method === "POST" && pathname === "/agent/suggest") {
      const body = (await readJsonBody(req)) as Partial<AgentSuggestRequest>;
      const context = normalizeContext(body.context);
      const output = suggestWithRules(context);
      await writeAuditLog({
        action: "agent.suggest",
        result: "ok",
        url: readUrlFromContext(context),
        invoiceId: readInvoiceIdFromContext(context),
        detail: `actions=${output.suggestedActions.length}`
      });
      writeJson(res, 200, output);
      return;
    }

    if (method === "POST" && pathname === "/browser/open") {
      const body = (await readJsonBody(req)) as { url?: unknown };
      if (typeof body.url !== "string" || !body.url.trim()) {
        await writeAuditLog({
          action: "browser.open",
          result: "rejected",
          detail: "Missing url."
        });
        writeError(res, 400, "Missing url.");
        return;
      }

      const allowed = isUrlAllowed(body.url, runtimeConfig.config.domainAllowlist);
      if (!allowed.allowed) {
        await writeAuditLog({
          action: "browser.open",
          result: "rejected",
          url: body.url,
          detail: allowed.reason
        });
        writeError(res, 403, allowed.reason);
        return;
      }

      try {
        const opened = await openClawBrowserAdapter.open(allowed.normalizedUrl);
        await writeAuditLog({
          action: "browser.open",
          result: "ok",
          url: allowed.normalizedUrl
        });
        writeJson(res, 200, {
          ok: true,
          url: allowed.normalizedUrl,
          provider: "openclaw",
          fallbackUsed: false,
          ...opened
        });
      } catch (error) {
        const warning = normalizeOpenClawError(error);
        const fallback = await systemBrowserAdapter.open(allowed.normalizedUrl);
        await writeAuditLog({
          action: "browser.open",
          result: "fallback",
          url: allowed.normalizedUrl,
          detail: warning
        });
        writeJson(res, 200, {
          ok: true,
          url: allowed.normalizedUrl,
          provider: "system-fallback",
          fallbackUsed: true,
          warning,
          ...fallback
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/browser/click") {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const target = pickTarget(body);
      const fallbackUrl = typeof body.url === "string" ? body.url.trim() : "";
      if (!target) {
        writeError(res, 400, "Missing target/ref/selector.");
        return;
      }

      try {
        const currentUrl = await ensureActiveTabAllowed(runtimeConfig.config.domainAllowlist);
        const clicked = await openClawBrowserAdapter.click(target);
        writeJson(res, 200, {
          ok: true,
          provider: "openclaw",
          fallbackUsed: false,
          currentUrl,
          ...clicked
        });
      } catch (error) {
        const warning = normalizeOpenClawError(error);
        if (!fallbackUrl) {
          writeError(res, 502, warning);
          return;
        }
        const fallbackAllowed = isUrlAllowed(fallbackUrl, runtimeConfig.config.domainAllowlist);
        if (!fallbackAllowed.allowed) {
          writeError(res, 403, fallbackAllowed.reason);
          return;
        }
        const fallback = await systemBrowserAdapter.open(fallbackAllowed.normalizedUrl);
        writeJson(res, 200, {
          ok: true,
          provider: "system-fallback",
          fallbackUsed: true,
          warning,
          currentUrl: fallbackAllowed.normalizedUrl,
          ...fallback
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/browser/type") {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const target = pickTarget(body);
      const fallbackUrl = typeof body.url === "string" ? body.url.trim() : "";
      const text = typeof body.text === "string" ? body.text : "";
      if (!target) {
        writeError(res, 400, "Missing target/ref/selector.");
        return;
      }
      if (!text) {
        writeError(res, 400, "Missing text.");
        return;
      }

      try {
        const currentUrl = await ensureActiveTabAllowed(runtimeConfig.config.domainAllowlist);
        const typed = await openClawBrowserAdapter.type(target, text);
        writeJson(res, 200, {
          ok: true,
          provider: "openclaw",
          fallbackUsed: false,
          currentUrl,
          ...typed
        });
      } catch (error) {
        const warning = normalizeOpenClawError(error);
        if (!fallbackUrl) {
          writeError(res, 502, warning);
          return;
        }
        const fallbackAllowed = isUrlAllowed(fallbackUrl, runtimeConfig.config.domainAllowlist);
        if (!fallbackAllowed.allowed) {
          writeError(res, 403, fallbackAllowed.reason);
          return;
        }
        const fallback = await systemBrowserAdapter.open(fallbackAllowed.normalizedUrl);
        writeJson(res, 200, {
          ok: true,
          provider: "system-fallback",
          fallbackUsed: true,
          warning,
          currentUrl: fallbackAllowed.normalizedUrl,
          ...fallback
        });
      }
      return;
    }

    writeError(res, 404, `Route not found: ${method} ${pathname}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (method === "POST" && pathname === "/agent/parse") {
      await writeAuditLog({ action: "agent.parse", result: "error", detail: message });
    } else if (method === "POST" && pathname === "/agent/suggest") {
      await writeAuditLog({ action: "agent.suggest", result: "error", detail: message });
    } else if (method === "POST" && pathname === "/browser/open") {
      await writeAuditLog({ action: "browser.open", result: "error", detail: message });
    }
    writeError(res, 500, message);
  }
});

server.listen(port, "127.0.0.1", () => {
  // Never log keys or private wallet material.
  console.log(`[local-agent] running at http://127.0.0.1:${port}`);
  console.log(`[local-agent] config file: ${runtimeConfig.filePath}`);
  console.log(
    `[local-agent] llm: ${runtimeConfig.config.llmEnabled ? runtimeConfig.config.llmProvider : "disabled"}`
  );
});
