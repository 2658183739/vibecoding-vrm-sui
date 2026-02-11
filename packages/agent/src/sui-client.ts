import { SuiGraphQLClient } from "@mysten/sui/graphql";

export type AgentSuiNetwork = "mainnet" | "testnet" | "devnet";

const GRAPHQL_ENDPOINTS: Record<AgentSuiNetwork, string> = {
  mainnet: "https://sui-mainnet.mystenlabs.com/graphql",
  testnet: "https://sui-testnet.mystenlabs.com/graphql",
  devnet: "https://sui-devnet.mystenlabs.com/graphql"
};

export function getSuiGraphqlUrl(network: AgentSuiNetwork): string {
  return GRAPHQL_ENDPOINTS[network];
}

export function createSuiClient(network: AgentSuiNetwork = "testnet"): SuiGraphQLClient {
  return new SuiGraphQLClient({
    network,
    url: getSuiGraphqlUrl(network)
  });
}
