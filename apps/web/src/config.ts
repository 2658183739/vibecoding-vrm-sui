import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";
export type StableLayerNetwork = "mainnet" | "testnet";

function asPositiveBigInt(input: string | undefined, fallback: bigint): bigint {
  if (!input) return fallback;
  try {
    const parsed = BigInt(input);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function asNetwork(input?: string): SuiNetwork {
  if (input === "mainnet" || input === "testnet" || input === "devnet" || input === "localnet") {
    return input;
  }
  return "testnet";
}

const network = asNetwork(import.meta.env.VITE_SUI_NETWORK);
const defaultStableLayerNetwork: StableLayerNetwork = network === "mainnet" ? "mainnet" : "testnet";

function asStableLayerNetwork(input?: string): StableLayerNetwork {
  if (input === "mainnet" || input === "testnet") {
    return input;
  }
  return defaultStableLayerNetwork;
}

function defaultExplorerBase(currentNetwork: SuiNetwork): string {
  if (currentNetwork === "mainnet") return "https://suivision.xyz/txblock/";
  if (currentNetwork === "localnet") return "";
  return "https://testnet.suivision.xyz/txblock/";
}

export const appConfig = {
  network,
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || getJsonRpcFullnodeUrl(network),
  explorerTxBase: import.meta.env.VITE_SUI_EXPLORER_TX_BASE || defaultExplorerBase(network),
  contract: {
    packageId: import.meta.env.VITE_PACKAGE_ID || "0x0",
    moduleName: import.meta.env.VITE_MODULE_NAME || "checkout",
    merchantTypeName: import.meta.env.VITE_MERCHANT_TYPE_NAME || "Merchant",
    productTypeName: import.meta.env.VITE_PRODUCT_TYPE_NAME || "Product",
    invoiceTypeName: import.meta.env.VITE_INVOICE_TYPE_NAME || "Invoice",
    receiptTypeName: import.meta.env.VITE_RECEIPT_TYPE_NAME || "Receipt",
    createProductFn: import.meta.env.VITE_CREATE_PRODUCT_FN || "create_product",
    createInvoiceFn: import.meta.env.VITE_CREATE_INVOICE_FN || "create_invoice_and_transfer",
    payInvoiceFn: import.meta.env.VITE_PAY_INVOICE_FN || "pay_invoice_and_transfer",
    payCoinType: import.meta.env.VITE_PAY_COIN_TYPE || "0x2::sui::SUI"
  },
  stableLayer: {
    network: asStableLayerNetwork(import.meta.env.VITE_STABLE_LAYER_NETWORK),
    stableCoinType: import.meta.env.VITE_STABLE_LAYER_STABLE_COIN_TYPE || "",
    brandUsdType: import.meta.env.VITE_STABLE_LAYER_BRAND_USD_TYPE || "",
    usdcType: import.meta.env.VITE_STABLE_LAYER_USDC_TYPE || ""
  },
  objectIds: {
    merchantId: import.meta.env.VITE_MERCHANT_ID || ""
  },
  agent: {
    endpoint: import.meta.env.VITE_AGENT_ENDPOINT || "",
    model: import.meta.env.VITE_AGENT_MODEL || "qwen3-max",
    enableLlmMode: import.meta.env.VITE_AGENT_LLM_MODE === "1"
  },
  policy: {
    maxMintAndPayAmountU64: asPositiveBigInt(
      import.meta.env.VITE_POLICY_MAX_MINT_AND_PAY_AMOUNT_U64,
      200n
    )
  }
} as const;

export function assertRequiredConfigForMerchant(): void {
  if (appConfig.contract.packageId === "0x0") {
    throw new Error("缺少 VITE_PACKAGE_ID 配置。");
  }
  if (!appConfig.objectIds.merchantId) {
    throw new Error("缺少 VITE_MERCHANT_ID 配置。");
  }
}

export function assertRequiredConfigForPay(): void {
  if (appConfig.contract.packageId === "0x0") {
    throw new Error("缺少 VITE_PACKAGE_ID 配置。");
  }
}

export function assertRequiredConfigForStableLayerMintPay(): void {
  assertRequiredConfigForPay();

  if (!appConfig.stableLayer.stableCoinType) {
    throw new Error("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
  }
  if (!appConfig.stableLayer.brandUsdType) {
    throw new Error("缺少 VITE_STABLE_LAYER_BRAND_USD_TYPE 配置。");
  }
  if (!appConfig.stableLayer.usdcType) {
    throw new Error("缺少 VITE_STABLE_LAYER_USDC_TYPE 配置。");
  }
}

export function assertRequiredConfigForStableLayerBurn(): void {
  assertRequiredConfigForPay();

  if (!appConfig.stableLayer.stableCoinType) {
    throw new Error("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
  }
}

export function assertRequiredConfigForStableLayerCore(): void {
  if (!appConfig.stableLayer.stableCoinType) {
    throw new Error("缺少 VITE_STABLE_LAYER_STABLE_COIN_TYPE 配置。");
  }
}

export function toExplorerTxUrl(digest: string): string {
  if (!appConfig.explorerTxBase) return "";
  return `${appConfig.explorerTxBase}${digest}`;
}
