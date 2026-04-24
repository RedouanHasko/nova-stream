import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
