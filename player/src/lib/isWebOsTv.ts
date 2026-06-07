/**
 * True when running in TV catalog/memory mode (LG webOS, Tizen, webOS Simulator).
 * Set by the inline script in `index.html` (`data-tv="true"`).
 * Playback platform detection uses `getPlatformName()` in `platformPlayer.ts`.
 */
export function isWebOsTv(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.tv === "true";
}
