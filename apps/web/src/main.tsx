import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { Buffer } from "buffer";
import "@heroui/react/styles";
import App from "./App";
import { dAppKit } from "./lib/dappKit";
import "./index.css";

type PolyfillGlobal = typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: {
    env: Record<string, string | undefined>;
    browser?: boolean;
  };
};

const globalWithPolyfill = globalThis as PolyfillGlobal;

if (!globalWithPolyfill.Buffer) {
  globalWithPolyfill.Buffer = Buffer;
}
if (!globalWithPolyfill.process) {
  globalWithPolyfill.process = { env: {}, browser: true };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <HashRouter>
        <App />
      </HashRouter>
    </DAppKitProvider>
  </React.StrictMode>
);
