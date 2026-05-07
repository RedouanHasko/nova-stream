// TV remote normalization + simple focus navigation helper
import { useEffect } from "react";
type RemoteKey = "left" | "right" | "up" | "down" | "select" | "back" | "play" | "pause" | "playpause" | "info" | "home" | "menu" | "unknown";

const isVisible = (el: HTMLElement) => {
  try {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden";
  } catch {
    return false;
  }
};

const getFocusable = (root: HTMLElement | Document = document): HTMLElement[] => {
  const selector = "[data-tv-focusable], button, a[href], [tabindex]:not([tabindex=\"-1\"])";
  const base: Element | Document = root || document;
  const nodeList = (base as Element).querySelectorAll ? (base as Element).querySelectorAll(selector) : document.querySelectorAll(selector);
  const arr = Array.from(nodeList as NodeListOf<HTMLElement>).filter((el) => el && isVisible(el));
  return arr;
};

const centerOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export const focusNext = (direction: "left" | "right" | "up" | "down", opts?: { root?: HTMLElement | null }) => {
  const root = opts?.root ?? document;
  const focusables = getFocusable(root as HTMLElement | Document);
  if (focusables.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || (opts?.root && !(opts.root as HTMLElement).contains(active))) {
    focusables[0].focus();
    return;
  }

  const src = centerOf(active);
  const candidates = focusables
    .filter((el) => el !== active)
    .map((el) => ({ el, c: centerOf(el), d: distance(src, centerOf(el)) }))
    .filter(({ el, c }) => {
      if (direction === "left") return c.x < src.x - 5;
      if (direction === "right") return c.x > src.x + 5;
      if (direction === "up") return c.y < src.y - 5;
      if (direction === "down") return c.y > src.y + 5;
      return true;
    })
    .sort((a, b) => a.d - b.d);

  if (candidates.length > 0) candidates[0].el.focus();
};

const mapKey = (ev: KeyboardEvent): RemoteKey => {
  const code = ev.code || ev.key || String(ev.keyCode);
  switch (code) {
    case "ArrowLeft":
    case "Left":
    case "37":
      return "left";
    case "ArrowRight":
    case "Right":
    case "39":
      return "right";
    case "ArrowUp":
    case "Up":
    case "38":
      return "up";
    case "ArrowDown":
    case "Down":
    case "40":
      return "down";
    case "Enter":
    case "NumpadEnter":
    case "13":
      return "select";
    case "Escape":
    case "Backspace":
    case "8":
    case "27":
      return "back";
    case "MediaPlayPause":
      return "playpause";
    case "MediaPlay":
      return "play";
    case "MediaPause":
      return "pause";
    case "Info":
    case "MediaTrackInfo":
      return "info";
    default:
      return "unknown";
  }
};

let started = false;
let handler = (e: KeyboardEvent) => {};

export const initTVRemote = () => {
  if (started) return;
  handler = (e: KeyboardEvent) => {
    const k = mapKey(e);
    if (k === "unknown") return;
    try {
      const ev = new CustomEvent("tv-remote-key", { detail: { key: k }, bubbles: true });
      window.dispatchEvent(ev);
      e.preventDefault();
    } catch {}
  };
  window.addEventListener("keydown", handler, { passive: false });
  started = true;
};

export const stopTVRemote = () => {
  if (!started) return;
  window.removeEventListener("keydown", handler as EventListener);
  started = false;
};

export const useTVRemote = (cb: (key: RemoteKey) => void) => {
  useEffect(() => {
    const h = (ev: Event) => {
      try {
        // @ts-ignore
        const k = (ev as CustomEvent).detail?.key as RemoteKey;
        if (k) cb(k);
      } catch {}
    };
    window.addEventListener("tv-remote-key", h as EventListener);
    return () => window.removeEventListener("tv-remote-key", h as EventListener);
  }, [cb]);
};

export default { initTVRemote, stopTVRemote, useTVRemote, focusNext };
