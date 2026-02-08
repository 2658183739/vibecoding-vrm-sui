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
  if (status === 1) return "已支付";
  if (status === 0) return "待支付";
  return `未知(${status})`;
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
  if (entries.length === 0) return ["未读取到余额。请先连接钱包并授权。"];

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
  { id: "merchant_flow", title: "创建商品与账单", path: "/merchant", hint: "先创建 Product 和 Invoice。" },
  {
    id: "mint_pay_flow",
    title: "执行 USDC 一键支付",
    path: "/pay",
    hint: "在支付页执行 Mint+Pay 组合交易。"
  },
  { id: "redeem_flow", title: "执行赎回", path: "/redeem", hint: "选择 Burn amount 或 Burn all。" },
  { id: "claim_flow", title: "执行收益领取", path: "/merchant/claim", hint: "提交 Claim 交易并查看状态。" }
];

export class CheckoutAgentEngine {
  constructor(private readonly llmEnhancer?: AgentLlmEnhancer) {}

  async run(input: AgentInput, tools?: Partial<AgentToolbox>): Promise<AgentOutput> {
    if (this.llmEnhancer?.enabled) {
      const llmOutput = await this.llmEnhancer.infer(input);
      if (llmOutput) return llmOutput;
    }

    const text = normalizeText(input.userInput);
    if (isPlaybookQuery(text)) return this.runPlaybookIntent();
    if (isDemoQuery(text)) return this.runDemoIntent(input);
    if (isBalanceQuery(text)) return this.runBalanceIntent(input, tools);
    if (isGuideQuery(text) || isConfigQuery(text) || isDeployQuery(text)) {
      return this.runGuideIntent(input);
    }
    if (input.memory?.guideMode && isNextStepQuery(text)) return this.runCoachNextIntent(input);

    const intent = detectIntent(input);
    if (intent === "PAY") return this.runPayIntent(input, tools);
    if (intent === "REDEEM") return this.runRedeemIntent(input, tools);
    if (intent === "CLAIM") return this.runClaimIntent(input);
    if (intent === "STATUS") return this.runStatusIntent(input, tools);
    return this.runHelpIntent(input);
  }

  private runGuideIntent(input: AgentInput): AgentOutput {
    const text = normalizeText(input.userInput);
    const actions: SuggestedAction[] = [
      { label: "一键连续执行剧本", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "开启演示模式", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "跳到下一演示步骤", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "打开引导页", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "前往商户台", actionType: "NAVIGATE", payload: { path: "/merchant" } },
      { label: "前往赎回页", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "前往领取页", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } }
    ];

    const steps: AgentStep[] = [
      {
        title: "项目核心功能",
        status: "completed",
        details:
          "1) 商户创建商品与账单；2) 支付页支持普通支付与 USDC 一键 Mint+Pay；3) 赎回支持 Burn amount/all；4) 商户可 Claim；5) 指标页可查看供给与业务指标。"
      },
      {
        title: "推荐演示顺序",
        status: "completed",
        details: "Quickstart -> Merchant 创建账单 -> Pay 执行 Mint+Pay -> Redeem -> Claim -> Metrics。"
      },
      {
        title: "验证点",
        status: "completed",
        details: "每笔交易都核对 digest、status、Explorer 链接，并在支付页查看链上证明与事件流。"
      }
    ];

    if (isConfigQuery(text)) {
      steps.unshift({
        title: "配置指引",
        status: "completed",
        details:
          "前端配置在 apps/web/.env；Agent 密钥配置在 packages/agent/.env.local（不要放入 VITE_* 变量）。"
      });
      actions.unshift({
        label: "查看当前上下文",
        actionType: "SHOW_CONTEXT",
        payload: {}
      });
    }

    if (isDeployQuery(text)) {
      steps.push({
        title: "部署建议",
        status: "completed",
        details:
          "推荐 GitHub Pages：推送 main 后由 deploy-pages 工作流自动发布；路演前先验证线上链接可访问。"
      });
      actions.push({
        label: "导出演示记录",
        actionType: "EXPORT_DEMO_LOG",
        payload: {}
      });
    }

    if (input.context.lastDigest) {
      actions.unshift({
        label: "查询最近交易状态",
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
              label: "对当前账单执行 Mint+Pay",
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
          title: "剧本目标",
          status: "completed",
          details: "自动串行执行：创建商品 -> 创建账单 -> Mint+Pay -> Burn -> Claim。"
        },
        {
          title: "执行方式",
          status: "completed",
          details:
            "点击“一键连续执行剧本”后，系统会按顺序触发交易。真实模式下每一步都需要你在钱包确认签名。"
        },
        {
          title: "失败处理",
          status: "completed",
          details:
            "任一步骤失败会中止剧本，并显示失败步骤与错误信息。Burn 在余额为 0 时会自动跳过。"
        }
      ],
      suggestedActions: dedupeActions([
        { label: "一键连续执行剧本", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
        { label: "开启演示模式", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
        { label: "打开引导页", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
        { label: "导出演示记录", actionType: "EXPORT_DEMO_LOG", payload: {} }
      ])
    };
  }

  private runDemoIntent(input: AgentInput): AgentOutput {
    const completed = new Set(input.memory?.completedActions || []);
    const next = COACH_STEPS.find((step) => !completed.has(step.id));

    const steps: AgentStep[] = [
      {
        title: "演示模式建议",
        status: "completed",
        details: "先开启 Smoke 模式，再按 Quickstart 四步执行，最后展示 Metrics 与交易证据。"
      },
      {
        title: "当前演示进度",
        status: "completed",
        details: `已完成 ${completed.size}/${COACH_STEPS.length} 步。`
      },
      {
        title: "下一步",
        status: next ? "in_progress" : "completed",
        details: next ? `${next.title}（${next.path}）` : "主线流程已完成，建议导出演示记录。"
      }
    ];

    const actions: SuggestedAction[] = [
      { label: "一键连续执行剧本", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "开启演示模式并跳引导页", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "跳到下一演示步骤", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "打开引导页", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "导出演示记录", actionType: "EXPORT_DEMO_LOG", payload: {} }
    ];

    if (input.context.invoiceId) {
      actions.unshift({
        label: "直接支付当前账单（Mint+Pay）",
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
        title: "读取钱包余额",
        status: Object.keys(balances).length > 0 ? "completed" : "failed",
        details: balanceLines.join(" | ")
      },
      {
        title: "可执行动作建议",
        status: "completed",
        details:
          stableBalance !== "0"
            ? `检测到可赎回余额 ${stableBalance}，可直接执行 Burn。`
            : "未检测到可赎回余额，可先执行 Mint+Pay 获得稳定币。"
      }
    ];

    const actions: SuggestedAction[] = [
      { label: "查看当前上下文", actionType: "SHOW_CONTEXT", payload: {} },
      { label: "前往赎回页", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "前往指标页", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } }
    ];

    if (stableBalance !== "0") {
      actions.unshift({
        label: "按半仓赎回",
        actionType: "REDEEM_AMOUNT",
        payload: { amount: halfOrOne(stableBalance) }
      });
    }

    if (input.context.invoiceId) {
      actions.unshift({
        label: "支付当前账单（Mint+Pay）",
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
            title: "演示闭环已完成",
            status: "completed",
            details: "四步演示已完成。建议打开指标页展示 GMV/转化率，并回放最近交易历史。"
          }
        ],
        suggestedActions: [
          { label: "打开指标页", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } },
          { label: "返回引导页", actionType: "NAVIGATE", payload: { path: "/quickstart" } }
        ]
      };
    }

    const actions: SuggestedAction[] = [];
    if (next.id === "mint_pay_flow" && input.context.invoiceId) {
      actions.push({
        label: "直接执行当前账单 Mint+Pay",
        actionType: "PAY_MINT_AND_PAY",
        payload: { invoiceId: input.context.invoiceId }
      });
    }
    actions.push({
      label: `前往：${next.title}`,
      actionType: "NAVIGATE",
      payload: { path: next.path === "/pay" && input.context.invoiceId ? `/pay/${input.context.invoiceId}` : next.path }
    });

    return {
      intent: "HELP",
      steps: [
        {
          title: "演示教练",
          status: "completed",
          details: `下一步建议：${next.title}`
        },
        {
          title: "执行提示",
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
        title: "缺少账单上下文",
        status: "failed",
        details: "当前不在 /pay/:invoiceId 页面，无法直接构建支付交易。"
      });
      actions.push({
        label: "前往商户台创建账单",
        actionType: "NAVIGATE",
        payload: { path: "/merchant" }
      });
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "读取账单信息",
      status: "in_progress",
      details: `账单 ID: ${input.context.invoiceId}`
    });

    let invoiceStatus = 0;
    let invoiceAmount = "未知";

    if (tools?.getInvoice) {
      try {
        const invoice = await tools.getInvoice(input.context.invoiceId);
        invoiceStatus = invoice.status;
        invoiceAmount = invoice.amountU64;
        steps[0] = {
          title: "读取账单信息",
          status: "completed",
          details: `金额=${invoice.amountU64}，状态=${invoiceStatusLabel(invoice.status)}，买家=${invoice.buyer || "-"}`
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "账单查询失败";
        steps[0] = {
          title: "读取账单信息",
          status: "failed",
          details: message
        };
      }
    } else {
      steps[0] = {
        title: "读取账单信息",
        status: "completed",
        details: "已拿到 invoiceId，上链详情将由页面执行动作时查询。"
      };
    }

    if (invoiceStatus === 1) {
      steps.push({
        title: "支付判断",
        status: "completed",
        details: "账单已支付，建议刷新账单状态或查询最近交易。"
      });
      actions.push({
        label: "刷新账单状态",
        actionType: "REFRESH_INVOICE",
        payload: { invoiceId: input.context.invoiceId }
      });
      if (input.context.lastDigest) {
        actions.push({
          label: "查询最近交易状态",
          actionType: "CHECK_TX_STATUS",
          payload: { digest: input.context.lastDigest }
        });
      }
      return { intent: "PAY", steps, suggestedActions: actions };
    }

    steps.push({
      title: "准备组合交易 Mint+Pay",
      status: "pending",
      details: `预计支付金额: ${invoiceAmount}（USDC -> BrandUSD -> pay_invoice）`
    });
    steps.push({
      title: "提交并验证",
      status: "pending",
      details: "交易完成后核对 digest、status、Explorer。"
    });

    actions.push({
      label: "执行一键支付（Mint+Pay）",
      actionType: "PAY_MINT_AND_PAY",
      payload: { invoiceId: input.context.invoiceId }
    });
    actions.push({
      label: "打开支付详情页",
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
        title: "检查 BrandUSD 余额",
        status: "completed",
        details: `余额（${input.context.stableCoinType || "未配置"}）: ${stableBalance}`
      },
      {
        title: "选择赎回模式",
        status: "pending",
        details: allFlag
          ? "已识别为“全部赎回”。"
          : explicitAmount
            ? `已识别为“按数量赎回”，数量=${explicitAmount}。`
            : "未指定数量，将提供推荐赎回量。"
      },
      {
        title: "签名并提交",
        status: "pending",
        details: "MVP 默认按 T+1 结算。"
      }
    ];

    const actions: SuggestedAction[] = [];
    if (allFlag) {
      actions.push({ label: "全部赎回", actionType: "REDEEM_ALL", payload: { all: true } });
    } else {
      actions.push({
        label: "按数量赎回",
        actionType: "REDEEM_AMOUNT",
        payload: { amount: explicitAmount || halfOrOne(stableBalance) }
      });
      actions.push({ label: "全部赎回", actionType: "REDEEM_ALL", payload: { all: true } });
    }
    actions.push({
      label: "打开赎回页",
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
          title: "权限检查",
          status: "pending",
          details: "当前钱包需要具备收益领取权限。"
        },
        {
          title: "构建 Claim 交易",
          status: "pending",
          details: `稳定币类型: ${input.context.stableCoinType || "未配置"}`
        },
        {
          title: "提交并复核",
          status: "pending",
          details: "完成后核对 digest、status、Explorer。"
        }
      ],
      suggestedActions: [
        { label: "执行收益领取", actionType: "CLAIM_REVENUE", payload: {} },
        { label: "打开领取页", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } }
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
            title: "缺少交易 Digest",
            status: "failed",
            details: "请提供 digest，或先执行一笔交易再查询。"
          }
        ],
        suggestedActions: [{ label: "查看帮助", actionType: "SHOW_HELP", payload: {} }]
      };
    }

    const steps: AgentStep[] = [
      {
        title: "查询交易状态",
        status: "in_progress",
        details: `digest: ${digest}`
      }
    ];

    if (tools?.getTxStatus) {
      try {
        const snapshot = await tools.getTxStatus(digest);
        steps[0] = {
          title: "查询交易状态",
          status: "completed",
          details: `状态=${snapshot.status}，Explorer=${snapshot.explorerUrl || "-"}`
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "交易状态查询失败";
        steps[0] = { title: "查询交易状态", status: "failed", details: message };
      }
    } else {
      steps[0] = {
        title: "查询交易状态",
        status: "pending",
        details: "点击动作按钮执行链上查询。"
      };
    }

    return {
      intent: "STATUS",
      steps,
      suggestedActions: [
        {
          label: "刷新交易状态",
          actionType: "CHECK_TX_STATUS",
          payload: { digest }
        }
      ]
    };
  }

  private runHelpIntent(input: AgentInput): AgentOutput {
    const actions: SuggestedAction[] = [
      { label: "一键连续执行剧本", actionType: "RUN_DEMO_PLAYBOOK", payload: {} },
      { label: "开启演示模式", actionType: "ENABLE_SMOKE_AND_GOTO_QUICKSTART", payload: {} },
      { label: "跳到下一演示步骤", actionType: "GOTO_NEXT_DEMO_STEP", payload: {} },
      { label: "打开引导页", actionType: "NAVIGATE", payload: { path: "/quickstart" } },
      { label: "去商户台", actionType: "NAVIGATE", payload: { path: "/merchant" } },
      { label: "去赎回页", actionType: "NAVIGATE", payload: { path: "/redeem" } },
      { label: "去领取页", actionType: "NAVIGATE", payload: { path: "/merchant/claim" } },
      { label: "去指标页", actionType: "NAVIGATE", payload: { path: "/merchant/metrics" } },
      { label: "查看当前上下文", actionType: "SHOW_CONTEXT", payload: {} }
    ];

    if (input.context.invoiceId) {
      actions.unshift({
        label: "支付当前账单（Mint+Pay）",
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
