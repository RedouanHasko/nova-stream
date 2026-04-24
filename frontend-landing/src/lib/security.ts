const LOCAL_HOSTNAME_RE = /^(localhost|127(?:\.\d{1,3}){3}|::1)$/i;

export function isLocalHostname(hostname: string): boolean {
  const normalized = (hostname || "").trim().toLowerCase();
  return Boolean(
    normalized &&
      (LOCAL_HOSTNAME_RE.test(normalized) || normalized.endsWith(".local")),
  );
}

export function shouldEnforceHttps(hostname?: string): boolean {
  if (typeof window === "undefined") return false;
  return !isLocalHostname(hostname || window.location.hostname || "");
}

export function enforceHttpsInProduction() {
  if (typeof window === "undefined") return;
  if (!shouldEnforceHttps()) return;
  if (window.location.protocol === "https:") return;

  const secureUrl = new URL(window.location.href);
  secureUrl.protocol = "https:";
  window.location.replace(secureUrl.toString());
}

export function toSecureUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://example.com";
    const nextUrl = new URL(rawUrl, base);

    if (nextUrl.protocol === "http:" && !isLocalHostname(nextUrl.hostname)) {
      nextUrl.protocol = "https:";
    }

    return nextUrl.toString();
  } catch {
    return rawUrl;
  }
}

export function getSecureApiBase() {
  if (typeof window === "undefined") return "";

  const configuredBase = (import.meta.env.VITE_API_URL || "").trim();
  if (configuredBase) {
    return toSecureUrl(configuredBase).replace(/\/$/, "");
  }

  const { protocol, hostname } = window.location;
  if (isLocalHostname(hostname)) {
    return `${protocol}//${hostname}:5000`;
  }

  return "";
}

export function isSecureNavigationTarget(rawUrl: string): boolean {
  if (!rawUrl || typeof window === "undefined") return false;

  try {
    const nextUrl = new URL(rawUrl, window.location.origin);
    return nextUrl.protocol === "https:" || isLocalHostname(nextUrl.hostname);
  } catch {
    return false;
  }
}