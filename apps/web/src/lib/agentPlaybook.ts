import type { Transaction } from "@mysten/sui/transactions";
import { appConfig } from "../config";
import { isSmokeMode } from "./smokeMode";
import {
  smokeBurn,
  smokeClaim,
  smokeCreateInvoice,
  smokeCreateProduct,
  smokeGetInvoice,
  smokeListInvoices,
  smokeListProducts,
  smokePayInvoice,
  type SmokeTxFeedback
} from "./smokeState";
import { buildClaimTx } from "./stablelayer";
import { recordRecentTxHistory } from "./txHistory";
import {
  buildCreateInvoiceTx,
  buildCreateProductTx,
  fetchCoinBalance,
  fetchInvoice,
  fetchInvoices,
  fetchProducts,
  findCreatedObjectIdByStructName,
  normalizeTxFeedback,
  parseErrorMessage,
  type TxFeedback
} from "./sui";
import { buildBurnTx } from "./tx/buildBurnTx";
import { buildMintAndPayTx } from "./tx/buildMintAndPayTx";

export type PlaybookStepKey =
  | "create_product"
  | "create_invoice"
  | "mint_and_pay"
  | "burn"
  | "claim";

export type PlaybookStepStatus = "in_progress" | "success" | "failure" | "skipped";

export interface PlaybookStepUpdate {
  key: PlaybookStepKey;
  title: string;
  status: PlaybookStepStatus;
  details: string;
  tx?: TxFeedback;
  productId?: string;
  invoiceId?: string;
}

export interface RunAgentPlaybookInput {
  owner: string;
  signAndExecuteTransaction: (input: { transaction: Transaction }) => Promise<unknown>;
  onStepUpdate?: (step: PlaybookStepUpdate) => void;
  productTitle?: string;
  productPriceU64?: bigint;
}

export interface RunAgentPlaybookResult {
  success: boolean;
  steps: PlaybookStepUpdate[];
  productId?: string;
  invoiceId?: string;
  lastTx?: TxFeedback;
  errorMessage?: string;
}

function emit(
  steps: PlaybookStepUpdate[],
  onStepUpdate: RunAgentPlaybookInput["onStepUpdate"],
  step: PlaybookStepUpdate
): void {
  steps.push(step);
  onStepUpdate?.(step);
}

function toTxFeedbackFromSmoke(input: SmokeTxFeedback): TxFeedback {
  return {
    digest: input.digest,
    status: input.status,
    explorerUrl: input.explorerUrl,
    errorMessage: input.errorMessage,
    receiptObjectId: input.receiptObjectId
  };
}

function ensureSuccessTx(feedback: TxFeedback, fallbackMessage: string): void {
  if (feedback.status === "success") return;
  throw new Error(feedback.errorMessage || fallbackMessage);
}

function defaultProductTitle(): string {
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  return `AgentPlaybook-${stamp}`;
}

async function executeTx(
  scene: string,
  txFactory: () => Promise<Transaction> | Transaction,
  signAndExecuteTransaction: RunAgentPlaybookInput["signAndExecuteTransaction"]
): Promise<TxFeedback> {
  const tx = await txFactory();
  const result = await signAndExecuteTransaction({ transaction: tx });
  const feedback = await normalizeTxFeedback(result as never);

  recordRecentTxHistory({
    scene,
    digest: feedback.digest,
    status: feedback.status,
    explorerUrl: feedback.explorerUrl,
    errorMessage: feedback.errorMessage,
    receiptObjectId: feedback.receiptObjectId
  });

  return feedback;
}

export async function runAgentFullPlaybook(
  input: RunAgentPlaybookInput
): Promise<RunAgentPlaybookResult> {
  const steps: PlaybookStepUpdate[] = [];
  let lastTx: TxFeedback | undefined;
  let productId: string | undefined;
  let invoiceId: string | undefined;

  const priceU64 = input.productPriceU64 && input.productPriceU64 > 0n ? input.productPriceU64 : 100n;
  const title = input.productTitle?.trim() || defaultProductTitle();
  const merchantId = appConfig.objectIds.merchantId || "0xsmoke_merchant";

  try {
    emit(steps, input.onStepUpdate, {
      key: "create_product",
      title: "创建商品",
      status: "in_progress",
      details: `标题=${title}，价格=${priceU64.toString()}`
    });

    if (isSmokeMode()) {
      const feedback = toTxFeedbackFromSmoke(
        smokeCreateProduct({
          owner: input.owner,
          merchantId,
          title,
          priceU64
        })
      );
      ensureSuccessTx(feedback, "创建商品失败。");
      lastTx = feedback;

      const list = smokeListProducts(input.owner);
      productId = list[list.length - 1]?.objectId;
      if (!productId) throw new Error("创建商品后未找到 productId。");

      emit(steps, input.onStepUpdate, {
        key: "create_product",
        title: "创建商品",
        status: "success",
        details: `productId=${productId}`,
        tx: feedback,
        productId
      });
    } else {
      const before = new Set((await fetchProducts(input.owner)).map((item) => item.objectId));
      const feedback = await executeTx(
        "agent.playbook.create_product",
        () => buildCreateProductTx({ title, priceU64 }),
        input.signAndExecuteTransaction
      );
      ensureSuccessTx(feedback, "创建商品失败。");
      lastTx = feedback;

      productId = await findCreatedObjectIdByStructName(feedback.digest, appConfig.contract.productTypeName);
      if (!productId) {
        const after = await fetchProducts(input.owner);
        productId = after.find((item) => !before.has(item.objectId))?.objectId;
      }
      if (!productId) throw new Error("创建商品后未解析到 productId。");

      emit(steps, input.onStepUpdate, {
        key: "create_product",
        title: "创建商品",
        status: "success",
        details: `productId=${productId}`,
        tx: feedback,
        productId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "create_invoice",
      title: "创建账单",
      status: "in_progress",
      details: `productId=${productId}`
    });

    if (isSmokeMode()) {
      const feedback = toTxFeedbackFromSmoke(
        smokeCreateInvoice({
          owner: input.owner,
          merchantId,
          productId: productId!
        })
      );
      ensureSuccessTx(feedback, "创建账单失败。");
      lastTx = feedback;

      const list = smokeListInvoices(input.owner);
      invoiceId = list[list.length - 1]?.objectId;
      if (!invoiceId) throw new Error("创建账单后未找到 invoiceId。");

      emit(steps, input.onStepUpdate, {
        key: "create_invoice",
        title: "创建账单",
        status: "success",
        details: `invoiceId=${invoiceId}`,
        tx: feedback,
        invoiceId
      });
    } else {
      const before = new Set((await fetchInvoices(input.owner)).map((item) => item.objectId));
      const feedback = await executeTx(
        "agent.playbook.create_invoice",
        () =>
          buildCreateInvoiceTx({
            owner: input.owner,
            productId: productId!
          }),
        input.signAndExecuteTransaction
      );
      ensureSuccessTx(feedback, "创建账单失败。");
      lastTx = feedback;

      invoiceId = await findCreatedObjectIdByStructName(feedback.digest, appConfig.contract.invoiceTypeName);
      if (!invoiceId) {
        const after = await fetchInvoices(input.owner);
        invoiceId = after.find((item) => !before.has(item.objectId))?.objectId;
      }
      if (!invoiceId) throw new Error("创建账单后未解析到 invoiceId。");

      emit(steps, input.onStepUpdate, {
        key: "create_invoice",
        title: "创建账单",
        status: "success",
        details: `invoiceId=${invoiceId}`,
        tx: feedback,
        invoiceId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "mint_and_pay",
      title: "执行 Mint+Pay",
      status: "in_progress",
      details: `invoiceId=${invoiceId}`
    });

    if (isSmokeMode()) {
      const smokeInvoice = smokeGetInvoice(invoiceId!);
      if (!smokeInvoice) throw new Error("账单不存在，无法执行 Mint+Pay。");
      const feedback = toTxFeedbackFromSmoke(
        smokePayInvoice({
          invoiceId: smokeInvoice.objectId,
          buyer: input.owner,
          amountU64: smokeInvoice.amountU64
        })
      );
      ensureSuccessTx(feedback, "Mint+Pay 执行失败。");
      lastTx = feedback;

      emit(steps, input.onStepUpdate, {
        key: "mint_and_pay",
        title: "执行 Mint+Pay",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback,
        invoiceId
      });
    } else {
      const invoice = await fetchInvoice(invoiceId!);
      const built = await buildMintAndPayTx({
        owner: input.owner,
        merchantId: invoice.merchantId,
        invoiceId: invoice.objectId,
        amountU64: invoice.amountU64
      });
      const feedback = await executeTx(
        "agent.playbook.mint_and_pay",
        () => built.tx,
        input.signAndExecuteTransaction
      );
      ensureSuccessTx(feedback, "Mint+Pay 执行失败。");
      lastTx = feedback;

      emit(steps, input.onStepUpdate, {
        key: "mint_and_pay",
        title: "执行 Mint+Pay",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback,
        invoiceId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "burn",
      title: "执行 Burn",
      status: "in_progress",
      details: "优先尝试全部赎回。"
    });

    if (isSmokeMode()) {
      const stableCoinType = appConfig.stableLayer.stableCoinType || "0xsmoke::brandusd::BRAND_USD";
      const feedback = toTxFeedbackFromSmoke(
        smokeBurn({
          owner: input.owner,
          coinType: stableCoinType,
          mode: "all"
        })
      );
      if (feedback.status !== "success") {
        emit(steps, input.onStepUpdate, {
          key: "burn",
          title: "执行 Burn",
          status: "failure",
          details: feedback.errorMessage || "Burn 失败。",
          tx: feedback
        });
        return {
          success: false,
          steps,
          productId,
          invoiceId,
          lastTx: feedback,
          errorMessage: feedback.errorMessage || "Burn 失败。"
        };
      }
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "burn",
        title: "执行 Burn",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback
      });
    } else {
      const stableCoinType = appConfig.stableLayer.stableCoinType;
      if (!stableCoinType) {
        throw new Error("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
      }

      const balance = await fetchCoinBalance(input.owner, stableCoinType);
      if (balance <= 0n) {
        emit(steps, input.onStepUpdate, {
          key: "burn",
          title: "执行 Burn",
          status: "skipped",
          details: "当前 BrandUSD 余额为 0，已跳过赎回步骤。"
        });
      } else {
        const built = await buildBurnTx({ owner: input.owner, mode: "all" });
        const feedback = await executeTx(
          "agent.playbook.burn",
          () => built.tx,
          input.signAndExecuteTransaction
        );
        ensureSuccessTx(feedback, "Burn 失败。");
        lastTx = feedback;
        emit(steps, input.onStepUpdate, {
          key: "burn",
          title: "执行 Burn",
          status: "success",
          details: `digest=${feedback.digest}`,
          tx: feedback
        });
      }
    }

    emit(steps, input.onStepUpdate, {
      key: "claim",
      title: "执行 Claim",
      status: "in_progress",
      details: "发起收益领取交易。"
    });

    if (isSmokeMode()) {
      const feedback = toTxFeedbackFromSmoke(smokeClaim(input.owner));
      ensureSuccessTx(feedback, "Claim 失败。");
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "claim",
        title: "执行 Claim",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback
      });
    } else {
      const claimTx = await buildClaimTx(input.owner);
      const feedback = await executeTx(
        "agent.playbook.claim",
        () => claimTx,
        input.signAndExecuteTransaction
      );
      ensureSuccessTx(feedback, "Claim 失败。");
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "claim",
        title: "执行 Claim",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback
      });
    }

    return {
      success: true,
      steps,
      productId,
      invoiceId,
      lastTx
    };
  } catch (error) {
    const message = parseErrorMessage(error);
    const fallback: PlaybookStepUpdate = {
      key: "claim",
      title: "剧本终止",
      status: "failure",
      details: message
    };
    emit(steps, input.onStepUpdate, fallback);

    return {
      success: false,
      steps,
      productId,
      invoiceId,
      lastTx,
      errorMessage: message
    };
  }
}
