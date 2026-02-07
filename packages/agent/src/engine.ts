import type {
  AgentAction,
  AgentEvent,
  AgentInput,
  AgentIntent,
  AgentLlmEnhancer,
  AgentOutput,
  AgentStep,
  AgentToolbox,
  Rule,
  SuggestedAction
} from "./types";

export class RuleEngine {
  constructor(private readonly rules: Rule[] = []) {}

  register(rule: Rule): void {
    this.rules.push(rule);
  }

  async evaluate(event: AgentEvent): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];

    for (const rule of this.rules) {
      if (!rule.when(event)) {
        continue;
      }

      const result = await rule.then(event);
      if (Array.isArray(result)) {
        actions.push(...result);
      } else {
        actions.push(result);
      }
    }

    return actions;
  }
}

const PAY_KEYWORDS = ["pay", "invoice", "checkout", "payment"];
const REDEEM_KEYWORDS = ["redeem", "burn", "withdraw", "cashout"];
const CLAIM_KEYWORDS = ["claim", "revenue", "reward", "collect"];
const STATUS_KEYWORDS = ["status", "digest", "tx", "transaction", "progress"];

function containsAny(source: string, keywords: string[]): boolean {
  const normalized = source.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function detectIntent(input: string): AgentIntent {
  if (containsAny(input, PAY_KEYWORDS)) return "PAY";
  if (containsAny(input, REDEEM_KEYWORDS)) return "REDEEM";
  if (containsAny(input, CLAIM_KEYWORDS)) return "CLAIM";
  if (containsAny(input, STATUS_KEYWORDS)) return "STATUS";
  return "HELP";
}

function pickDigest(input: string, fallback?: string): string | undefined {
  const match = input.match(/\b[A-Za-z0-9]{18,}\b/);
  return match?.[0] || fallback;
}

function asAmountSuggestion(balance: string | undefined): string {
  if (!balance) return "1";
  try {
    const value = BigInt(balance);
    if (value <= 1n) return "1";
    return (value / 2n).toString();
  } catch {
    return "1";
  }
}

export class CheckoutAgentEngine {
  constructor(private readonly llmEnhancer?: AgentLlmEnhancer) {}

  async run(input: AgentInput, tools?: Partial<AgentToolbox>): Promise<AgentOutput> {
    if (this.llmEnhancer?.enabled) {
      const llmOutput = await this.llmEnhancer.infer(input);
      if (llmOutput) return llmOutput;
    }

    const intent = detectIntent(input.userInput);

    if (intent === "PAY") return this.runPayIntent(input, tools);
    if (intent === "REDEEM") return this.runRedeemIntent(input, tools);
    if (intent === "CLAIM") return this.runClaimIntent(input);
    if (intent === "STATUS") return this.runStatusIntent(input, tools);
    return this.runHelpIntent(input);
  }

  private async runPayIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const steps: AgentStep[] = [];
    const actions: SuggestedAction[] = [];

    if (!input.context.invoiceId) {
      steps.push({
        title: "Invoice Not Found",
        status: "failed",
        details: "No invoiceId found in current page context. Open /pay/:invoiceId first."
      });
      actions.push({
        label: "Go to Merchant",
        actionType: "NAVIGATE",
        payload: { path: "/merchant" }
      });
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "Read Invoice",
      status: "in_progress",
      details: `Checking invoice ${input.context.invoiceId} and payment requirement.`
    });

    let invoiceStatus = 0;
    try {
      if (tools?.getInvoice) {
        const invoice = await tools.getInvoice(input.context.invoiceId);
        invoiceStatus = invoice.status;
        steps[0] = {
          title: "Read Invoice",
          status: "completed",
          details: `Invoice amount=${invoice.amountU64}, status=${invoice.status}, buyer=${invoice.buyer || "-"}`
        };
      } else {
        steps[0] = {
          title: "Read Invoice",
          status: "completed",
          details: "Invoice context detected. No live tool snapshot used."
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load invoice";
      steps[0] = {
        title: "Read Invoice",
        status: "failed",
        details: message
      };
    }

    if (invoiceStatus === 1) {
      steps.push({
        title: "Payment Decision",
        status: "completed",
        details: "Invoice is already paid. Payment action is disabled."
      });
      actions.push({
        label: "Check Invoice Status",
        actionType: "REFRESH_INVOICE",
        payload: { invoiceId: input.context.invoiceId }
      });
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "Prepare Mint+Pay TX",
      status: "pending",
      details: "Will mint stable coin from USDC and call pay_invoice in one transaction."
    });
    steps.push({
      title: "Sign & Submit",
      status: "pending",
      details: "Wallet signature is required before broadcast."
    });

    actions.push({
      label: "Pay with USDC (Mint+Pay)",
      actionType: "PAY_MINT_AND_PAY",
      payload: { invoiceId: input.context.invoiceId }
    });
    actions.push({
      label: "Open Pay Page",
      actionType: "NAVIGATE",
      payload: { path: `/pay/${input.context.invoiceId}` }
    });

    return { intent: "PAY", steps, suggestedActions: actions };
  }

  private async runRedeemIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const balanceMap = await this.resolveBalances(input, tools);
    const stableBalance = balanceMap[input.context.stableCoinType] || "0";

    const steps: AgentStep[] = [
      {
        title: "Check BrandUSD Balance",
        status: "completed",
        details: `Current balance (${input.context.stableCoinType}) = ${stableBalance}`
      },
      {
        title: "Build Burn TX",
        status: "pending",
        details: "Choose burn amount or burn all."
      },
      {
        title: "Sign & Submit",
        status: "pending",
        details: "Wallet signature is required for redeem transaction."
      }
    ];

    const actions: SuggestedAction[] = [
      {
        label: "Redeem All",
        actionType: "REDEEM_ALL",
        payload: { all: true }
      },
      {
        label: "Redeem Suggested Amount",
        actionType: "REDEEM_AMOUNT",
        payload: { amount: asAmountSuggestion(stableBalance) }
      },
      { label: "Open Redeem Page", actionType: "NAVIGATE", payload: { path: "/redeem" } }
    ];

    return { intent: "REDEEM", steps, suggestedActions: actions };
  }

  private runClaimIntent(input: AgentInput): AgentOutput {
    const steps: AgentStep[] = [
      {
        title: "Permission Check",
        status: "pending",
        details: "Claim may require revenue-recipient or privileged account."
      },
      {
        title: "Build Claim TX",
        status: "pending",
        details: `Using stable coin type ${input.context.stableCoinType}.`
      },
      {
        title: "Sign & Submit",
        status: "pending",
        details: "Wallet signature is required to execute claim."
      }
    ];

    const actions: SuggestedAction[] = [
      { label: "Claim Revenue", actionType: "CLAIM_REVENUE", payload: {} },
      { label: "Open Claim Page", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } }
    ];

    return { intent: "CLAIM", steps, suggestedActions: actions };
  }

  private async runStatusIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const digest = pickDigest(input.userInput, input.context.lastDigest);
    const steps: AgentStep[] = [];
    const actions: SuggestedAction[] = [];

    if (!digest) {
      steps.push({
        title: "Digest Missing",
        status: "failed",
        details: "No digest found. Provide a tx digest to query status."
      });
      actions.push({ label: "Help", actionType: "SHOW_HELP", payload: {} });
      return { intent: "STATUS", steps, suggestedActions: actions };
    }

    steps.push({
      title: "Query Transaction",
      status: "in_progress",
      details: `Checking transaction digest ${digest}`
    });

    if (tools?.getTxStatus) {
      try {
        const snapshot = await tools.getTxStatus(digest);
        steps[0] = {
          title: "Query Transaction",
          status: "completed",
          details: `status=${snapshot.status}, explorer=${snapshot.explorerUrl || "-"}`
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to query tx status";
        steps[0] = {
          title: "Query Transaction",
          status: "failed",
          details: message
        };
      }
    } else {
      steps[0] = {
        title: "Query Transaction",
        status: "completed",
        details: "Digest detected. Click action to query with wallet tools."
      };
    }

    actions.push({
      label: "Refresh Tx Status",
      actionType: "CHECK_TX_STATUS",
      payload: { digest }
    });

    return { intent: "STATUS", steps, suggestedActions: actions };
  }

  private runHelpIntent(input: AgentInput): AgentOutput {
    return {
      intent: "HELP",
      steps: [
        {
          title: "Understand Request",
          status: "completed",
          details: "Supported intents: PAY, REDEEM, CLAIM, STATUS."
        },
        {
          title: "Suggest Next Action",
          status: "completed",
          details: `Current stable coin type: ${input.context.stableCoinType || "N/A"}`
        }
      ],
      suggestedActions: [
        { label: "Go Merchant", actionType: "NAVIGATE", payload: { path: "/merchant" } },
        { label: "Go Redeem", actionType: "NAVIGATE", payload: { path: "/redeem" } },
        { label: "Go Claim", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } },
        { label: "Go Metrics", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } }
      ]
    };
  }

  private async resolveBalances(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<Record<string, string>> {
    if (Object.keys(input.context.balances).length > 0) return input.context.balances;
    if (!input.context.address || !tools?.getBalances) return {};

    try {
      return await tools.getBalances(input.context.address);
    } catch {
      return {};
    }
  }
}
