import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type AuditAction = "agent.parse" | "agent.suggest" | "browser.open";
type AuditResult = "ok" | "error" | "fallback" | "rejected";

export interface AuditLogInput {
  action: AuditAction;
  result: AuditResult;
  url?: string;
  invoiceId?: string;
  intent?: string;
  detail?: string;
}

const AUDIT_LOG_PATH =
  process.env.LOCAL_AGENT_AUDIT_PATH?.trim() || path.resolve(process.cwd(), ".local", "audit.jsonl");

function trimText(input?: string, max = 600): string | undefined {
  if (!input) return undefined;
  return input.length > max ? `${input.slice(0, max)}...` : input;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const entry = {
    timestamp: new Date().toISOString(),
    action: input.action,
    url: trimText(input.url),
    invoiceId: trimText(input.invoiceId, 120),
    intent: trimText(input.intent, 32),
    result: input.result,
    detail: trimText(input.detail)
  };

  try {
    await mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    await appendFile(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Never break agent workflow because of audit logging failure.
  }
}

