import { getMediaApiBaseUrl } from "./activationApi";

export type PlaybackDebugLevel = "info" | "warn" | "error";

export function reportPlaybackDebug(
  event: string,
  payload: Record<string, unknown>,
  level: PlaybackDebugLevel = "info",
) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    event,
    level,
    payload,
    ts: Date.now(),
  });

  const baseUrl =
    window.location.protocol === "file:"
      ? (getMediaApiBaseUrl() || "")
      : window.location.origin;
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/api/playback-debug`
    : "/api/playback-debug";

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
  } catch {
    // Fallback to fetch below
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Debug transport failures should never affect playback flow.
  });
}
