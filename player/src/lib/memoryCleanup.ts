/**
 * Memory cleanup utilities for TV app
 * Provides hooks and patterns to prevent memory leaks on limited-RAM devices
 */

import { useEffect, useRef } from "react";

/**
 * Custom hook that manages AbortController for automatic cleanup
 * Cleans up all listeners/timers/requests added with the signal
 */
export function useCleanupAbort() {
  const ctrlRef = useRef<AbortController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new AbortController();
  }

  useEffect(() => {
    return () => {
      ctrlRef.current?.abort();
      ctrlRef.current = null;
    };
  }, []);

  return ctrlRef.current.signal;
}

/**
 * Hook to add event listeners with automatic cleanup
 */
export function useEventListener(
  target: HTMLElement | Window | Document | null | undefined,
  event: string,
  handler: (e: Event) => void,
  options?: AddEventListenerOptions
) {
  const signal = useCleanupAbort();

  useEffect(() => {
    if (!target) return;
    target.addEventListener(event, handler, { ...options, signal });
    // Cleanup is handled by AbortController signal
  }, [target, event, handler, options, signal]);
}

/**
 * Hook to create a timer with automatic cleanup
 */
export function useTimer(
  callback: () => void,
  delayMs: number,
  deps: React.DependencyList = []
) {
  const signal = useCleanupAbort();

  useEffect(() => {
    if (delayMs <= 0) return;

    const timer = setTimeout(() => {
      if (!signal.aborted) {
        callback();
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [callback, delayMs, deps, signal]);
}

/**
 * Hook to create a recurring interval with automatic cleanup
 */
export function useInterval(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
  deps: React.DependencyList = []
) {
  const signal = useCleanupAbort();

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const interval = setInterval(() => {
      if (!signal.aborted) {
        callback();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [callback, intervalMs, enabled, deps, signal]);
}

/**
 * Hook to attach abort signal to a fetch request
 * Automatically aborts when component unmounts
 */
export function useFetchWithCleanup(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const signal = useCleanupAbort();

  return fetch(url, {
    ...options,
    signal,
  });
}

/**
 * Aggressive garbage collection hint for V8 (Chrome/webOS)
 * Only use when you know memory pressure is high
 */
export function hintGarbageCollection() {
  if (
    (window as any).gc &&
    typeof (window as any).gc === "function"
  ) {
    try {
      (window as any).gc();
    } catch (e) {
      // GC may not be exposed
    }
  }
}

/**
 * Monitor memory usage and log when exceeding threshold
 * Useful for debugging memory issues on TV
 */
export function useMemoryMonitoring(thresholdMB: number = 100) {
  useInterval(
    () => {
      // @ts-expect-error performance.memory is non-standard but available in Chrome/V8
      if ((performance as any).memory) {
        // @ts-expect-error performance.memory is non-standard but available in Chrome/V8
        const used = (performance as any).memory.usedJSHeapSize / 1048576; // MB
        if (used > thresholdMB) {
          console.warn(
            // @ts-expect-error performance.memory is non-standard but available in Chrome/V8
            `Memory usage high: ${used.toFixed(2)} MB / ${((performance as any).memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`
          );
        }
      }
    },
    5000, // Check every 5 seconds
    true,
    [thresholdMB]
  );
}

/**
 * Safely store large data in IndexedDB to free up memory
 * Use for catalog caches that would otherwise bloat heap
 */
export async function offloadToIndexedDB(
  dbName: string,
  storeName: string,
  key: string,
  data: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Store ${storeName} not found`));
        return;
      }

      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const putReq = store.put({ key, data, timestamp: Date.now() });

      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => {
        db.close();
        resolve();
      };
    };
  });
}

/**
 * Load data from IndexedDB
 */
export async function loadFromIndexedDB(
  dbName: string,
  storeName: string,
  key: string
): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(null);
        return;
      }

      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const getReq = store.get(key);

      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        db.close();
        resolve(getReq.result?.data ?? null);
      };
    };
  });
}
