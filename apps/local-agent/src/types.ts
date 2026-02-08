import type { LocalAgentAction } from "@vibesui/agent";

export type AgentIntent = "PAY" | "REDEEM" | "CLAIM" | "STATUS" | "HELP";

export type LlmProvider = "openai" | "anthropic" | "none";

export interface AgentContext {
  invoiceId?: string;
  url?: string;
  currentPath?: string;
  stableCoinType?: string;
  balances?: Record<string, string>;
  amount?: string;
  digest?: string;
  [key: string]: unknown;
}

export interface AgentParseRequest {
  text: string;
  context?: AgentContext;
}

export interface AgentParseResponse {
  intent: AgentIntent;
  slots: Record<string, string | number | boolean>;
  confidence: number;
  reasoningBrief: string;
}

export interface AgentSuggestRequest {
  context?: AgentContext;
}

export interface AgentSuggestResponse {
  suggestedActions: LocalAgentAction[];
}

export interface LocalAgentConfig {
  domainAllowlist: string[];
  llmEnabled: boolean;
  llmProvider: LlmProvider;
}

export interface HealthResponse {
  ok: true;
  version: string;
  timestamp: string;
}

