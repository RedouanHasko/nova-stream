/** TV platform detection and utilities */

export const isTV =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse) and (hover: none)").matches ||
    /WebOS|Tizen|SMART-TV|HbbTV|SmartTV|GoogleTV|FireTV|AmazonWebAppPlatform/i.test(
      navigator.userAgent,
    ));

export type TVPlatform = "webos" | "tizen" | "android_tv" | "fire_tv" | "generic_tv" | "browser";

export function detectPlatform(): TVPlatform {
  const ua = navigator.userAgent;
  if (/WebOS/i.test(ua)) return "webos";
  if (/Tizen/i.test(ua)) return "tizen";
  if (/FireTV|AmazonWebAppPlatform/i.test(ua)) return "fire_tv";
  if (/GoogleTV|Android TV|BRAVIA|MIBOX|Chromecast/i.test(ua)) return "android_tv";
  if (/SMART-TV|HbbTV|SmartTV/i.test(ua)) return "generic_tv";
  return "browser";
}

export const tvPlatform = detectPlatform();

export type SmartTvMemoryProfile = {
  platform: TVPlatform;
  isTv: boolean;
  isLowMemory: boolean;
  maxJsHeapMb: number;
  maxTotalMb: number;
  imageConcurrency: number;
  initialGridItems: number;
  notes: string;
};

export function getSmartTvMemoryProfile(): SmartTvMemoryProfile {
  const platform = detectPlatform();
  const tv = isTV;

  // Web apps cannot reliably query Samsung/webOS RAM. Treat TV engines as
  // low-memory unless proven otherwise by native shell/device profiling.
  const lowMemory =
    tv &&
    (platform === "webos" ||
      platform === "tizen" ||
      platform === "android_tv" ||
      platform === "fire_tv" ||
      platform === "generic_tv");

  return {
    platform,
    isTv: tv,
    isLowMemory: lowMemory,
    // Keep JS allocations well below the user's requested 200 MB ceiling so
    // the native decoder, GPU textures, and OS services have breathing room.
    maxJsHeapMb: lowMemory ? 120 : 256,
    maxTotalMb: lowMemory ? 200 : 350,
    imageConcurrency: lowMemory ? 2 : 4,
    initialGridItems: lowMemory ? 24 : 60,
    notes: lowMemory
      ? "Conservative TV mode for low-RAM smart TVs."
      : "Standard browser/desktop memory profile.",
  };
}

export const smartTvMemoryProfile = getSmartTvMemoryProfile();

/** Whether we should reduce GPU-heavy effects (blur, shadows, complex animations). */
export const isLowPowerTV = smartTvMemoryProfile.isLowMemory;
