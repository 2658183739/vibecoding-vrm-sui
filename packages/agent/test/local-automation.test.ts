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
    const plan = planner.buildPlan({ goal: "Please organize downloads" }, baseContext());

    expect(plan.intent).toBe("WORKSPACE_CLEANUP");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.warnings.some((item) => item.includes("Dry Run"))).toBe(true);
  });

  it("builds git maintenance plan from git keywords", () => {
    const planner = new LocalAutomationPlanner();
    const plan = planner.buildPlan({ goal: "Help me sync git repo and check branch" }, baseContext());
    expect(plan.intent).toBe("GIT_MAINTENANCE");
  });
});

describe("LocalAutomationGuard", () => {
  it("blocks unapproved command prefix", () => {
    const planner = new LocalAutomationPlanner();
    const context = { ...baseContext(), allowedCommandPrefixes: ["git"] };
    const plan = planner.buildPlan({ goal: "Please organize downloads" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    expect(guard.safe).toBe(false);
    expect(guard.blockedReasons.length).toBeGreaterThan(0);
  });

  it("passes safe plan when command prefixes are allowed", () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "Please organize downloads" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);

    expect(guard.safe).toBe(true);
  });
});

describe("InMemoryLocalAutomationRunner", () => {
  it("runs plan in simulate mode and returns records", async () => {
    const planner = new LocalAutomationPlanner();
    const context = baseContext();
    const plan = planner.buildPlan({ goal: "Please organize downloads" }, context);
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
    const plan = planner.buildPlan({ goal: "Automate opening website and perform complex actions" }, context);
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
    const plan = planner.buildPlan({ goal: "Please organize downloads" }, context);
    const guard = new LocalAutomationGuard().validate(plan, context);
    const markdown = localAutomationToMarkdown(plan, guard);

    expect(markdown.includes("Local Automation Task Report")).toBe(true);
    expect(markdown.includes(plan.id)).toBe(true);
  });
});
