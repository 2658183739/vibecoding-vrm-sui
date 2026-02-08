import { describe, expect, it } from "vitest";
import { CheckoutAgentEngine, RuleEngine } from "../src/engine";
import type { Rule } from "../src/types";

describe("RuleEngine", () => {
  it("runs matching rules and returns actions", async () => {
    const engine = new RuleEngine();

    const rule: Rule = {
      id: "funding-check",
      description: "Generate alert when funding target reached",
      when: (event) => event.type === "funding.updated",
      then: (event) => ({
        type: "ALERT",
        data: { reached: (event.payload as { raised?: number }).raised ?? 0 }
      })
    };

    engine.register(rule);

    const actions = await engine.evaluate({
      type: "funding.updated",
      payload: { raised: 1000 },
      timestamp: Date.now()
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("ALERT");
  });
});

describe("CheckoutAgentEngine", () => {
  it("returns PAY intent with mint+pay action when invoice exists in context", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "please pay this invoice",
      context: {
        invoiceId: "0xinvoice",
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      }
    });

    expect(result.intent).toBe("PAY");
    expect(result.suggestedActions.some((item) => item.actionType === "PAY_MINT_AND_PAY")).toBe(
      true
    );
  });

  it("returns REDEEM intent for burn/redeem request", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "I want to redeem all",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: { "0xstable::coin::COIN": "100" }
      }
    });

    expect(result.intent).toBe("REDEEM");
    expect(result.suggestedActions.some((item) => item.actionType === "REDEEM_ALL")).toBe(true);
  });

  it("supports Chinese status query intent", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "帮我查询交易状态 0x1234567890abcdef1234567890abcdef",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      }
    });

    expect(result.intent).toBe("STATUS");
    expect(result.suggestedActions.some((item) => item.actionType === "CHECK_TX_STATUS")).toBe(
      true
    );
  });

  it("returns guide steps for project intro query", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "这个项目有什么功能，怎么演示？",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      }
    });

    expect(result.intent).toBe("HELP");
    expect(result.steps[0]?.title).toContain("项目核心功能");
    expect(result.suggestedActions.some((item) => item.actionType === "NAVIGATE")).toBe(true);
  });

  it("returns next-step coach guidance in guide mode", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "下一步我该做什么",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      },
      memory: {
        guideMode: true,
        completedActions: ["merchant_flow"]
      }
    });

    expect(result.intent).toBe("HELP");
    expect(result.steps.some((step) => step.title.includes("演示教练"))).toBe(true);
  });

  it("returns demo orchestration actions for demo request", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "帮我开始完整演示",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      },
      memory: {
        completedActions: ["merchant_flow"]
      }
    });

    expect(result.intent).toBe("HELP");
    expect(
      result.suggestedActions.some(
        (item) => item.actionType === "ENABLE_SMOKE_AND_GOTO_QUICKSTART"
      )
    ).toBe(true);
    expect(result.suggestedActions.some((item) => item.actionType === "RUN_DEMO_PLAYBOOK")).toBe(
      true
    );
  });

  it("returns balance diagnosis with redeem recommendation", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run(
      {
        userInput: "我现在有哪些余额",
        context: {
          stableCoinType: "0xstable::coin::COIN",
          balances: {},
          address: "0xabc"
        }
      },
      {
        getBalances: async () => ({
          "0xstable::coin::COIN": "120",
          "0x2::sui::SUI": "1000000"
        })
      }
    );

    expect(result.intent).toBe("STATUS");
    expect(result.steps[0]?.title).toContain("读取钱包余额");
    expect(result.suggestedActions.some((item) => item.actionType === "REDEEM_AMOUNT")).toBe(true);
  });

  it("returns config guidance for env/key query", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "百炼 key 怎么配置？",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      }
    });

    expect(result.intent).toBe("HELP");
    expect(result.steps.some((step) => step.title.includes("配置指引"))).toBe(true);
    expect(result.suggestedActions.some((item) => item.actionType === "SHOW_CONTEXT")).toBe(true);
  });

  it("returns playbook action for one-click serial request", async () => {
    const engine = new CheckoutAgentEngine();
    const result = await engine.run({
      userInput: "请一键连续执行剧本",
      context: {
        stableCoinType: "0xstable::coin::COIN",
        balances: {}
      }
    });

    expect(result.intent).toBe("HELP");
    expect(result.suggestedActions.some((item) => item.actionType === "RUN_DEMO_PLAYBOOK")).toBe(
      true
    );
  });
});
