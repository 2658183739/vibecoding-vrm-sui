import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmProvider, LocalAgentConfig } from "./types.js";

const HOME_CONFIG_PATH = path.join(os.homedir(), ".stableclaw", "config.json");
const PROJECT_CONFIG_PATH = path.resolve(process.cwd(), ".local", "config.json");

interface LoadedConfig {
  config: LocalAgentConfig;
  filePath: string;
}

const ALLOWED_LLM_PROVIDERS: LlmProvider[] = ["openai", "anthropic", "none"];

function normalizeProvider(input: unknown): LlmProvider {
  if (typeof input !== "string") return "none";
  const normalized = input.trim().toLowerCase();
  if (ALLOWED_LLM_PROVIDERS.includes(normalized as LlmProvider)) {
    return normalized as LlmProvider;
  }
  return "none";
}

function normalizeAllowlist(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const value = item.trim().toLowerCase();
    if (!value) continue;
    seen.add(value);
  }
  return [...seen];
}

function defaultAllowlist(): string[] {
  const defaults = new Set<string>([
    "localhost",
    "127.0.0.1",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "2658183739.github.io"
  ]);

  const envDomain = process.env.DEFAULT_DAPP_DOMAIN?.trim().toLowerCase();
  if (envDomain) defaults.add(envDomain);

  const envOrigin = process.env.DEFAULT_DAPP_ORIGIN?.trim().toLowerCase();
  if (envOrigin) defaults.add(envOrigin);

  return [...defaults];
}

function defaultConfig(): LocalAgentConfig {
  const llmProvider = normalizeProvider(process.env.LLM_PROVIDER);
  return {
    domainAllowlist: defaultAllowlist(),
    llmEnabled: llmProvider !== "none" && Boolean(process.env.LLM_API_KEY),
    llmProvider
  };
}

function mergeConfig(base: LocalAgentConfig, override: Partial<LocalAgentConfig>): LocalAgentConfig {
  return {
    domainAllowlist:
      override.domainAllowlist && override.domainAllowlist.length > 0
        ? normalizeAllowlist(override.domainAllowlist)
        : normalizeAllowlist(base.domainAllowlist),
    llmEnabled: typeof override.llmEnabled === "boolean" ? override.llmEnabled : base.llmEnabled,
    llmProvider:
      typeof override.llmProvider === "string"
        ? normalizeProvider(override.llmProvider)
        : base.llmProvider
  };
}

async function parseFile(filePath: string): Promise<LocalAgentConfig | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalAgentConfig>;
    return mergeConfig(defaultConfig(), parsed);
  } catch {
    return null;
  }
}

async function writeConfig(filePath: string, config: LocalAgentConfig): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
}

async function detectWritablePath(): Promise<string> {
  try {
    await mkdir(path.dirname(HOME_CONFIG_PATH), { recursive: true });
    return HOME_CONFIG_PATH;
  } catch {
    await mkdir(path.dirname(PROJECT_CONFIG_PATH), { recursive: true });
    return PROJECT_CONFIG_PATH;
  }
}

export function sanitizeConfigPatch(input: unknown): Partial<LocalAgentConfig> {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const patch: Partial<LocalAgentConfig> = {};

  if ("domainAllowlist" in obj) {
    patch.domainAllowlist = normalizeAllowlist(obj.domainAllowlist);
  }
  if ("llmEnabled" in obj && typeof obj.llmEnabled === "boolean") {
    patch.llmEnabled = obj.llmEnabled;
  }
  if ("llmProvider" in obj) {
    patch.llmProvider = normalizeProvider(obj.llmProvider);
  }
  return patch;
}

export async function loadConfig(): Promise<LoadedConfig> {
  const existingHome = await parseFile(HOME_CONFIG_PATH);
  if (existingHome) {
    return { config: existingHome, filePath: HOME_CONFIG_PATH };
  }

  const existingProject = await parseFile(PROJECT_CONFIG_PATH);
  if (existingProject) {
    return { config: existingProject, filePath: PROJECT_CONFIG_PATH };
  }

  const filePath = await detectWritablePath();
  const config = defaultConfig();
  await writeConfig(filePath, config);
  return { config, filePath };
}

export async function updateConfig(
  current: LoadedConfig,
  patch: Partial<LocalAgentConfig>
): Promise<LoadedConfig> {
  const nextConfig = mergeConfig(current.config, patch);

  try {
    await writeConfig(current.filePath, nextConfig);
    return { config: nextConfig, filePath: current.filePath };
  } catch {
    const fallbackPath = PROJECT_CONFIG_PATH;
    await writeConfig(fallbackPath, nextConfig);
    return { config: nextConfig, filePath: fallbackPath };
  }
}

