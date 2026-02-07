import { CheckoutAgentEngine, RuleEngine } from "./engine";
import type { AgentEvent, Rule } from "./types";

export { RuleEngine, CheckoutAgentEngine };
export type {
  AgentAction,
  AgentContext,
  AgentEvent,
  AgentInput,
  AgentIntent,
  AgentLlmEnhancer,
  AgentOutput,
  AgentStep,
  AgentStepStatus,
  AgentToolbox,
  AgentTxStatusSnapshot,
  AgentInvoiceSnapshot,
  Rule,
  SuggestedAction
} from "./types";
export { createSuiClient } from "./sui-client";
export type { StableLayerClient } from "./stable-layer";
export { InMemoryStableLayerClient } from "./stable-layer";

if (import.meta.url === `file://${process.argv[1]}`) {
  const engine = new RuleEngine();

  const sampleRule: Rule = {
    id: "welcome-rule",
    description: "Emit greeting action when init event is received",
    when: (event: AgentEvent) => event.type === "init",
    then: () => ({ type: "LOG", data: { message: "Agent initialized" } })
  };

  engine.register(sampleRule);

  engine
    .evaluate({ type: "init", payload: {}, timestamp: Date.now() })
    .then((actions) => console.log("Actions:", actions));
}
