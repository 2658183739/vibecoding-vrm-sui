import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

type LegacyNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

interface LegacySuiClientOptions {
  url: string;
  network?: LegacyNetwork;
}

function inferNetworkFromUrl(url: string): LegacyNetwork {
  if (url.includes("mainnet")) return "mainnet";
  if (url.includes("devnet")) return "devnet";
  if (url.includes("127.0.0.1") || url.includes("localhost")) return "localnet";
  return "testnet";
}

export class SuiClient extends SuiJsonRpcClient {
  constructor(options: LegacySuiClientOptions) {
    super({
      network: options.network ?? inferNetworkFromUrl(options.url),
      url: options.url
    });
  }
}

export function getFullnodeUrl(network: LegacyNetwork): string {
  return getJsonRpcFullnodeUrl(network);
}
