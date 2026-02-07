import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { Buffer } from "buffer";
import "@heroui/react/styles";
import App from "./App";
import { dAppKit } from "./lib/dappKit";
import "./index.css";

if (!("Buffer" in globalThis)) {
  (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer = Buffer;
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
