// TV remote normalization + simple focus navigation helper
import { useEffect, useRef } from 'react';
type RemoteKey =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'enter'
  | 'select'
  | 'back'
  | 'play'
  | 'pause'
  | 'playpause'
  | 'rewind'
  | 'fastforward'
  | 'stop'
  | 'info'
  | 'home'
  | 'menu'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'channelup'
  | 'channeldown'
  | 'unknown';

const isVisible = (el: HTMLElement) => {
  try {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  } catch {
    return false;
  }
};

const getFocusable = (root: HTMLElement | Document = document): HTMLElement[] => {
  const selector = [
    '[data-tv-focusable]',
    'button:not([tabindex="-1"])',
    'a[href]:not([tabindex="-1"])',
    'input:not([tabindex="-1"])',
    'select:not([tabindex="-1"])',
    'textarea:not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  const base: Element | Document = root || document;
  const nodeList = (base as Element).querySelectorAll ? (base as Element).querySelectorAll(selector) : document.querySelectorAll(selector);
  const arr = Array.from(nodeList as NodeListOf<HTMLElement>).filter((el) => {
    if (!el || !isVisible(el)) return false;
    if (el.hasAttribute('disabled')) return false;
    if ((el as HTMLInputElement).readOnly && el.tagName === 'INPUT') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });

  // Keep navigation deterministic by sorting top->bottom then left->right.
  // This guarantees one-step traversal with no skipped intermediate controls.
  return arr.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const rowDiff = Math.abs(ar.top - br.top);
    if (rowDiff > 10) return ar.top - br.top;
    if (Math.abs(ar.left - br.left) > 2) return ar.left - br.left;
    return 0;
  });
};

export const focusNext = (direction: 'left' | 'right' | 'up' | 'down', opts?: { root?: HTMLElement | null }) => {
  const root = opts?.root ?? document;
  const focusables = getFocusable(root as HTMLElement | Document);
  if (focusables.length === 0) return;

  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || !focusables.includes(active)) {
    focusables[0].focus();
    return;
  }

  const ar = active.getBoundingClientRect();
  const ax = ar.left + ar.width / 2;
  const ay = ar.top + ar.height / 2;

  // Collect candidates that are strictly in the desired direction.
  const candidates = focusables.filter((el) => {
    if (el === active) return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    switch (direction) {
      case 'right': return cx > ax + 5;
      case 'left':  return cx < ax - 5;
      case 'down':  return cy > ay + 5;
      case 'up':    return cy < ay - 5;
    }
  });

  // No candidate in that direction — don't wrap, stay put.
  if (candidates.length === 0) return;

  // Score: prefer elements close on the primary axis, penalise cross-axis offset.
  const scored = candidates.map((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const primary = (direction === 'left' || direction === 'right') ? Math.abs(cx - ax) : Math.abs(cy - ay);
    const cross   = (direction === 'left' || direction === 'right') ? Math.abs(cy - ay) : Math.abs(cx - ax);
    return { el, score: primary + cross * 2.5 };
  });

  scored.sort((a, b) => a.score - b.score);
  scored[0].el.focus();
};

/**
 * Call at the top of any page's TV-key handler.
 * If DOM focus is inside [data-tv-zone="header"], handles left/right/up/down/enter/back
 * for the header and returns true (caller should return early).
 * onEscapeDown: called when DOWN is pressed from header (use to activate first content item).
 * onBack: called when BACK/UP is pressed from header.
 */
export const handleHeaderZoneKey = (
  key: string,
  opts?: { onEscapeDown?: () => void; onBack?: () => void }
): boolean => {
  const header = document.querySelector<HTMLElement>('[data-tv-zone="header"]');
  if (!header?.contains(document.activeElement as Node | null)) return false;

  if (key === 'left' || key === 'right') {
    focusNext(key, { root: header });
    return true;
  }
  if (key === 'down') {
    (document.activeElement as HTMLElement | null)?.blur();
    opts?.onEscapeDown?.();
    return true;
  }
  if (key === 'up') {
    // Already at the top of the page — nothing to do.
    return true;
  }
  if (key === 'back') {
    opts?.onBack?.();
    return true;
  }
  if (key === 'enter' || key === 'select') {
    (document.activeElement as HTMLElement | null)?.click();
    return true;
  }
  return false;
};

/** Focus the first focusable button/link inside [data-tv-zone="header"]. */
export const focusHeader = (): boolean => {
  const btn = document.querySelector<HTMLElement>(
    '[data-tv-zone="header"] [data-tv-focusable], [data-tv-zone="header"] button:not([disabled]), [data-tv-zone="header"] a[href]'
  );
  if (btn) { btn.focus(); return true; }
  return false;
};

const mapKey = (ev: KeyboardEvent): RemoteKey => {
  const code = ev.code || ev.key || String(ev.keyCode);
  switch (code) {
    case 'ArrowLeft':
    case 'Left':
    case '37':
      return 'left';
    case 'ArrowRight':
    case 'Right':
    case '39':
      return 'right';
    case 'ArrowUp':
    case 'Up':
    case '38':
      return 'up';
    case 'ArrowDown':
    case 'Down':
    case '40':
      return 'down';
    case 'Enter':
    case 'NumpadEnter':
    case 'Select':
    case 'OK':
    case 'Accept':
    case '13':
    case '29443':
      return 'enter';
    case 'Escape':
    case 'Back':
    case 'Backspace':
    case 'BrowserBack':
    case 'GoBack':
    case '8':
    case '27':
    case '166':
    case '461':
    case '10009':
    case 'XF86Back':
      return 'back';
    case 'F1':
    case '403':
      return 'red';
    case 'F2':
    case '404':
      return 'green';
    case 'F3':
    case '405':
      return 'yellow';
    case 'F4':
    case '406':
      return 'blue';
    case 'MediaPlayPause':
      return 'playpause';
    case 'MediaPlay':
    case '415':
      return 'play';
    case 'MediaPause':
    case '19':
      return 'pause';
    case 'MediaStop':
    case '413':
      return 'stop';
    case 'MediaRewind':
    case '412':
      return 'rewind';
    case 'MediaFastForward':
    case '417':
      return 'fastforward';
    case 'ChannelUp':
    case 'XF86ChannelUp':
    case '427':
      return 'channelup';
    case 'ChannelDown':
    case 'XF86ChannelDown':
    case '428':
      return 'channeldown';
    case 'Info':
    case 'MediaTrackInfo':
    case 'XF86Info':
    case '457':
      return 'info';
    case 'Home':
    case 'XF86HomePage':
    case '36':
      return 'home';
    case 'XF86AudioPlay':
      return 'play';
    case 'XF86AudioPause':
      return 'pause';
    case 'XF86AudioStop':
      return 'stop';
    case 'XF86AudioRewind':
      return 'rewind';
    case 'XF86AudioFastForward':
      return 'fastforward';
    default:
      return 'unknown';
  }
};

let started = false;
let handler = (e: KeyboardEvent) => {};
let lastDirectionalKey: RemoteKey | null = null;
let lastDirectionalTs = 0;
let lastSelectTs = 0;

const shouldThrottle = (key: RemoteKey, ev: KeyboardEvent) => {
  const now = Date.now();

  // Keep select/enter single-fire to avoid accidental double-activation.
  if (key === 'enter' || key === 'select') {
    const tooSoon = now - lastSelectTs < 180;
    if (!tooSoon) lastSelectTs = now;
    return tooSoon;
  }

  if (key !== 'left' && key !== 'right' && key !== 'up' && key !== 'down') {
    return false;
  }

  // Allow held directional keys, but pace repeats for stable movement on TV engines.
  const threshold = ev.repeat ? 78 : 62;
  const tooSoon = lastDirectionalKey === key && now - lastDirectionalTs < threshold;
  if (!tooSoon) {
    lastDirectionalKey = key;
    lastDirectionalTs = now;
  }
  return tooSoon;
};

export const initTVRemote = () => {
  if (started) return;
  handler = (e: KeyboardEvent) => {
    const k = mapKey(e);
    if (k === 'unknown') return;
    // Intercept the event BEFORE the browser's built-in sequential navigation
    // (webOS / Tizen apply their own spatial-nav on arrow keys unless we
    // prevent default AND stop immediate propagation here in the capture phase).
    e.preventDefault();
    e.stopImmediatePropagation();
    if (shouldThrottle(k, e)) return;
    try {
      const keys = k === 'enter' ? ['enter', 'select'] : [k];
      for (const key of keys) {
        const ev = new CustomEvent('tv-remote-key', { detail: { key }, bubbles: true });
        window.dispatchEvent(ev);
      }
    } catch {}
  };
  // capture:true so our handler runs before any other keydown listener
  // (including the webOS browser's built-in directional navigation).
  window.addEventListener('keydown', handler, { passive: false, capture: true });
  started = true;
};

export const stopTVRemote = () => {
  if (!started) return;
  window.removeEventListener('keydown', handler as EventListener, { capture: true });
  started = false;
};

// React hook to subscribe to tv-remote-key events
export const useTVRemote = (cb: (key: RemoteKey, event?: Event) => void) => {
  // Store the latest callback in a ref so re-renders with new inline functions
  // don't cause the event listener to be torn down and re-registered every frame.
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; });
  useEffect(() => {
    const h = (ev: Event) => {
      try {
        // @ts-ignore
        const k = (ev as CustomEvent).detail?.key as RemoteKey;
        if (k) cbRef.current(k, ev);
      } catch {}
    };
    window.addEventListener('tv-remote-key', h as EventListener);
    return () => window.removeEventListener('tv-remote-key', h as EventListener);
  }, []); // register once, cb updates via ref
};

export default { initTVRemote, stopTVRemote, useTVRemote, focusNext, handleHeaderZoneKey, focusHeader };
