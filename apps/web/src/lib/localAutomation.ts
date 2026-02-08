import {
  InMemoryLocalAutomationRunner,
  LocalAutomationGuard,
  LocalAutomationPlanner,
  localAutomationToMarkdown,
  type LocalAutomationContext,
  type LocalAutomationGuardResult,
  type LocalAutomationPlan,
  type LocalAutomationRunResult
} from "@vibesui/agent";

const AUTOMATION_HISTORY_KEY = "stableflow.local_automation.history.v1";

export interface LocalAutomationSession {
  id: string;
  createdAtIso: string;
  goal: string;
  plan: LocalAutomationPlan;
  guard: LocalAutomationGuardResult;
  result?: LocalAutomationRunResult;
  markdown: string;
}

export interface BuildLocalAutomationInput {
  goal: string;
  workspaceRoot: string;
  downloadsDir: string;
  dryRun: boolean;
  allowNetwork: boolean;
  allowedCommandPrefixes: string[];
}

function toContext(input: BuildLocalAutomationInput): LocalAutomationContext {
  return {
    workspaceRoot: input.workspaceRoot,
    downloadsDir: input.downloadsDir,
    dryRun: input.dryRun,
    allowNetwork: input.allowNetwork,
    allowedCommandPrefixes: input.allowedCommandPrefixes
  };
}

function safeParseHistory(raw: string | null): LocalAutomationSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalAutomationSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persistHistory(items: LocalAutomationSession[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTOMATION_HISTORY_KEY, JSON.stringify(items));
}

export function loadLocalAutomationHistory(limit = 10): LocalAutomationSession[] {
  if (typeof window === "undefined") return [];
  return safeParseHistory(window.localStorage.getItem(AUTOMATION_HISTORY_KEY)).slice(0, limit);
}

export function clearLocalAutomationHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTOMATION_HISTORY_KEY);
}

export function buildLocalAutomationPlan(input: BuildLocalAutomationInput): {
  plan: LocalAutomationPlan;
  guard: LocalAutomationGuardResult;
  markdown: string;
} {
  const context = toContext(input);
  const planner = new LocalAutomationPlanner();
  const guardEngine = new LocalAutomationGuard();

  const plan = planner.buildPlan({ goal: input.goal }, context);
  const guard = guardEngine.validate(plan, context);
  const markdown = localAutomationToMarkdown(plan, guard);

  return { plan, guard, markdown };
}

export async function runLocalAutomationPlan(
  session: Pick<LocalAutomationSession, "goal" | "plan" | "guard">,
  options: { simulate: boolean; autoApproveHighRisk: boolean }
): Promise<LocalAutomationSession> {
  const runner = new InMemoryLocalAutomationRunner();
  const result = await runner.run(session.plan, session.guard, options);
  const markdown = localAutomationToMarkdown(session.plan, session.guard, result);

  const completed: LocalAutomationSession = {
    id: `${session.plan.id}-${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    goal: session.goal,
    plan: session.plan,
    guard: session.guard,
    result,
    markdown
  };

  const history = loadLocalAutomationHistory(50);
  persistHistory([completed, ...history].slice(0, 50));
  return completed;
}

export function saveDraftLocalAutomationSession(
  input: Pick<LocalAutomationSession, "goal" | "plan" | "guard" | "markdown">
): LocalAutomationSession {
  const session: LocalAutomationSession = {
    id: `${input.plan.id}-draft-${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    goal: input.goal,
    plan: input.plan,
    guard: input.guard,
    markdown: input.markdown
  };

  const history = loadLocalAutomationHistory(50);
  persistHistory([session, ...history].slice(0, 50));
  return session;
}
