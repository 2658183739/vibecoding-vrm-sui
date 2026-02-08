import { describe, expect, it } from "vitest";
import {
  InMemoryLocalAutomationRunner,
  LocalAutomationGuard,
  LocalAutomationPlanner,
  localAutomationToMarkdown
} from "../src/local-automation";

function baseContext() {
  return {
    workspaceRoot: "E:/workspace/demo",
    downloadsDir: "C:/Users/demo/Downloads",
    dryRun: true,
    allowNetwork: true,
    allowedCommandPrefixes: ["node", "git", "ffmpeg", "tar"]
  };
}

describe("LocalAutomationPlanner", () => {
  it("builds cleanup plan from organize keywords", () => {
    const planner = new LocalAutomationPlanner();
    const plan = planner.buildPlan({ goal: "请整理下载目录" }, baseContext());

    expect(plan.intent).toBe("WORKSPACE_CLEANUP");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.warnings.some((item) => item.includes("Dry Run"))).toBe(true);
  });

  it("builds git maintenance plan from git keywords", () => {
    const planner = new LocalAutomationPlanner();
    const plan = planner.buildPlan({ goal: "帮我同步 git 仓库并检查分支" }, baseContext());
    expect(plan.intent).toBe("GIT_MAINTENANCE");
  });
});

describe("LocalAutomationGuard", () => {
  it("blocks unapproved command prefix", () => {
    const planner = new LocalAutomationPlanner();
    const context = { ...baseContext(), allowedCommandPrefixes: ["git"] };
    const plan = planner.buildPlan({ goal: "请整理下载目录" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    expect(guard.safe).toBe(false);
    expect(guard.blockedReasons.length).toBeGreaterThan(0);
  });

  it("passes safe plan when command prefixes are allowed", () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "请整理下载目录" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    expect(guard.safe).toBe(true);
  });
});

describe("InMemoryLocalAutomationRunner", () => {
  it("runs plan in simulate mode and returns records", async () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "请整理下载目录" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    const result = await new InMemoryLocalAutomationRunner().run(plan, guard, {
      simulate: true,
      autoApproveHighRisk: false
    });

    expect(result.records.length).toBe(plan.steps.length);
    expect(result.status).toBe("completed");
  });

  it("blocks high-risk step without approval", async () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "自动化打开网站并执行复杂操作" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    const result = await new InMemoryLocalAutomationRunner().run(plan, guard, {
      simulate: true,
      autoApproveHighRisk: false
    });

    expect(result.status).toBe("blocked");
    expect(result.blockedReasons.length).toBeGreaterThan(0);
  });

  it("exports markdown report", () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "请整理下载目录" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);
    const markdown = localAutomationToMarkdown(plan, guard);

    expect(markdown.includes("本地自治任务报告")).toBe(true);
    expect(markdown.includes(plan.id)).toBe(true);
  });
});
