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

/** Whether we should reduce GPU-heavy effects (blur, shadows, complex animations) */
export const isLowPowerTV = isTV && (tvPlatform === "webos" || tvPlatform === "tizen" || tvPlatform === "generic_tv");
