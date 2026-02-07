import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { appConfig } from "../config";

export const dAppKit = createDAppKit({
  networks: [appConfig.network],
  defaultNetwork: appConfig.network,
  createClient() {
    return new SuiJsonRpcClient({
      network: appConfig.network,
      url: appConfig.rpcUrl
    });
  }
});
