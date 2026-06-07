/**
 * Resolve Xtream panel image paths to absolute URLs the TV browser can load.
 * APIs often return relative paths (`/images/...`) or protocol-relative URLs.
 */

export function normalizePanelHost(host: string): string {
  const trimmed = String(host || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/** Build a loadable absolute URL for logos/posters from the IPTV panel host. */
export function resolvePanelImageUrl(
  panelHost: string,
  raw?: string | null,
): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  if (value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const host = normalizePanelHost(panelHost);
  if (!host) return value;

  if (value.startsWith("//")) {
    try {
      const base = new URL(host);
      return `${base.protocol}${value}`;
    } catch {
      return `http:${value}`;
    }
  }

  const path = value.startsWith("/") ? value : `/${value}`;
  return `${host}${path}`;
}
