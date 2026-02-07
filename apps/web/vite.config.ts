import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  resolve: {
    alias: {
      "node:buffer": "buffer"
    }
  },
  plugins: [
    {
      name: "stable-layer-sui-client-compat",
      enforce: "pre",
      resolveId(source, importer) {
        const fromStableLayerDeps =
          importer &&
          (importer.includes("stable-layer-sdk") || importer.includes("@bucket-protocol/sdk"));

        if (source === "@mysten/sui/client" && fromStableLayerDeps) {
          return path.resolve(__dirname, "src/lib/stable-layer/suiClientCompat.ts");
        }

        if (source === "@mysten/sui/transactions" && fromStableLayerDeps) {
          return path.resolve(__dirname, "src/lib/stable-layer/transactionsCompat.ts");
        }
        return null;
      }
    },
    react()
  ],
  optimizeDeps: {
    exclude: ["stable-layer-sdk"],
    include: ["buffer"]
  }
});
