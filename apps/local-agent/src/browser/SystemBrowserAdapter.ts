import { spawn } from "node:child_process";
import type { BrowserAdapter } from "./BrowserAdapter.js";

export class SystemBrowserAdapter implements BrowserAdapter {
  async open(url: string): Promise<{ method: string; opened: boolean; action: "open" }> {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return { method: "system-default(windows:start)", opened: true, action: "open" };
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return { method: "system-default(macos:open)", opened: true, action: "open" };
    }

    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return { method: "system-default(linux:xdg-open)", opened: true, action: "open" };
  }

  async click(target: string): Promise<never> {
    throw new Error(`System browser fallback does not support click automation. target=${target}`);
  }

  async type(target: string, text: string): Promise<never> {
    throw new Error(
      `System browser fallback does not support type automation. target=${target}, textLength=${text.length}`
    );
  }

  async getActiveUrl(): Promise<string | null> {
    return null;
  }
}
