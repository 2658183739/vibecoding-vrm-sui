import { spawn } from "node:child_process";
import type { BrowserAdapter, BrowserCommandResult } from "./BrowserAdapter.js";

interface OpenClawBrowserAdapterOptions {
  cliBin?: string;
  browserProfile?: string;
  timeoutMs?: number;
}

interface CommandOutput {
  stdout: string;
  stderr: string;
}

export class OpenClawCommandError extends Error {
  readonly details?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    command?: string;
  };

  constructor(
    message: string,
    details?: { stdout?: string; stderr?: string; exitCode?: number; command?: string }
  ) {
    super(message);
    this.name = "OpenClawCommandError";
    this.details = details;
  }
}

function firstUrlLike(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function normalizeMaybeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed;
}

function pickActiveUrlFromJson(parsed: unknown): string | null {
  if (Array.isArray(parsed)) {
    const active = parsed.find((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return row.active === true || row.selected === true || row.focused === true;
    }) as Record<string, unknown> | undefined;
    const row = active || (parsed[0] as Record<string, unknown> | undefined);
    if (!row) return null;
    return (
      normalizeMaybeUrl(row.url) ||
      normalizeMaybeUrl(row.href) ||
      normalizeMaybeUrl(row.currentUrl) ||
      null
    );
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.tabs)) return pickActiveUrlFromJson(obj.tabs);
  return (
    normalizeMaybeUrl(obj.url) ||
    normalizeMaybeUrl(obj.href) ||
    normalizeMaybeUrl(obj.currentUrl) ||
    null
  );
}

export class OpenClawBrowserAdapter implements BrowserAdapter {
  private readonly cliBin: string;
  private readonly browserProfile: string;
  private readonly timeoutMs: number;
  private started = false;

  constructor(options: OpenClawBrowserAdapterOptions = {}) {
    this.cliBin = options.cliBin || process.env.OPENCLAW_CLI_BIN || "openclaw";
    this.browserProfile =
      options.browserProfile || process.env.OPENCLAW_BROWSER_PROFILE || "openclaw";
    this.timeoutMs = options.timeoutMs || 20_000;
  }

  private args(command: string, ...rest: string[]): string[] {
    return ["browser", "--browser-profile", this.browserProfile, command, ...rest];
  }

  private run(args: string[]): Promise<CommandOutput> {
    return new Promise((resolve, reject) => {
      const commandLine = `${this.cliBin} ${args.join(" ")}`;
      const child = spawn(this.cliBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new OpenClawCommandError("OpenClaw command timeout.", {
            stdout,
            stderr,
            command: commandLine
          })
        );
      }, this.timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new OpenClawCommandError(`Failed to execute OpenClaw CLI: ${error.message}`, {
            stdout,
            stderr,
            command: commandLine
          })
        );
      });

      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (exitCode === 0) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          return;
        }

        reject(
          new OpenClawCommandError(`OpenClaw command failed with exit code ${exitCode}.`, {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? undefined,
            command: commandLine
          })
        );
      });
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.run(this.args("start"));
    this.started = true;
  }

  async open(url: string): Promise<BrowserCommandResult> {
    await this.ensureStarted();
    await this.run(this.args("open", url));
    return {
      method: "openclaw-cli",
      opened: true,
      action: "open",
      target: url
    };
  }

  async click(target: string): Promise<BrowserCommandResult> {
    await this.ensureStarted();
    await this.run(this.args("click", target));
    return {
      method: "openclaw-cli",
      action: "click",
      target
    };
  }

  async type(target: string, text: string): Promise<BrowserCommandResult> {
    await this.ensureStarted();
    await this.run(this.args("type", target, text));
    return {
      method: "openclaw-cli",
      action: "type",
      target
    };
  }

  async getActiveUrl(): Promise<string | null> {
    await this.ensureStarted();

    try {
      const output = await this.run(this.args("tabs", "--json"));
      const parsed = JSON.parse(output.stdout);
      const fromJson = pickActiveUrlFromJson(parsed);
      if (fromJson) return fromJson;
      return firstUrlLike(output.stdout);
    } catch {
      try {
        const fallback = await this.run(this.args("tabs"));
        return firstUrlLike(fallback.stdout) || firstUrlLike(fallback.stderr);
      } catch {
        return null;
      }
    }
  }
}

