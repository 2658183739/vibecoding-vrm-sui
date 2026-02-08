export type LocalAutomationIntent =
  | "WORKSPACE_CLEANUP"
  | "MEDIA_PIPELINE"
  | "GIT_MAINTENANCE"
  | "BACKUP_ARCHIVE"
  | "WEB_AUTOMATION";

export type LocalRiskLevel = "low" | "medium" | "high";

export type LocalStepKind = "shell" | "file" | "git" | "browser";

export interface LocalAutomationRequest {
  goal: string;
  preferredMode?: "safe" | "balanced" | "aggressive";
}

export interface LocalAutomationContext {
  workspaceRoot: string;
  downloadsDir?: string;
  dryRun: boolean;
  allowNetwork: boolean;
  allowedCommandPrefixes: string[];
}

export interface LocalAutomationStep {
  id: string;
  title: string;
  details: string;
  kind: LocalStepKind;
  risk: LocalRiskLevel;
  requiresApproval: boolean;
  command?: string;
  args?: string[];
  workingDirectory?: string;
  fallback?: string;
}

export interface LocalAutomationPlan {
  id: string;
  intent: LocalAutomationIntent;
  summary: string;
  steps: LocalAutomationStep[];
  warnings: string[];
  estimatedMinutes: number;
  createdAtIso: string;
}

export interface LocalAutomationGuardResult {
  safe: boolean;
  blockedReasons: string[];
  warnings: string[];
}

export interface LocalAutomationRunRecord {
  stepId: string;
  status: "completed" | "blocked";
  output: string;
  command?: string;
}

export interface LocalAutomationRunResult {
  planId: string;
  status: "completed" | "blocked";
  records: LocalAutomationRunRecord[];
  blockedReasons: string[];
}

function buildPlanId(): string {
  return `lap_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((item) => text.includes(item));
}

function detectIntent(goal: string): LocalAutomationIntent {
  const text = normalize(goal);

  if (includesAny(text, ["download", "organize", "archive", "clean", "cleanup"])) {
    return "WORKSPACE_CLEANUP";
  }
  if (includesAny(text, ["ffmpeg", "transcode", "video", "audio", "media"])) {
    return "MEDIA_PIPELINE";
  }
  if (includesAny(text, ["git", "repo", "branch", "pull", "commit"])) {
    return "GIT_MAINTENANCE";
  }
  if (includesAny(text, ["backup", "compress", "archive", "zip"])) {
    return "BACKUP_ARCHIVE";
  }
  return "WEB_AUTOMATION";
}

function estimateMinutes(intent: LocalAutomationIntent): number {
  if (intent === "WORKSPACE_CLEANUP") return 6;
  if (intent === "MEDIA_PIPELINE") return 8;
  if (intent === "GIT_MAINTENANCE") return 5;
  if (intent === "BACKUP_ARCHIVE") return 7;
  return 10;
}

function firstWord(command: string): string {
  return command.trim().split(/\s+/)[0] || "";
}

function buildPlanSummary(intent: LocalAutomationIntent): string {
  if (intent === "WORKSPACE_CLEANUP") {
    return "Scan download directory, organize by type, and generate change report.";
  }
  if (intent === "MEDIA_PIPELINE") {
    return "Execute media batch processing (transcode/compress) and keep original file list.";
  }
  if (intent === "GIT_MAINTENANCE") {
    return "Check repo status, sync remote, and generate auditable change log.";
  }
  if (intent === "BACKUP_ARCHIVE") {
    return "Create incremental backup of workspace and output checksums.";
  }
  return "Execute controlled browser automation steps and produce operation replay record.";
}

function buildWarnings(context: LocalAutomationContext, intent: LocalAutomationIntent): string[] {
  const warnings: string[] = [];

  if (context.dryRun) {
    warnings.push("Current mode is Dry Run. Simulation only, no local files will be written.");
  }
  if (!context.allowNetwork && (intent === "WEB_AUTOMATION" || intent === "GIT_MAINTENANCE")) {
    warnings.push("Network capability disabled. Online steps will be blocked.");
  }
  if (context.allowedCommandPrefixes.length === 0) {
    warnings.push("No allowed command prefixes configured. All shell steps will be blocked.");
  }

  return warnings;
}

export class LocalAutomationPlanner {
  buildPlan(
    request: LocalAutomationRequest,
    context: LocalAutomationContext
  ): LocalAutomationPlan {
    const intent = detectIntent(request.goal);
    const createdAtIso = new Date().toISOString();
    const warnings = buildWarnings(context, intent);
    const steps = this.buildSteps(intent, context);

    return {
      id: buildPlanId(),
      intent,
      summary: buildPlanSummary(intent),
      steps,
      warnings,
      estimatedMinutes: estimateMinutes(intent),
      createdAtIso
    };
  }

  private buildSteps(
    intent: LocalAutomationIntent,
    context: LocalAutomationContext
  ): LocalAutomationStep[] {
    if (intent === "WORKSPACE_CLEANUP") {
      return [
        {
          id: "scan-downloads",
          title: "Scan Downloads Directory",
          details: "List new files from last 7 days grouped by extension.",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "organize-files",
          title: "Execute Organization",
          details: "Archive to subdirectories (images/docs/archives), keeping conflicting files.",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "node tools/local-agent/organize-downloads.js",
          workingDirectory: context.workspaceRoot
        },
        {
          id: "report-result",
          title: "Generate Report",
          details: "Output Markdown report with before/after statistics.",
          kind: "file",
          risk: "low",
          requiresApproval: false
        }
      ];
    }

    if (intent === "MEDIA_PIPELINE") {
      return [
        {
          id: "discover-media",
          title: "Discover Media Files",
          details: "Scan target directory for mp4/mov/mkv/wav files.",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "transcode",
          title: "Execute Transcode Task",
          details: "Call ffmpeg to generate unified encoding format.",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "ffmpeg -version",
          fallback: "If ffmpeg not found, prompt installation and abort."
        },
        {
          id: "checksum",
          title: "Generate Checksum",
          details: "Generate sha256 manifest for output files.",
          kind: "shell",
          risk: "low",
          requiresApproval: false,
          command: "node tools/local-agent/hash-output.js",
          workingDirectory: context.workspaceRoot
        }
      ];
    }

    if (intent === "GIT_MAINTENANCE") {
      return [
        {
          id: "git-status",
          title: "Check Repo Status",
          details: "Read current workspace changes and branch info.",
          kind: "git",
          risk: "low",
          requiresApproval: false,
          command: "git status --short"
        },
        {
          id: "git-fetch",
          title: "Sync Remote Info",
          details: "Fetch remote updates without auto-merge.",
          kind: "git",
          risk: "medium",
          requiresApproval: true,
          command: "git fetch --all"
        },
        {
          id: "git-report",
          title: "Output Maintenance Advice",
          details: "Generate pull/rebase/cherry-pick suggestions based on diff.",
          kind: "file",
          risk: "low",
          requiresApproval: false
        }
      ];
    }

    if (intent === "BACKUP_ARCHIVE") {
      return [
        {
          id: "collect-manifest",
          title: "Generate Backup Manifest",
          details: "Record directories to backup and exclusion rules.",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "archive-workspace",
          title: "Create Compressed Archive",
          details: "Compress workspace into timestamped archive.",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "tar -czf backup.tgz .",
          workingDirectory: context.workspaceRoot
        },
        {
          id: "verify-archive",
          title: "Verify Archive Integrity",
          details: "Verify archive readability and write checksum.",
          kind: "shell",
          risk: "low",
          requiresApproval: false,
          command: "node tools/local-agent/verify-archive.js",
          workingDirectory: context.workspaceRoot
        }
      ];
    }

    return [
      {
        id: "prepare-session",
        title: "Prepare Browser Session",
        details: "Load target site and verify login state.",
        kind: "browser",
        risk: "medium",
        requiresApproval: true
      },
      {
        id: "run-browser-flow",
        title: "Execute Browser Automation Flow",
        details: "Click, type, submit step-by-step, and save screenshots.",
        kind: "browser",
        risk: "high",
        requiresApproval: true
      },
      {
        id: "write-replay",
        title: "Write Replay Record",
        details: "Output operation timeline for review and audit.",
        kind: "file",
        risk: "low",
        requiresApproval: false
      }
    ];
  }
}

export class LocalAutomationGuard {
  validate(plan: LocalAutomationPlan, context: LocalAutomationContext): LocalAutomationGuardResult {
    const blockedReasons: string[] = [];
    const warnings: string[] = [];

    for (const step of plan.steps) {
      if (step.kind === "shell" || step.kind === "git") {
        if (!step.command) {
          blockedReasons.push(`Step ${step.id} missing command definition.`);
          continue;
        }

        const prefix = firstWord(step.command);
        if (!context.allowedCommandPrefixes.includes(prefix)) {
          blockedReasons.push(`Step ${step.id} uses unauthorized command prefix: ${prefix}`);
        }
      }

      if ((step.kind === "browser" || step.kind === "git") && !context.allowNetwork) {
        blockedReasons.push(`Step ${step.id} requires network, but allowNetwork=false`);
      }

      if (step.risk === "high" && !step.requiresApproval) {
        warnings.push(`Step ${step.id} is high risk, recommend forcing requiresApproval=true`);
      }
    }

    if (plan.steps.length === 0) {
      blockedReasons.push("Plan is empty, cannot execute.");
    }

    return {
      safe: blockedReasons.length === 0,
      blockedReasons,
      warnings
    };
  }
}

export class InMemoryLocalAutomationRunner {
  async run(
    plan: LocalAutomationPlan,
    guard: LocalAutomationGuardResult,
    input: { simulate: boolean; autoApproveHighRisk: boolean }
  ): Promise<LocalAutomationRunResult> {
    const blockedReasons = [...guard.blockedReasons];
    const records: LocalAutomationRunRecord[] = [];

    if (!guard.safe) {
      return {
        planId: plan.id,
        status: "blocked",
        records,
        blockedReasons
      };
    }

    for (const step of plan.steps) {
      if (step.risk === "high" && step.requiresApproval && !input.autoApproveHighRisk) {
        records.push({
          stepId: step.id,
          status: "blocked",
          output: "High risk step requires manual approval.",
          command: step.command
        });
        blockedReasons.push(`Step ${step.id} not approved`);
        continue;
      }

      const output = input.simulate
        ? `Simulated: ${step.title}`
        : `Executed: ${step.title}`;

      records.push({
        stepId: step.id,
        status: "completed",
        output,
        command: step.command
      });
    }

    return {
      planId: plan.id,
      status: blockedReasons.length > 0 ? "blocked" : "completed",
      records,
      blockedReasons
    };
  }
}

export function localAutomationToMarkdown(
  plan: LocalAutomationPlan,
  guard: LocalAutomationGuardResult,
  result?: LocalAutomationRunResult
): string {
  const lines: string[] = [];
  lines.push(`# Local Automation Task Report`);
  lines.push("");
  lines.push(`- Plan ID: ${plan.id}`);
  lines.push(`- Intent: ${plan.intent}`);
  lines.push(`- Created At: ${plan.createdAtIso}`);
  lines.push(`- Estimated Minutes: ${plan.estimatedMinutes}`);
  lines.push("");
  lines.push("## Plan Summary");
  lines.push(plan.summary);
  lines.push("");
  lines.push("## Steps");
  for (const step of plan.steps) {
    lines.push(
      `- [${step.risk}] ${step.title} | kind=${step.kind} | approval=${step.requiresApproval ? "yes" : "no"}`
    );
    lines.push(`  - ${step.details}`);
    if (step.command) lines.push(`  - command: \`${step.command}\``);
  }
  lines.push("");
  lines.push("## Guard Check");
  lines.push(`- safe: ${guard.safe}`);
  if (guard.warnings.length > 0) {
    lines.push("- warnings:");
    guard.warnings.forEach((item) => lines.push(`  - ${item}`));
  }
  if (guard.blockedReasons.length > 0) {
    lines.push("- blocked:");
    guard.blockedReasons.forEach((item) => lines.push(`  - ${item}`));
  }
  lines.push("");

  if (result) {
    lines.push("## Execution Result");
    lines.push(`- status: ${result.status}`);
    for (const record of result.records) {
      lines.push(`- ${record.stepId}: ${record.status} (${record.output})`);
    }
    if (result.blockedReasons.length > 0) {
      lines.push("- blocked reasons:");
      result.blockedReasons.forEach((item) => lines.push(`  - ${item}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}
