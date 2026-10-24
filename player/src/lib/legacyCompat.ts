/**
 * Minimal shims for older smart-TV Chromium engines (e.g. webOS 4 = Chromium 53,
 * Tizen 5.0 = Chromium 63) that lack AbortController (Chrome 66) or
 * ResizeObserver (Chrome 64). They only prevent hard crashes; on such engines
 * fetch() ignores the signal, so requests are not actually cancelled.
 */
const g = globalThis as any;

if (typeof g.AbortController === "undefined") {
  class ShimAbortSignal {
    aborted = false;
    onabort: ((ev: any) => void) | null = null;
    private listeners: Array<(ev: any) => void> = [];
    addEventListener(type: string, fn: (ev: any) => void) {
      if (type === "abort") this.listeners.push(fn);
    }
    removeEventListener(type: string, fn: (ev: any) => void) {
      if (type === "abort") this.listeners = this.listeners.filter((l) => l !== fn);
    }
    dispatch() {
      const ev = { type: "abort", target: this };
      try { this.onabort?.(ev); } catch {}
      this.listeners.slice().forEach((l) => { try { l(ev); } catch {} });
    }
  }
  class ShimAbortController {
    signal = new ShimAbortSignal();
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.dispatch();
    }
  }
  g.AbortController = ShimAbortController;
  g.AbortSignal = g.AbortSignal || ShimAbortSignal;
}

if (typeof g.ResizeObserver === "undefined") {
  class ShimResizeObserver {
    private els = new Set<Element>();
    private handler = () => this.notify();
    constructor(private cb: (entries: any[]) => void) {}
    private notify() {
      const entries: any[] = [];
      this.els.forEach((target) => {
        const r = target.getBoundingClientRect();
        entries.push({ target, contentRect: { width: r.width, height: r.height, top: 0, left: 0, right: r.width, bottom: r.height } });
      });
      if (entries.length) this.cb(entries);
    }
    observe(el: Element) {
      if (this.els.size === 0) window.addEventListener("resize", this.handler);
      this.els.add(el);
      setTimeout(() => this.notify(), 0);
    }
    unobserve(el: Element) {
      this.els.delete(el);
      if (this.els.size === 0) window.removeEventListener("resize", this.handler);
    }
    disconnect() {
      this.els.clear();
      window.removeEventListener("resize", this.handler);
    }
  }
  g.ResizeObserver = ShimResizeObserver;
}
