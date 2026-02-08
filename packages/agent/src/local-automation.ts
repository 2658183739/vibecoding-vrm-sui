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

  if (includesAny(text, ["download", "下载", "整理", "归档", "清理"])) {
    return "WORKSPACE_CLEANUP";
  }
  if (includesAny(text, ["ffmpeg", "转码", "视频", "音频", "media"])) {
    return "MEDIA_PIPELINE";
  }
  if (includesAny(text, ["git", "仓库", "分支", "pull", "commit"])) {
    return "GIT_MAINTENANCE";
  }
  if (includesAny(text, ["备份", "backup", "压缩", "archive", "打包"])) {
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
    return "扫描下载目录、按类型归档并生成变更报告。";
  }
  if (intent === "MEDIA_PIPELINE") {
    return "执行媒体批处理（转码/压缩）并保留原始文件清单。";
  }
  if (intent === "GIT_MAINTENANCE") {
    return "检查仓库状态、同步远端并生成可审计变更日志。";
  }
  if (intent === "BACKUP_ARCHIVE") {
    return "创建工作区增量备份并输出校验信息。";
  }
  return "执行受控的浏览器自动化步骤并产出操作回放记录。";
}

function buildWarnings(context: LocalAutomationContext, intent: LocalAutomationIntent): string[] {
  const warnings: string[] = [];

  if (context.dryRun) {
    warnings.push("当前为 Dry Run，仅模拟执行，不会写入本地文件。");
  }
  if (!context.allowNetwork && (intent === "WEB_AUTOMATION" || intent === "GIT_MAINTENANCE")) {
    warnings.push("网络能力已关闭，联网步骤将被阻断。");
  }
  if (context.allowedCommandPrefixes.length === 0) {
    warnings.push("未配置允许命令前缀，所有 shell 步骤会被阻断。");
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
          title: "扫描下载目录",
          details: "列出最近 7 天新增文件并按扩展名分组。",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "organize-files",
          title: "执行分类整理",
          details: "按图片/文档/压缩包归档到子目录，保留冲突文件。",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "node tools/local-agent/organize-downloads.js",
          workingDirectory: context.workspaceRoot
        },
        {
          id: "report-result",
          title: "生成整理报告",
          details: "输出 Markdown 报告，包含移动前后统计。",
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
          title: "发现媒体文件",
          details: "扫描目标目录中的 mp4/mov/mkv/wav 文件。",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "transcode",
          title: "执行转码任务",
          details: "调用 ffmpeg 生成统一编码格式。",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "ffmpeg -version",
          fallback: "若本机无 ffmpeg，则提示安装并终止执行。"
        },
        {
          id: "checksum",
          title: "生成校验摘要",
          details: "为输出文件生成 sha256 清单。",
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
          title: "检查仓库状态",
          details: "读取当前工作区变更与分支信息。",
          kind: "git",
          risk: "low",
          requiresApproval: false,
          command: "git status --short"
        },
        {
          id: "git-fetch",
          title: "同步远端信息",
          details: "抓取远端更新但不自动合并。",
          kind: "git",
          risk: "medium",
          requiresApproval: true,
          command: "git fetch --all"
        },
        {
          id: "git-report",
          title: "输出维护建议",
          details: "根据差异生成 pull/rebase/cherry-pick 建议。",
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
          title: "生成备份清单",
          details: "记录待备份目录和排除规则。",
          kind: "file",
          risk: "low",
          requiresApproval: false
        },
        {
          id: "archive-workspace",
          title: "创建压缩备份",
          details: "压缩工作区为时间戳归档包。",
          kind: "shell",
          risk: "medium",
          requiresApproval: true,
          command: "tar -czf backup.tgz .",
          workingDirectory: context.workspaceRoot
        },
        {
          id: "verify-archive",
          title: "验证备份完整性",
          details: "校验归档文件可读并写入摘要。",
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
        title: "准备浏览器会话",
        details: "加载目标站点并校验登录态。",
        kind: "browser",
        risk: "medium",
        requiresApproval: true
      },
      {
        id: "run-browser-flow",
        title: "执行浏览器自动化流程",
        details: "按步骤点击、填写、提交，并保存截图。",
        kind: "browser",
        risk: "high",
        requiresApproval: true
      },
      {
        id: "write-replay",
        title: "写入回放记录",
        details: "输出操作时间线，便于复盘和审计。",
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
          blockedReasons.push(`步骤 ${step.id} 缺少命令定义。`);
          continue;
        }

        const prefix = firstWord(step.command);
        if (!context.allowedCommandPrefixes.includes(prefix)) {
          blockedReasons.push(`步骤 ${step.id} 使用了未授权命令前缀: ${prefix}`);
        }
      }

      if ((step.kind === "browser" || step.kind === "git") && !context.allowNetwork) {
        blockedReasons.push(`步骤 ${step.id} 需要网络能力，但当前 allowNetwork=false`);
      }

      if (step.risk === "high" && !step.requiresApproval) {
        warnings.push(`步骤 ${step.id} 为高风险，建议强制 requiresApproval=true`);
      }
    }

    if (plan.steps.length === 0) {
      blockedReasons.push("计划为空，无法执行。");
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
          output: "高风险步骤需要人工审批。",
          command: step.command
        });
        blockedReasons.push(`步骤 ${step.id} 未审批`);
        continue;
      }

      const output = input.simulate
        ? `模拟执行: ${step.title}`
        : `执行完成: ${step.title}`;

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
  lines.push(`# 本地自治任务报告`);
  lines.push("");
  lines.push(`- 计划 ID: ${plan.id}`);
  lines.push(`- 意图: ${plan.intent}`);
  lines.push(`- 创建时间: ${plan.createdAtIso}`);
  lines.push(`- 预计耗时(分钟): ${plan.estimatedMinutes}`);
  lines.push("");
  lines.push("## 计划摘要");
  lines.push(plan.summary);
  lines.push("");
  lines.push("## 步骤清单");
  for (const step of plan.steps) {
    lines.push(
      `- [${step.risk}] ${step.title} | kind=${step.kind} | approval=${step.requiresApproval ? "yes" : "no"}`
    );
    lines.push(`  - ${step.details}`);
    if (step.command) lines.push(`  - command: \`${step.command}\``);
  }
  lines.push("");
  lines.push("## 守卫检查");
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
    lines.push("## 执行结果");
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
