import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getDeviceIdentity } from './lib/deviceIdentity';
import { initTVRemote } from './lib/remote';
import { smartTvMemoryProfile } from './lib/tv';

const pauseAllMediaElements = () => {
  try {
    const media = document.querySelectorAll<HTMLMediaElement>('video, audio');
    media.forEach((el) => {
      try {
        el.pause();
      } catch {}
    });
  } catch {}
};

const activateWebosApp = () => {
  const w = window as any;
  try {
    if (w?.webOSSystem && typeof w.webOSSystem.activate === 'function') {
      w.webOSSystem.activate();
      return;
    }
  } catch {}

  try {
    if (w?.PalmSystem && typeof w.PalmSystem.activate === 'function') {
      w.PalmSystem.activate();
    }
  } catch {}
};

// Detect TV / 10-foot UI: coarse pointer (remote/d-pad) or known TV user-agents
const isTV =
  window.matchMedia("(pointer: coarse) and (hover: none)").matches ||
  /WebOS|Tizen|SMART-TV|HbbTV|SmartTV|GoogleTV|FireTV|AmazonWebAppPlatform/i.test(
    navigator.userAgent,
  );
if (isTV) {
  document.documentElement.dataset.tv = "true";
}
if (smartTvMemoryProfile.isLowMemory) {
  document.documentElement.dataset.lowMemoryTv = "true";
}
document.documentElement.dataset.tvPlatform = smartTvMemoryProfile.platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Kick off device identity resolution for debug/activation flows.
(async () => {
  try {
    const id = await getDeviceIdentity();
    // Keep this debug log in development only to avoid noisy simulator consoles.
    if ((import.meta as any).env?.DEV) {
      try { console.info('device.identity', id); } catch {}
    }
  } catch {}
})();

// Initialize TV remote mapping (dispatches `tv-remote-key` events)
initTVRemote();

// webOS lifecycle handling: relaunch and visibility are key for TV stability.
// webOS recommends handling webOSLaunch/webOSRelaunch and visibility changes.
document.addEventListener(
  'webOSLaunch',
  () => {
    try {
      document.dispatchEvent(
        new CustomEvent('nova:app-launch', {
          detail: { source: 'webOSLaunch' },
        }),
      );
    } catch {}
  },
  true,
);

document.addEventListener(
  'webOSRelaunch',
  (event: Event) => {
    const relaunchEvent = event as CustomEvent<any>;
    try {
      document.dispatchEvent(
        new CustomEvent('nova:app-relaunch', {
          detail: relaunchEvent?.detail || null,
        }),
      );
    } catch {}
    activateWebosApp();
  },
  true,
);

const hiddenProp =
  typeof (document as any).hidden !== 'undefined'
    ? 'hidden'
    : typeof (document as any).webkitHidden !== 'undefined'
      ? 'webkitHidden'
      : 'hidden';

const visibilityEvent =
  hiddenProp === 'webkitHidden' ? 'webkitvisibilitychange' : 'visibilitychange';

document.addEventListener(
  visibilityEvent,
  () => {
    const isHidden = Boolean((document as any)[hiddenProp]);
    if (isHidden) {
      pauseAllMediaElements();
    }
    try {
      document.dispatchEvent(
        new CustomEvent('nova:app-visibility', {
          detail: { hidden: isHidden },
        }),
      );
    } catch {}
  },
  true,
);
