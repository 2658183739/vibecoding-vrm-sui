import type { LocalAgentAction } from "@vibesui/agent";

export interface LocalAgentHealth {
  ok: boolean;
  version: string;
  timestamp: string;
}

export interface LocalAgentConfig {
  domainAllowlist: string[];
  llmEnabled: boolean;
  llmProvider: "none" | "openai" | "anthropic";
}

export interface LocalAgentBrowserOpenResult {
  ok: boolean;
  url: string;
  provider?: string;
  fallbackUsed?: boolean;
  warning?: string;
  method?: string;
  action?: string;
}

export interface LocalAgentSuggestContext {
  invoiceId?: string;
  url?: string;
  balances?: Record<string, string>;
  stableCoinType?: string;
  amount?: string;
  digest?: string;
}

export interface LocalAgentSuggestResponse {
  suggestedActions: LocalAgentAction[];
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

interface ErrorPayload {
  error?: string;
  message?: string;
}

export class LocalAgentRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LocalAgentRequestError";
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "http://localhost:3777";
const DEFAULT_TIMEOUT_MS = 8_000;

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_LOCAL_AGENT_BASE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }
  return DEFAULT_BASE_URL;
}

function withTimeout(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => {
    clearTimeout(timer);
    originalAbort();
  };
  return controller;
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = withTimeout(timeoutMs);
  const url = `${resolveBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const payload = await parseJsonSafe<ErrorPayload>(response);
      throw new LocalAgentRequestError(
        payload?.error || payload?.message || `Local Agent request failed (${response.status})`,
        response.status
      );
    }

    const data = await parseJsonSafe<T>(response);
    if (data === null) {
      throw new LocalAgentRequestError("Local Agent returned an invalid JSON response.");
    }
    return data;
  } catch (error) {
    if (error instanceof LocalAgentRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LocalAgentRequestError("Request timed out. Local Agent did not respond.");
    }
    if (error instanceof TypeError) {
      throw new LocalAgentRequestError(
        "Connection failed. Ensure Local Agent is running at http://localhost:3777."
      );
    }
    throw new LocalAgentRequestError(error instanceof Error ? error.message : "Unknown Local Agent error.");
  } finally {
    controller.abort();
  }
}

export async function getLocalAgentHealth(): Promise<LocalAgentHealth> {
  return request<LocalAgentHealth>("/health", { method: "GET", timeoutMs: 4_000 });
}

export async function getLocalAgentConfig(): Promise<LocalAgentConfig> {
  return request<LocalAgentConfig>("/config", { method: "GET" });
}

export async function updateLocalAgentConfig(input: {
  domainAllowlist?: string[];
  llmEnabled?: boolean;
  llmProvider?: "none" | "openai" | "anthropic";
}): Promise<LocalAgentConfig> {
  return request<LocalAgentConfig>("/config", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getLocalAgentSuggestions(
  context: LocalAgentSuggestContext
): Promise<LocalAgentSuggestResponse> {
  return request<LocalAgentSuggestResponse>("/agent/suggest", {
    method: "POST",
    body: JSON.stringify({ context })
  });
}

export async function openInControlledBrowser(url: string): Promise<LocalAgentBrowserOpenResult> {
  return request<LocalAgentBrowserOpenResult>("/browser/open", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

