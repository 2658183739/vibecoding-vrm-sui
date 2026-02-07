import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export function createSuiClient(
  network: "mainnet" | "testnet" | "devnet" = "testnet"
): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ network, url: getJsonRpcFullnodeUrl(network) });
}
