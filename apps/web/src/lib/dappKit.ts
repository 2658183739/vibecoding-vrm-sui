import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { appConfig } from "../config";

export const dAppKit = createDAppKit({
  networks: [appConfig.network],
  defaultNetwork: appConfig.network,
  createClient() {
    return new SuiGraphQLClient({
      network: appConfig.network,
      url: appConfig.rpcUrl
    });
  }
});
