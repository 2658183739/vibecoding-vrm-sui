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
});
