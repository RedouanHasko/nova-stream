/**
 * Poster/thumbnail helpers for browser dev (proxy) and webOS TV (direct panel URLs).
 */

import { useEffect, useState } from "react";
import { getMediaApiBaseUrl } from "./activationApi";
import { isWebOsTv } from "./isWebOsTv";
import { resolvePanelImageUrl } from "./panelAssetUrl";

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

const urlCache = new Map<string, string>();
const CACHE_LIMIT = 1000;

export const getOptimizedPosterUrl = (
  originalUrl: string | null | undefined,
  config: ImageOptimizationConfig = {},
  panelHost = "",
): string => {
  const raw = resolvePanelImageUrl(panelHost, originalUrl);
  if (!raw) return "";

  const cacheKey = `${raw}|${JSON.stringify(config)}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  if (raw.startsWith("data:") || raw.startsWith("/")) {
    return raw;
  }

  const merged = { ...DEFAULT_CONFIG, ...config };
  const base = getMediaApiBaseUrl() || window.location.origin;

  let result = "";
  try {
    const params = new URLSearchParams({
      url: raw,
      w: String(merged.width),
      h: String(merged.height),
      fm: merged.format,
      q: String(merged.quality),
    });
    result = `${base}/api/proxy?${params.toString()}`;
  } catch {
    result = `${base}/api/proxy?url=${encodeURIComponent(raw)}`;
  }

  if (urlCache.size >= CACHE_LIMIT) {
    const firstKey = urlCache.keys().next().value;
    if (firstKey) urlCache.delete(firstKey);
  }
  urlCache.set(cacheKey, result);

  return result;
};

/**
 * Grid thumbnails: absolute panel URL on TV; proxied resize in browser dev.
 */
export const getThumbnailUrl = (
  originalUrl: string | null | undefined,
  panelHost = "",
): string => {
  const absolute = resolvePanelImageUrl(panelHost, originalUrl);
  if (!absolute) return "";
  if (isWebOsTv()) return absolute;
  return getOptimizedPosterUrl(absolute, {
    width: 150,
    height: 225,
    quality: 60,
  });
};

export const getHDPosterUrl = (
  originalUrl: string | null | undefined,
  panelHost = "",
): string => {
  const absolute = resolvePanelImageUrl(panelHost, originalUrl);
  if (!absolute) return "";
  if (isWebOsTv()) return absolute;
  return getOptimizedPosterUrl(absolute, {
    width: 400,
    height: 600,
    quality: 85,
  });
};

let activeDecodes = 0;
const MAX_CONCURRENT_DECODES = 4;
const pendingDecodes: Array<() => void> = [];

const acquireDecodeSlot = (): Promise<void> => {
  if (activeDecodes < MAX_CONCURRENT_DECODES) {
    activeDecodes++;
    return Promise.resolve();
  }
  return new Promise<void>((r) => {
    pendingDecodes.push(r);
  });
};

const releaseDecodeSlot = (): void => {
  const next = pendingDecodes.shift();
  if (next) {
    next();
  } else {
    activeDecodes = Math.max(0, activeDecodes - 1);
  }
};

export const loadImageQueued = (
  img: HTMLImageElement,
  src: string,
): Promise<void> => {
  if (!src) return Promise.resolve();
  return acquireDecodeSlot()
    .then(() => {
      img.src = src;
      if (typeof img.decode === "function") {
        return img.decode().then(() => {}).catch(() => {});
      }
      return new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
    .finally(() => {
      releaseDecodeSlot();
    });
};

/**
 * TV grids: set src when visible. Browser: same with intersection observer.
 */
export const useTvLazyImage = (
  imgRef: React.RefObject<HTMLImageElement | null>,
  src: string,
  threshold = 400,
) => {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(!src ? false : isWebOsTv());

  useEffect(() => {
    setLoaded(false);
    setVisible(!src ? false : isWebOsTv());
  }, [src]);

  useEffect(() => {
    if (isWebOsTv() || !src) return;
    const el = imgRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${threshold}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imgRef, src, threshold]);

  useEffect(() => {
    if (!visible || !src) return;
    const el = imgRef.current;
    if (!el) return;
    let cancelled = false;
    loadImageQueued(el, src).then(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, src, imgRef]);

  return loaded;
};
