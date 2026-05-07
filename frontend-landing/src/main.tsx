import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./contexts/I18nContext";
import { enforceHttpsInProduction } from "./lib/security";
import "./index.css";
import { initTVRemote } from "./lib/remote";

enforceHttpsInProduction();
initTVRemote();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
