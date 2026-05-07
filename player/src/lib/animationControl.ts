/**
 * Animation control for webOS TV with automatic disabling on low-power devices
 * Provides motion/react wrapper components that respect isLowPowerTV flag
 */

import { isLowPowerTV } from "./tv";

export interface AnimationConfig {
  enabled?: boolean;
  duration?: number;
  delay?: number;
}

/**
 * Determine if animations should be enabled based on device and user preference
 */
export function shouldAnimate(): boolean {
  // Check prefers-reduced-motion
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }

  // Disable animations on low-power TVs
  return !isLowPowerTV;
}

/**
 * Get motion config that respects low-power TV constraints
 */
export function getMotionConfig(
  userConfig: AnimationConfig = {}
): AnimationConfig {
  if (!shouldAnimate()) {
    // Return instant animation config
    return {
      enabled: false,
      duration: 0,
      delay: 0,
    };
  }

  return {
    enabled: true,
    duration: userConfig.duration ?? 0.3,
    delay: userConfig.delay ?? 0,
  };
}

/**
 * Motion preset for fade-in animations
 */
export function getFadeInPreset() {
  const config = getMotionConfig();
  return {
    initial: config.enabled ? { opacity: 0 } : { opacity: 1 },
    animate: { opacity: 1 },
    transition: config.enabled ? { duration: config.duration } : {},
  };
}

/**
 * Motion preset for slide animations
 */
export function getSlidePreset(direction: "up" | "down" | "left" | "right") {
  const config = getMotionConfig();
  const directionMap = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  };

  return {
    initial: config.enabled ? { opacity: 0, ...directionMap[direction] } : { opacity: 1 },
    animate: { opacity: 1, x: 0, y: 0 },
    transition: config.enabled ? { duration: config.duration } : {},
  };
}

/**
 * Motion preset for scale animations
 */
export function getScalePreset() {
  const config = getMotionConfig();
  return {
    initial: config.enabled ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 },
    animate: { opacity: 1, scale: 1 },
    transition: config.enabled ? { duration: config.duration } : {},
  };
}

/**
 * CSS class for reducing motion in stylesheets
 */
export function getAnimationClassName(): string {
  return shouldAnimate() ? "" : "reduce-motion";
}

/**
 * Add style tag that disables animations on low-power TVs
 * Call once on app startup
 */
export function injectAnimationPreferences() {
  if (!shouldAnimate()) {
    const style = document.createElement("style");
    style.textContent = `
      [data-low-power="true"] * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      
      [data-low-power="true"] .blur-effect {
        filter: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
      }
    `;
    document.head.appendChild(style);

    // Mark body as low-power
    document.body.setAttribute("data-low-power", "true");
  }
}

/**
 * Debounce animation cleanup to prevent animation glitches
 * Use in components that frequently mount/unmount
 */
export function useAnimationSafeRemount(callback: () => void, delayMs = 100) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(callback, delayMs);
  };
}
