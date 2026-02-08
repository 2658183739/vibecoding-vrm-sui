const SMOKE_QUERY_KEY = "smoke";

function readWindowFlag(): boolean {
  if (typeof window === "undefined") return false;

  const fullUrl = new URL(window.location.href);
  if (fullUrl.searchParams.get(SMOKE_QUERY_KEY) === "1") return true;

  // Support hash router style: #/quickstart?smoke=1
  const hashQueryIndex = fullUrl.hash.indexOf("?");
  if (hashQueryIndex >= 0) {
    const hashSearch = new URLSearchParams(fullUrl.hash.slice(hashQueryIndex + 1));
    if (hashSearch.get(SMOKE_QUERY_KEY) === "1") return true;
  }

  return false;
}

export function isSmokeMode(): boolean {
  return readWindowFlag();
}

export function setSmokeMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  const nextUrl = new URL(window.location.href);
  if (enabled) nextUrl.searchParams.set(SMOKE_QUERY_KEY, "1");
  else nextUrl.searchParams.delete(SMOKE_QUERY_KEY);
  window.history.replaceState({}, "", nextUrl.toString());
}

export const SMOKE_WALLET_ADDRESS =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
