import { loadRecentTxHistory, type RecentTxHistoryEntry } from "./txHistory";

export interface DemoStepStatus {
  id: string;
  title: string;
  description: string;
  actionPath: string;
  completed: boolean;
}

function hasSuccessfulScene(entries: RecentTxHistoryEntry[], scene: string): boolean {
  return entries.some((entry) => entry.scene === scene && entry.status === "success");
}

export function computeQuickstartSteps(entries: RecentTxHistoryEntry[]): DemoStepStatus[] {
  const createdProduct = hasSuccessfulScene(entries, "merchant.create_product");
  const createdInvoice = hasSuccessfulScene(entries, "merchant.create_invoice");
  const mintAndPay = hasSuccessfulScene(entries, "pay.mint_and_pay");
  const redeemed =
    hasSuccessfulScene(entries, "redeem.burn_amount") || hasSuccessfulScene(entries, "redeem.burn_all");
  const claimed = hasSuccessfulScene(entries, "merchant.claim");

  return [
    {
      id: "merchant_flow",
      title: "Create Product & Invoice",
      description: "Create Product + Invoice in Merchant Console.",
      actionPath: "/merchant",
      completed: createdProduct && createdInvoice
    },
    {
      id: "mint_pay_flow",
      title: "USDC One-Click Pay",
      description: "Complete Mint (USDC->BrandUSD) + Pay in one transaction.",
      actionPath: "/merchant",
      completed: mintAndPay
    },
    {
      id: "redeem_flow",
      title: "Redeem (T+1)",
      description: "Execute Burn amount or Burn all.",
      actionPath: "/redeem",
      completed: redeemed
    },
    {
      id: "claim_flow",
      title: "Merchant Claim Revenue",
      description: "Execute Claim transaction and check status feedback.",
      actionPath: "/merchant/claim",
      completed: claimed
    }
  ];
}

export function loadQuickstartProgress(): {
  entries: RecentTxHistoryEntry[];
  completed: number;
  total: number;
  percentage: number;
  steps: DemoStepStatus[];
} {
  const entries = loadRecentTxHistory(100);
  const steps = computeQuickstartSteps(entries);
  const total = steps.length;
  const completed = steps.filter((step) => step.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    entries,
    completed,
    total,
    percentage,
    steps
  };
}
