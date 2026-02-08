export function isUrlAllowed(
  targetUrl: string,
  allowlist: string[]
): { allowed: true; normalizedUrl: string } | { allowed: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: "Invalid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "Only http/https URLs are allowed." };
  }

  const normalizedHost = parsed.hostname.toLowerCase();
  const normalizedOrigin = parsed.origin.toLowerCase();
  const rules = allowlist.map((item) => item.trim().toLowerCase()).filter(Boolean);

  for (const rule of rules) {
    if (rule.startsWith("http://") || rule.startsWith("https://")) {
      try {
        const allowedOrigin = new URL(rule).origin.toLowerCase();
        if (allowedOrigin === normalizedOrigin) {
          return { allowed: true, normalizedUrl: parsed.toString() };
        }
      } catch {
        continue;
      }
    } else if (normalizedHost === rule || normalizedHost.endsWith(`.${rule}`)) {
      return { allowed: true, normalizedUrl: parsed.toString() };
    }
  }

  return { allowed: false, reason: `Hostname is not in allowlist: ${parsed.hostname}` };
}

export function isOriginAllowed(origin: string, allowlist: string[]): boolean {
  const result = isUrlAllowed(origin, allowlist);
  return result.allowed;
}
