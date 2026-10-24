import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

const DEFAULT_ROW_PITCH = 98;
const OVERSCAN_ROWS = 10;

export type TvWindow = {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
};

/**
 * Fixed-row-height windowing for TV list mode. Keeps the number of mounted
 * rows bounded (viewport + overscan) no matter how large the catalog is, so
 * 50k+ item libraries do not exhaust DOM/heap on low-RAM smart TVs.
 */
export function useTvWindow(
  scrollRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  total: number,
  enabled: boolean,
  resetKey: string,
): TvWindow {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(720);
  const [pitch, setPitch] = useState(DEFAULT_ROW_PITCH);
  const hasList = total > 0;
  const tickingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;
    const read = () => {
      tickingRef.current = false;
      setScrollTop(el.scrollTop);
      setViewportH(el.clientHeight || 720);
    };
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [enabled, hasList, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey, scrollRef]);

  // Measure the real row pitch (row height + margins + gap) once rows exist.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!enabled || !list || list.children.length < 2) return;
    const measured =
      (list.children[1] as HTMLElement).offsetTop -
      (list.children[0] as HTMLElement).offsetTop;
    if (measured > 20 && Math.abs(measured - pitch) > 1) setPitch(measured);
  });

  if (!enabled) {
    return { start: 0, end: total, padTop: 0, padBottom: 0 };
  }

  const first = Math.floor(scrollTop / pitch);
  const visibleRows = Math.ceil(viewportH / pitch) + 1;
  const start = Math.max(0, Math.min(first - OVERSCAN_ROWS, total - 1));
  const end = Math.min(total, first + visibleRows + OVERSCAN_ROWS);
  return {
    start,
    end,
    padTop: start * pitch,
    padBottom: Math.max(0, total - end) * pitch,
  };
}
