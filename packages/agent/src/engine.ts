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
  constructor(private readonly rules: Rule[] = []) { }

  register(rule: Rule): void {
    this.rules.push(rule);
  }

  async evaluate(event: AgentEvent): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];

    for (const rule of this.rules) {
      if (!rule.when(event)) continue;

      const result = await rule.then(event);
      if (Array.isArray(result)) actions.push(...result);
      else actions.push(result);
    }

    return actions;
  }
}

const PAY_KEYWORDS = [
  "pay",
  "invoice",
  "checkout",
  "payment",
  "mint",
  "支付",
  "账单",
  "付款",
  "结账",
  "一键支付"
];
const REDEEM_KEYWORDS = [
  "redeem",
  "burn",
  "withdraw",
  "cashout",
  "赎回",
  "销毁",
  "提现",
  "一键赎回"
];
const CLAIM_KEYWORDS = ["claim", "revenue", "reward", "collect", "领取", "收益", "分润", "奖励"];
const STATUS_KEYWORDS = [
  "status",
  "digest",
  "tx",
  "transaction",
  "progress",
  "状态",
  "进度",
  "查询",
  "交易"
];
const GUIDE_KEYWORDS = [
  "功能",
  "能做什么",
  "怎么用",
  "如何用",
  "如何演示",
  "项目介绍",
  "引导",
  "quickstart",
  "demo",
  "演示",
  "介绍"
];
const NEXT_STEP_KEYWORDS = ["下一步", "继续", "继续演示", "next step", "what next"];
const PLAYBOOK_KEYWORDS = [
  "一键连续执行",
  "自动串行",
  "全流程剧本",
  "一键剧本",
  "playbook",
  "full flow"
];
const DEMO_KEYWORDS = [
  "开始演示",
  "完整演示",
  "演示流程",
  "路演",
  "评委验证",
  "demo flow",
  "run demo"
];
const BALANCE_KEYWORDS = ["余额", "资产", "balance", "coins", "coin", "持仓"];
const CONFIG_KEYWORDS = [
  "配置",
  "env",
  "环境变量",
  "百炼",
  "dashscope",
  "api key",
  "agent key",
  "qwen"
];
const DEPLOY_KEYWORDS = ["部署", "上线", "deploy", "github pages", "发布", "网址"];

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function countHits(text: string, words: string[]): number {
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
}

function inferIntentByContext(input: AgentInput): AgentIntent {
  const path = input.context.currentPath || "";
  if (path.startsWith("/pay/")) return "PAY";
  if (path.startsWith("/redeem") || path.startsWith("/wallet")) return "REDEEM";
  if (path.startsWith("/merchant/claim")) return "CLAIM";
  return "HELP";
}

function detectIntent(input: AgentInput): AgentIntent {
  const text = normalizeText(input.userInput);
  const scores: Array<{ intent: AgentIntent; score: number }> = [
    { intent: "PAY", score: countHits(text, PAY_KEYWORDS) },
    { intent: "REDEEM", score: countHits(text, REDEEM_KEYWORDS) },
    { intent: "CLAIM", score: countHits(text, CLAIM_KEYWORDS) },
    { intent: "STATUS", score: countHits(text, STATUS_KEYWORDS) }
  ];

  const top = [...scores].sort((a, b) => b.score - a.score)[0];
  if (!top || top.score <= 0) return inferIntentByContext(input);
  return top.intent;
}

function isGuideQuery(text: string): boolean {
  return containsAny(text, GUIDE_KEYWORDS);
}

function isNextStepQuery(text: string): boolean {
  return containsAny(text, NEXT_STEP_KEYWORDS);
}

function isPlaybookQuery(text: string): boolean {
  return containsAny(text, PLAYBOOK_KEYWORDS);
}

function isDemoQuery(text: string): boolean {
  return containsAny(text, DEMO_KEYWORDS);
}

function isBalanceQuery(text: string): boolean {
  return containsAny(text, BALANCE_KEYWORDS);
}

function isConfigQuery(text: string): boolean {
  return containsAny(text, CONFIG_KEYWORDS);
}

function isDeployQuery(text: string): boolean {
  return containsAny(text, DEPLOY_KEYWORDS);
}

function wantsAll(text: string): boolean {
  return text.includes("all") || text.includes("全部") || text.includes("全额") || text.includes("一键");
}

function pickAmount(text: string): string | undefined {
  const match = text.match(/\b\d+\b/);
  return match?.[0];
}

function pickDigest(text: string, fallback?: string): string | undefined {
  const match = text.match(/\b(0x)?[A-Fa-f0-9]{20,}\b/);
  return match?.[0] || fallback;
}

function halfOrOne(balance: string | undefined): string {
  if (!balance) return "1";
  try {
    const value = BigInt(balance);
    if (value <= 1n) return "1";
    return (value / 2n).toString();
  } catch {
    return "1";
  }
}

function invoiceStatusLabel(status: number): string {
  if (status === 1) return "Paid";
  if (status === 0) return "Unpaid";
  return `Unknown(${status})`;
}

function dedupeActions(actions: SuggestedAction[]): SuggestedAction[] {
  const seen = new Set<string>();
  const output: SuggestedAction[] = [];

  for (const action of actions) {
    const key = `${action.actionType}:${JSON.stringify(action.payload || {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(action);
  }

  return output;
}

function summarizeBalances(balances: Record<string, string>, stableCoinType: string): string[] {
  const entries = Object.entries(balances);
  if (entries.length === 0) return ["No balances found. Please connect wallet."];

  const prioritized = [...entries].sort((a, b) => {
    if (a[0] === stableCoinType) return -1;
    if (b[0] === stableCoinType) return 1;
    return a[0].localeCompare(b[0]);
  });

  return prioritized.slice(0, 6).map(([coinType, amount]) => `${coinType}: ${amount}`);
}

interface CoachStep {
  id: string;
  title: string;
  path: string;
  hint: string;
}

const COACH_STEPS: CoachStep[] = [
  { id: "merchant_flow", title: "Create Product & Invoice", path: "/merchant", hint: "Create Product and Invoice first." },
  {
    id: "mint_pay_flow",
    title: "Execute USDC Mint+Pay",
    path: "/pay",
    hint: "Execute Mint+Pay combo transaction on payment page."
  },
  { id: "redeem_flow", title: "Execute Redeem", path: "/redeem", hint: "Choose Burn amount or Burn all." },
  { id: "claim_flow", title: "Execute Claim", path: "/merchant/claim", hint: "Submit Claim transaction and check status." }
];

export class CheckoutAgentEngine {
  constructor(private readonly llmEnhancer?: AgentLlmEnhancer) { }

  async run(input: AgentInput, tools?: Partial<AgentToolbox>): Promise<AgentOutput> {
    // 1. Try to get Intent from LLM Enhancer (if enabled)
    let detectedIntent: AgentIntent | null = null;
    let llmReasoning = "";

    if (this.llmEnhancer?.enabled) {
      const llmResult = await this.llmEnhancer.infer(input);
      if (llmResult) {
        // Check if the enhancer returned a full Output or just Intent-like structure
        // For this Hackathon, we assume our HttpLlmEnhancer (to be updated) returns 
        // a special structure or we cast it. 
        // Actually, let's keep it simple: reliable implementation.
        if (llmResult.intent) {
          detectedIntent = llmResult.intent;
          // If LLM returns full steps/actions (unlikely from LocalAgent), we could use them.
          // But here we just want the Intent.
        }
      }
    }

    const text = normalizeText(input.userInput);

    // Normal Rule checks
    if (isPlaybookQuery(text)) return this.runPlaybookIntent();
    if (isDemoQuery(text)) return this.runDemoIntent(input);
    if (isBalanceQuery(text)) return this.runBalanceIntent(input, tools);
    if (isGuideQuery(text) || isConfigQuery(text) || isDeployQuery(text)) {
      return this.runGuideIntent(input);
    }
    if (input.memory?.guideMode && isNextStepQuery(text)) return this.runCoachNextIntent(input);

    // If no specific keyword rule matched, use the detected intent (from LLM or Fallback)
    const intent = detectedIntent || detectIntent(input);

    if (intent === "PAY") return this.runPayIntent(input, tools);
    if (intent === "REDEEM") return this.runRedeemIntent(input, tools);
    if (intent === "CLAIM") return this.runClaimIntent(input);
    if (intent === "STATUS") return this.runStatusIntent(input, tools);
    return this.runHelpIntent(input);
  }

  private runGuideIntent(input: AgentInput): AgentOutput {
    const text = normalizeText(input.userInput);
    const actions: SuggestedAction[] = [
      { label: "Run Full Playbook", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "Start Demo Mode", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "Next Demo Step", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "Open Quickstart", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "Go to Merchant", actionType: "NAVIGATE", payload: { path: "/merchant" } },
      { label: "Go to Redeem", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "Go to Claim", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } }
    ];

    const steps: AgentStep[] = [
      {
        title: "Core Features",
        status: "completed",
        details:
          "1) Merchant creates Product & Invoice; 2) Payment page supports normal pay & USDC Mint+Pay; 3) Redeem supports Burn amount/all; 4) Merchant can Claim; 5) Metrics page shows supply & business stats."
      },
      {
        title: "Recommended Demo Flow",
        status: "completed",
        details: "Quickstart -> Merchant Create Invoice -> Pay Mint+Pay -> Redeem -> Claim -> Metrics."
      },
      {
        title: "Verification Points",
        status: "completed",
        details: "Check digest, status, Explorer link for every tx, and verify on-chain proof & events on payment page."
      }
    ];

    if (isConfigQuery(text)) {
      steps.unshift({
        title: "Config Guide",
        status: "completed",
        details:
          "Frontend config in apps/web/.env; Agent key in packages/agent/.env.local (Do not put in VITE_* vars)."
      });
      actions.unshift({
        label: "Show Context",
        actionType: "SHOW_CONTEXT",
        payload: {}
      });
    }

    if (isDeployQuery(text)) {
      steps.push({
        title: "Deploy Advice",
        status: "completed",
        details:
          "Recommend GitHub Pages: push to main triggers deploy-pages workflow; verify online link access before demo."
      });
      actions.push({
        label: "Export Demo Log",
        actionType: "EXPORT_DEMO_LOG",
        payload: {}
      });
    }

    if (input.context.lastDigest) {
      actions.unshift({
        label: "Check Last Tx Status",
        actionType: "CHECK_TX_STATUS",
        payload: { digest: input.context.lastDigest }
      });
    }

    return {
      intent: "HELP",
      steps,
      suggestedActions: input.context.invoiceId
        ? [
          {
            label: "Mint+Pay Current Invoice",
            actionType: "PAY_MINT_AND_PAY",
            payload: { invoiceId: input.context.invoiceId }
          },
          ...dedupeActions(actions)
        ]
        : dedupeActions(actions)
    };
  }

  private runPlaybookIntent(): AgentOutput {
    return {
      intent: "HELP",
      steps: [
        {
          title: "Playbook Goal",
          status: "completed",
          details: "Auto serial execution: Create Product -> Create Invoice -> Mint+Pay -> Burn -> Claim."
        },
        {
          title: "Execution Mode",
          status: "completed",
          details:
            "After clicking 'Run Full Playbook', system triggers transactions sequentially. In real mode, each step requires wallet signature."
        },
        {
          title: "Failure Handling",
          status: "completed",
          details:
            "Any failure aborts the playbook and shows error. Burn is skipped if balance is 0."
        }
      ],
      suggestedActions: dedupeActions([
        { label: "Run Full Playbook", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
        { label: "Start Demo Mode", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
        { label: "Open Quickstart", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
        { label: "Export Demo Log", actionType: "EXPORT_DEMO_LOG", payload: {} }
      ])
    };
  }

  private runDemoIntent(input: AgentInput): AgentOutput {
    const completed = new Set(input.memory?.completedActions || []);
    const next = COACH_STEPS.find((step) => !completed.has(step.id));

    const steps: AgentStep[] = [
      {
        title: "Demo Mode Advice",
        status: "completed",
        details: "Enable Smoke Mode first, then follow Quickstart 4 steps, finally show Metrics & Tx Proofs."
      },
      {
        title: "Current Progress",
        status: "completed",
        details: `Completed ${completed.size}/${COACH_STEPS.length} steps.`
      },
      {
        title: "Next Step",
        status: next ? "in_progress" : "completed",
        details: next ? `${next.title} (${next.path})` : "Main flow completed, recommend exporting log."
      }
    ];

    const actions: SuggestedAction[] = [
      { label: "Run Full Playbook", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "Start Demo & Go Quickstart", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "Next Demo Step", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "Open Quickstart", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "Export Demo Log", actionType: "EXPORT_DEMO_LOG", payload: {} }
    ];

    if (input.context.invoiceId) {
      actions.unshift({
        label: "Pay Current Invoice (Mint+Pay)",
        actionType: "PAY_MINT_AND_PAY",
        payload: { invoiceId: input.context.invoiceId }
      });
    }

    return { intent: "HELP", steps, suggestedActions: dedupeActions(actions) };
  }

  private async runBalanceIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const balances = await this.resolveBalances(input, tools);
    const stableBalance = balances[input.context.stableCoinType] || "0";
    const balanceLines = summarizeBalances(balances, input.context.stableCoinType);

    const steps: AgentStep[] = [
      {
        title: "Read Wallet Balance",
        status: Object.keys(balances).length > 0 ? "completed" : "failed",
        details: balanceLines.join(" | ")
      },
      {
        title: "Action Suggestion",
        status: "completed",
        details:
          stableBalance !== "0"
            ? `Found redeemable balance ${stableBalance}, you can Burn.`
            : "No redeemable balance, you can Mint+Pay to get stablecoins."
      }
    ];

    const actions: SuggestedAction[] = [
      { label: "Show Context", actionType: "SHOW_CONTEXT", payload: {} },
      { label: "Go to Redeem", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "Go to Metrics", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } }
    ];

    if (stableBalance !== "0") {
      actions.unshift({
        label: "Redeem Half",
        actionType: "REDEEM_AMOUNT",
        payload: { amount: halfOrOne(stableBalance) }
      });
    }

    if (input.context.invoiceId) {
      actions.unshift({
        label: "Pay Current Invoice (Mint+Pay)",
        actionType: "PAY_MINT_AND_PAY",
        payload: { invoiceId: input.context.invoiceId }
      });
    }

    return { intent: "STATUS", steps, suggestedActions: dedupeActions(actions) };
  }

  private runCoachNextIntent(input: AgentInput): AgentOutput {
    const completed = new Set(input.memory?.completedActions || []);
    const next = COACH_STEPS.find((step) => !completed.has(step.id));

    if (!next) {
      return {
        intent: "HELP",
        steps: [
          {
            title: "Demo Loop Completed",
            status: "completed",
            details: "4-step demo finished. Recommend showing Metrics page for GMV/Conversion, and replay recent tx history."
          }
        ],
        suggestedActions: [
          { label: "Open Metrics", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } },
          { label: "Back to Quickstart", actionType: "NAVIGATE", payload: { path: "/quickstart" } }
        ]
      };
    }

    const actions: SuggestedAction[] = [];
    if (next.id === "merchant_flow" && input.context.invoiceId) {
      actions.push({
        label: "Execute Mint+Pay on Current Invoice",
        actionType: "PAY_MINT_AND_PAY",
        payload: { invoiceId: input.context.invoiceId }
      });
    }
    actions.push({
      label: `Go to: ${next.title}`,
      actionType: "NAVIGATE",
      payload: { path: next.path === "/pay" && input.context.invoiceId ? `/pay/${input.context.invoiceId}` : next.path }
    });

    return {
      intent: "HELP",
      steps: [
        {
          title: "Demo Coach",
          status: "completed",
          details: `Next Suggested Step: ${next.title}`
        },
        {
          title: "Execution Hint",
          status: "pending",
          details: next.hint
        }
      ],
      suggestedActions: actions
    };
  }

  private async runPayIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const steps: AgentStep[] = [];
    const actions: SuggestedAction[] = [];

    if (!input.context.invoiceId) {
      steps.push({
        title: "Missing Invoice Context",
        status: "failed",
        details: "Not on /pay/:invoiceId page, cannot build pay tx directly."
      });
      actions.push({
        label: "Go to Merchant to Create Invoice",
        actionType: "NAVIGATE",
        payload: { path: "/merchant" }
      });
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "Read Invoice Info",
      status: "in_progress",
      details: `Invoice ID: ${input.context.invoiceId}`
    });

    let invoiceStatus = 0;
    let invoiceAmount = "Unknown";

    if (tools?.getInvoice) {
      try {
        const invoice = await tools.getInvoice(input.context.invoiceId);
        invoiceStatus = invoice.status;
        invoiceAmount = invoice.amountU64;
        steps[0] = {
          title: "Read Invoice Info",
          status: "completed",
          details: `Amount=${invoice.amountU64}, Status=${invoiceStatusLabel(invoice.status)}, Buyer=${invoice.buyer || "-"}`
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Fetch Invoice Failed";
        steps[0] = {
          title: "Read Invoice Info",
          status: "failed",
          details: message
        };
      }
    } else {
      steps[0] = {
        title: "Read Invoice Info",
        status: "completed",
        details: "InvoiceId obtained, details will be fetched by page action."
      };
    }

    if (invoiceStatus === 1) {
      steps.push({
        title: "Payment Check",
        status: "completed",
        details: "Invoice paid. Recommend refreshing status or checking recent tx."
      });
      actions.push({
        label: "Refresh Invoice Status",
        actionType: "REFRESH_INVOICE",
        payload: { invoiceId: input.context.invoiceId }
      });
      if (input.context.lastDigest) {
        actions.push({
          label: "Check Last Tx Status",
          actionType: "CHECK_TX_STATUS",
          payload: { digest: input.context.lastDigest }
        });
      }
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "Prepare Mint+Pay",
      status: "pending",
      details: `Est. Amount: ${invoiceAmount} (USDC -> BrandUSD -> pay_invoice)`
    });
    steps.push({
      title: "Submit & Verify",
      status: "pending",
      details: "Check digest, status, Explorer after completion."
    });

    actions.push({
      label: "Execute Mint+Pay",
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
    const balances = await this.resolveBalances(input, tools);
    const stableBalance = balances[input.context.stableCoinType] || "0";
    const text = normalizeText(input.userInput);
    const explicitAmount = pickAmount(text);
    const allFlag = wantsAll(text);

    const steps: AgentStep[] = [
      {
        title: "Check BrandUSD Balance",
        status: "completed",
        details: `Balance (${input.context.stableCoinType || "Not Configured"}): ${stableBalance}`
      },
      {
        title: "Choose Redeem Mode",
        status: "pending",
        details: allFlag
          ? "Identified 'Redeem All'."
          : explicitAmount
            ? `Identified 'Redeem Amount', amount=${explicitAmount}.`
            : "No amount specified, recommending amount."
      },
      {
        title: "Sign & Submit",
        status: "pending",
        details: "MVP defaults to T+1 settlement."
      }
    ];

    const actions: SuggestedAction[] = [];
    if (allFlag) {
      actions.push({ label: "Redeem All", actionType: "REDEEM_ALL", payload: { all: true } });
    } else {
      actions.push({
        label: "Redeem Amount",
        actionType: "REDEEM_AMOUNT",
        payload: { amount: explicitAmount || halfOrOne(stableBalance) }
      });
      actions.push({ label: "Redeem All", actionType: "REDEEM_ALL", payload: { all: true } });
    }
    actions.push({
      label: "Open Redeem Page",
      actionType: "NAVIGATE",
      payload: { path: "/redeem" }
    });

    return { intent: "REDEEM", steps, suggestedActions: actions };
  }

  private runClaimIntent(input: AgentInput): AgentOutput {
    return {
      intent: "CLAIM",
      steps: [
        {
          title: "Permission Check",
          status: "pending",
          details: "Current wallet must have claim permission."
        },
        {
          title: "Build Claim Tx",
          status: "pending",
          details: `Stablecoin: ${input.context.stableCoinType || "Not Configured"}`
        },
        {
          title: "Submit & Verify",
          status: "pending",
          details: "Check digest, status, Explorer after completion."
        }
      ],
      suggestedActions: [
        { label: "Execute Claim", actionType: "CLAIM_REVENUE", payload: {} },
        { label: "Open Claim Page", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } }
      ]
    };
  }

  private async runStatusIntent(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<AgentOutput> {
    const digest = pickDigest(normalizeText(input.userInput), input.context.lastDigest);

    if (!digest) {
      return {
        intent: "STATUS",
        steps: [
          {
            title: "Missing Tx Digest",
            status: "failed",
            details: "Please provide digest, or execute a tx first."
          }
        ],
        suggestedActions: [{ label: "Show Help", actionType: "SHOW_HELP", payload: {} }]
      };
    }

    const steps: AgentStep[] = [
      {
        title: "Check Tx Status",
        status: "in_progress",
        details: `digest: ${digest}`
      }
    ];

    if (tools?.getTxStatus) {
      try {
        const snapshot = await tools.getTxStatus(digest);
        steps[0] = {
          title: "Check Tx Status",
          status: "completed",
          details: `Status=${snapshot.status}, Explorer=${snapshot.explorerUrl || "-"}`
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Check Tx Failed";
        steps[0] = { title: "Check Tx Status", status: "failed", details: message };
      }
    } else {
      steps[0] = {
        title: "Check Tx Status",
        status: "pending",
        details: "Click action button to check on-chain."
      };
    }

    return {
      intent: "STATUS",
      steps,
      suggestedActions: [
        {
          label: "Refresh Tx Status",
          actionType: "CHECK_TX_STATUS",
          payload: { digest }
        }
      ]
    };
  }

  private runHelpIntent(input: AgentInput): AgentOutput {
    const actions: SuggestedAction[] = [
      { label: "Run Full Playbook", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "Start Demo Mode", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "Next Demo Step", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "Open Quickstart", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "Go to Merchant", actionType: "NAVIGATE", payload: { path: "/merchant" } },
      { label: "Go to Redeem", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "Go to Claim", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } },
      { label: "Go to Metrics", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } },
      { label: "Show Context", actionType: "SHOW_CONTEXT", payload: {} }
    ];

    if (input.context.invoiceId) {
      actions.unshift({
        label: "Pay Current Invoice (Mint+Pay)",
        actionType: "PAY_MINT_AND_PAY",
        payload: { invoiceId: input.context.invoiceId }
      });
    }

    return {
      intent: "HELP",
      steps: [
        {
          title: "可识别意图",
          status: "completed",
          details: "PAY / REDEEM / CLAIM / STATUS / HELP"
        },
        {
          title: "可问内容",
          status: "completed",
          details: "你可以问：这个项目有哪些功能、怎么演示、下一步做什么。"
        },
        {
          title: "输入示例",
          status: "completed",
          details:
            "示例：'帮我支付当前账单'、'全部赎回'、'领取收益'、'查询交易状态 0x...'、'这个项目怎么演示？'"
        }
      ],
      suggestedActions: actions
    };
  }

  private async resolveBalances(
    input: AgentInput,
    tools?: Partial<AgentToolbox>
  ): Promise<Record<string, string>> {
    if (Object.keys(input.context.balances).length > 0) {
      return input.context.balances;
    }
    if (!input.context.address || !tools?.getBalances) {
      return {};
    }

    try {
      return await tools.getBalances(input.context.address);
    } catch {
      return {};
    }
  }
}
