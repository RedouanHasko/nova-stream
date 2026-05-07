import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { probeAndSelectApiBase } from './lib/activationApi';
import { getDeviceIdentity } from './lib/deviceIdentity';
import { initTVRemote } from './lib/remote';

// Detect TV / 10-foot UI: coarse pointer (remote/d-pad) or known TV user-agents
const isTV =
  window.matchMedia("(pointer: coarse) and (hover: none)").matches ||
  /WebOS|Tizen|SMART-TV|HbbTV|SmartTV|GoogleTV|FireTV|AmazonWebAppPlatform/i.test(
    navigator.userAgent,
  );
if (isTV) {
  document.documentElement.dataset.tv = "true";
}

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

// Resolve activation API base early so device activation and managed playlist
// sync on packaged TV builds do not get stuck on simulator-only defaults.
probeAndSelectApiBase().catch(() => {});
