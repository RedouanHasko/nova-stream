/**
 * Image optimization utilities for webOS TV
 * Generates optimized poster/thumbnail URLs with size constraints
 */

import { getMediaApiBaseUrl } from "./activationApi";

export interface ImageOptimizationConfig {
  width?: number;
  height?: number;
  format?: "webp" | "jpeg" | "png";
  quality?: number;
}

const DEFAULT_CONFIG: ImageOptimizationConfig = {
  width: 300,
  height: 450,
  format: "webp",
  quality: 75,
};

/**
 * Generate optimized poster URL via backend proxy
 * Falls back to original URL if optimization not available
 */
export const getOptimizedPosterUrl = (
  originalUrl: string | null | undefined,
  config: ImageOptimizationConfig = {}
): string => {
  if (!originalUrl) return "";

  const merged = { ...DEFAULT_CONFIG, ...config };
  const base = getMediaApiBaseUrl() || window.location.origin;

  // For data URLs or local assets, return as-is
  if (originalUrl.startsWith("data:") || originalUrl.startsWith("/")) {
    return originalUrl;
  }

  // Build proxy URL with optimization params
  try {
    const params = new URLSearchParams({
      url: originalUrl,
      w: String(merged.width),
      h: String(merged.height),
      fm: merged.format,
      q: String(merged.quality),
    });
    return `${base}/api/proxy?${params.toString()}`;
  } catch {
    // Fallback to original URL through proxy
    return `${base}/api/proxy?url=${encodeURIComponent(originalUrl)}`;
  }
};

/**
 * Get thumbnail URL (smaller version for list previews)
 * Used when rendering in scrollable lists to reduce memory
 */
export const getThumbnailUrl = (
  originalUrl: string | null | undefined
): string => {
  return getOptimizedPosterUrl(originalUrl, {
    width: 150,
    height: 225,
    quality: 60, // Lower quality for thumbnails
  });
};

/**
 * Get high-quality poster URL (for detail/preview screens)
 */
export const getHDPosterUrl = (
  originalUrl: string | null | undefined
): string => {
  return getOptimizedPosterUrl(originalUrl, {
    width: 400,
    height: 600,
    quality: 85,
  });
};

/**
 * Preload image to warm up browser cache
 * Returns promise that resolves when image is cached
 */
export const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
};

/**
 * Batch preload multiple images with concurrency control
 * Prevents overwhelming network on TV
 */
export const preloadImageBatch = async (
  urls: string[],
  maxConcurrent: 2
): Promise<void> => {
  const queue = [...urls];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < maxConcurrent && queue.length > 0) {
      const url = queue.shift()!;
      const promise = preloadImage(url)
        .catch(() => {}) // Ignore individual failures
        .then(() => {
          const idx = active.indexOf(promise);
          if (idx !== -1) active.splice(idx, 1);
        });
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
    }
  }
};
