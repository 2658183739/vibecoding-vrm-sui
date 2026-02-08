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
      title: "Create Product",
      status: "in_progress",
      details: `Title=${title}, Price=${priceU64.toString()}`
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
      ensureSuccessTx(feedback, "Create Product Failed.");
      lastTx = feedback;

      const list = smokeListProducts(input.owner);
      productId = list[list.length - 1]?.objectId;
      if (!productId) throw new Error("Product ID not found after creation.");

      emit(steps, input.onStepUpdate, {
        key: "create_product",
        title: "Create Product",
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
      ensureSuccessTx(feedback, "Create Product Failed.");
      lastTx = feedback;

      productId = await findCreatedObjectIdByStructName(feedback.digest, appConfig.contract.productTypeName);
      if (!productId) {
        const after = await fetchProducts(input.owner);
        productId = after.find((item) => !before.has(item.objectId))?.objectId;
      }
      if (!productId) throw new Error("Product ID not resolved after creation.");

      emit(steps, input.onStepUpdate, {
        key: "create_product",
        title: "Create Product",
        status: "success",
        details: `productId=${productId}`,
        tx: feedback,
        productId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "create_invoice",
      title: "Create Invoice",
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
      ensureSuccessTx(feedback, "Create Invoice Failed.");
      lastTx = feedback;

      const list = smokeListInvoices(input.owner);
      invoiceId = list[list.length - 1]?.objectId;
      if (!invoiceId) throw new Error("Invoice ID not found after creation.");

      emit(steps, input.onStepUpdate, {
        key: "create_invoice",
        title: "Create Invoice",
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
      ensureSuccessTx(feedback, "Create Invoice Failed.");
      lastTx = feedback;

      invoiceId = await findCreatedObjectIdByStructName(feedback.digest, appConfig.contract.invoiceTypeName);
      if (!invoiceId) {
        const after = await fetchInvoices(input.owner);
        invoiceId = after.find((item) => !before.has(item.objectId))?.objectId;
      }
      if (!invoiceId) throw new Error("Invoice ID not resolved after creation.");

      emit(steps, input.onStepUpdate, {
        key: "create_invoice",
        title: "Create Invoice",
        status: "success",
        details: `invoiceId=${invoiceId}`,
        tx: feedback,
        invoiceId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "mint_and_pay",
      title: "Execute Mint+Pay",
      status: "in_progress",
      details: `invoiceId=${invoiceId}`
    });

    if (isSmokeMode()) {
      const smokeInvoice = smokeGetInvoice(invoiceId!);
      if (!smokeInvoice) throw new Error("Invoice not found, cannot execute Mint+Pay.");
      const feedback = toTxFeedbackFromSmoke(
        smokePayInvoice({
          invoiceId: smokeInvoice.objectId,
          buyer: input.owner,
          amountU64: smokeInvoice.amountU64
        })
      );
      ensureSuccessTx(feedback, "Mint+Pay Failed.");
      lastTx = feedback;

      emit(steps, input.onStepUpdate, {
        key: "mint_and_pay",
        title: "Execute Mint+Pay",
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
      ensureSuccessTx(feedback, "Mint+Pay Failed.");
      lastTx = feedback;

      emit(steps, input.onStepUpdate, {
        key: "mint_and_pay",
        title: "Execute Mint+Pay",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback,
        invoiceId
      });
    }

    emit(steps, input.onStepUpdate, {
      key: "burn",
      title: "Execute Burn",
      status: "in_progress",
      details: "Try redeem all first."
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
          title: "Execute Burn",
          status: "failure",
          details: feedback.errorMessage || "Burn Failed.",
          tx: feedback
        });
        return {
          success: false,
          steps,
          productId,
          invoiceId,
          lastTx: feedback,
          errorMessage: feedback.errorMessage || "Burn Failed."
        };
      }
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "burn",
        title: "Execute Burn",
        status: "success",
        details: `digest=${feedback.digest}`,
        tx: feedback
      });
    } else {
      const stableCoinType = appConfig.stableLayer.stableCoinType;
      if (!stableCoinType) {
        throw new Error("Missing VITE_STABLE_LAYER_STABLE_COIN_TYPE config.");
      }

      const balance = await fetchCoinBalance(input.owner, stableCoinType);
      if (balance <= 0n) {
        emit(steps, input.onStepUpdate, {
          key: "burn",
          title: "Execute Burn",
          status: "skipped",
          details: "BrandUSD balance is 0, skip redemption."
        });
      } else {
        const built = await buildBurnTx({ owner: input.owner, mode: "all" });
        const feedback = await executeTx(
          "agent.playbook.burn",
          () => built.tx,
          input.signAndExecuteTransaction
        );
        ensureSuccessTx(feedback, "Burn Failed.");
        lastTx = feedback;
        emit(steps, input.onStepUpdate, {
          key: "burn",
          title: "Execute Burn",
          status: "success",
          details: `digest=${feedback.digest}`,
          tx: feedback
        });
      }
    }

    emit(steps, input.onStepUpdate, {
      key: "claim",
      title: "Execute Claim",
      status: "in_progress",
      details: "Initiate claim revenue transaction."
    });

    if (isSmokeMode()) {
      const feedback = toTxFeedbackFromSmoke(smokeClaim(input.owner));
      ensureSuccessTx(feedback, "Claim Failed.");
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "claim",
        title: "Execute Claim",
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
      ensureSuccessTx(feedback, "Claim Failed.");
      lastTx = feedback;
      emit(steps, input.onStepUpdate, {
        key: "claim",
        title: "Execute Claim",
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
      title: "Playbook Aborted",
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
