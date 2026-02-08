export interface AgentEvent<TPayload = Record<string, unknown>> {
  type: string;
  payload: TPayload;
  timestamp: number;
}

export interface AgentAction<TData = Record<string, unknown>> {
  type: string;
  data: TData;
}

export interface Rule<TPayload = Record<string, unknown>> {
  id: string;
  description: string;
  when: (event: AgentEvent<TPayload>) => boolean;
  then: (
    event: AgentEvent<TPayload>
  ) => AgentAction | AgentAction[] | Promise<AgentAction | AgentAction[]>;
}

export type AgentIntent = "PAY" | "REDEEM" | "CLAIM" | "STATUS" | "HELP";

export type AgentStepStatus = "pending" | "in_progress" | "completed" | "failed";

export interface AgentStep {
  title: string;
  status: AgentStepStatus;
  details: string;
}

export interface SuggestedAction {
  label: string;
  actionType: string;
  payload?: Record<string, unknown>;
}

export interface AgentContext {
  invoiceId?: string;
  stableCoinType: string;
  balances: Record<string, string>;
  address?: string;
  currentPath?: string;
  lastDigest?: string;
}

export interface AgentMemory {
  guideMode?: boolean;
  lastIntent?: AgentIntent;
  userGoals?: string[];
  completedActions?: string[];
  recentPaths?: string[];
  recentDigests?: string[];
}

export interface AgentInput {
  userInput: string;
  context: AgentContext;
  memory?: AgentMemory;
}

export interface AgentOutput {
  intent: AgentIntent;
  steps: AgentStep[];
  suggestedActions: SuggestedAction[];
}

export interface AgentInvoiceSnapshot {
  objectId: string;
  amountU64: string;
  status: number;
  buyer?: string;
  productTitle?: string;
}

export interface AgentTxStatusSnapshot {
  digest: string;
  status: "success" | "failure" | "unknown";
  explorerUrl: string;
  errorMessage?: string;
}

export interface AgentToolbox {
  getBalances(address: string): Promise<Record<string, string>>;
  getInvoice(invoiceId: string): Promise<AgentInvoiceSnapshot>;
  buildMintAndPayTx(invoiceId: string): Promise<unknown>;
  buildBurnTx(input: { amount?: string; all?: boolean }): Promise<unknown>;
  buildClaimTx(): Promise<unknown>;
  getTxStatus(digest: string): Promise<AgentTxStatusSnapshot>;
}

export interface AgentLlmEnhancer {
  enabled: boolean;
  infer(input: AgentInput): Promise<AgentOutput | null>;
}
