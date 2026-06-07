import { getMediaApiBaseUrl } from "./activationApi";
import { getPlatformName } from "./platformPlayer";

/** Dev server / packaged app origin used for same-origin playback proxies. */
export function getPlaybackOrigin(): string {
  if (typeof window !== "undefined" && window.location.protocol !== "file:") {
    return window.location.origin.replace(/\/$/, "");
  }

  const base =
    getMediaApiBaseUrl() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return String(base || "").replace(/\/$/, "");
}

/**
 * Rewrites panel stream URLs through `/api/proxy` so browser dev (localhost)
 * and hosted web apps can play cross-origin HLS/MPEG-TS without CORS failures.
 */
export function wrapProxyPlaybackUrl(rawUrl: string, owner = true): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("/api/proxy") || trimmed.includes("/api/stream-ts")) {
    return trimmed;
  }
  const origin = getPlaybackOrigin();
  const ownerFlag = owner ? "&owner=1" : "";
  return `${origin}/api/proxy?url=${encodeURIComponent(trimmed)}${ownerFlag}`;
}

/**
 * webOS/Tizen TV: direct panel URLs (native video + hardware HLS/MKV/TS where supported).
 * Browser dev: same-origin `/api/proxy` to avoid CORS.
 */
export function wrapPlaybackUrlsForPlatform(urls: string[]): string[] {
  const unique = Array.from(
    new Set((urls || []).map((u) => String(u || "").trim()).filter(Boolean)),
  );
  const platform = getPlatformName();
  if (platform === "webos" || platform === "tizen") return unique;
  return unique.map((u) => wrapProxyPlaybackUrl(u));
}

export function buildStreamTsUrl(
  rawUrl: string,
  opts?: {
    seek?: number;
    audio?: number;
    sub?: number;
    isLive?: boolean;
  },
): string {
  const origin = getPlaybackOrigin();
  let url = `${origin}/api/stream-ts?url=${encodeURIComponent(rawUrl)}&owner=1`;
  if (opts?.seek && opts.seek > 0) {
    url += `&seek=${opts.seek.toFixed(3)}`;
  }
  if (opts?.audio != null && opts.audio >= 0) {
    url += `&audio=${opts.audio}`;
  }
  if (opts?.sub != null && opts.sub >= 0) {
    url += `&sub=${opts.sub}`;
  }
  if (opts?.isLive) {
    url += "&isLive=1";
  }
  return url;
}
