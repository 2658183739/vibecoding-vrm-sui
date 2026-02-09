import type { AgentInput, AgentLlmEnhancer, AgentOutput } from "@vibesui/agent";

export interface HttpLlmEnhancerConfig {
    endpoint: string;
    apiKey?: string;
    provider?: string;
    model?: string;
}

export class HttpLlmEnhancer implements AgentLlmEnhancer {
    constructor(private readonly config: HttpLlmEnhancerConfig) { }

    get enabled(): boolean {
        return !!this.config.endpoint;
    }

    async infer(input: AgentInput): Promise<AgentOutput | null> {
        if (!this.config.endpoint) return null;

        try {
            const response = await fetch(`${this.config.endpoint}/agent/parse`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: input.userInput,
                    context: input.context,
                    apiKey: this.config.apiKey,
                    provider: this.config.provider,
                    model: this.config.model
                })
            });

            if (!response.ok) return null;

            const data = await response.json();
            // data is AgentParseResponse { intent, slots, confidence, reasoningBrief }

            if (!data || !data.intent) return null;
            if (data.intent === "HELP") return null; // Let rule engine handle HELP/Fallback

            // Return a dummy AgentOutput that carries the Intent.
            // The Engine will use .intent and ignore steps/actions if it matches a known flow.
            return {
                intent: data.intent,
                steps: [],
                suggestedActions: []
            } as AgentOutput;

        } catch (e) {
            console.warn("LLM Enhancer failed:", e);
            return null;
        }
    }
}
