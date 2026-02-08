export interface RecentTxHistoryEntry {
  id: string;
  scene: string;
  digest: string;
  status: "success" | "failure" | "unknown";
  explorerUrl: string;
  errorMessage?: string;
  receiptObjectId?: string;
  timestampMs: number;
}

const HISTORY_STORAGE_KEY = "stableflow.tx.history";
const MAX_HISTORY_ITEMS = 30;

function safeParse(raw: string | null): RecentTxHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RecentTxHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function safeGetStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadRecentTxHistory(limit = MAX_HISTORY_ITEMS): RecentTxHistoryEntry[] {
  const storage = safeGetStorage();
  if (!storage) return [];
  const entries = safeParse(storage.getItem(HISTORY_STORAGE_KEY));
  return entries
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, Math.max(0, limit));
}

export function recordRecentTxHistory(
  entry: Omit<RecentTxHistoryEntry, "id" | "timestampMs"> & { timestampMs?: number }
): void {
  const storage = safeGetStorage();
  if (!storage) return;

  const current = safeParse(storage.getItem(HISTORY_STORAGE_KEY));
  const next: RecentTxHistoryEntry = {
    ...entry,
    id: `${entry.digest}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestampMs: entry.timestampMs ?? Date.now()
  };

  const merged = [next, ...current]
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, MAX_HISTORY_ITEMS);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(merged));
}

export function clearRecentTxHistory(): void {
  const storage = safeGetStorage();
  if (!storage) return;
  storage.removeItem(HISTORY_STORAGE_KEY);
}
