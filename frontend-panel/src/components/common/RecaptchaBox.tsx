import { useEffect, useRef, useState } from "react";

type RecaptchaRenderFn = (
  container: HTMLElement,
  options: Record<string, unknown>,
) => number;

type RecaptchaExecuteFn = (
  siteKey: string,
  options?: Record<string, unknown>,
) => Promise<string>;

interface RecaptchaApi {
  ready?: (callback: () => void) => void;
  render?: RecaptchaRenderFn;
  reset?: (widgetId?: number) => void;
  execute?: RecaptchaExecuteFn;
  enterprise?: RecaptchaApi;
}

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

type RecaptchaMode = "widget" | "invisible";

let recaptchaScriptPromise: Promise<void> | null = null;
let recaptchaScriptUrl = "";

function loadRecaptchaScript(mode: RecaptchaMode, siteKey?: string) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.grecaptcha) {
    return Promise.resolve();
  }

  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise;
  }

  const nextScriptUrl =
    mode === "invisible" && siteKey
      ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
      : "https://www.google.com/recaptcha/api.js?render=explicit";

  if (recaptchaScriptPromise && recaptchaScriptUrl === nextScriptUrl) {
    return recaptchaScriptPromise;
  }

  recaptchaScriptUrl = nextScriptUrl;
  recaptchaScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-recaptcha-script="true"]',
    );

    if (existingScript) {
      if (existingScript.src === nextScriptUrl) {
        existingScript.addEventListener("load", () => resolve(), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Unable to load reCAPTCHA script.")),
          { once: true },
        );
        return;
      }

      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = nextScriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.recaptchaScript = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Unable to load reCAPTCHA script."));
    document.head.appendChild(script);
  });

  return recaptchaScriptPromise;
}

interface RecaptchaBoxProps {
  siteKey?: string;
  theme?: "light" | "dark";
  resetSignal?: number;
  mode?: RecaptchaMode;
  onVerify: (token: string | null) => void;
}

function getDefaultMode(): RecaptchaMode {
  return import.meta.env.VITE_RECAPTCHA_MODE === "invisible"
    ? "invisible"
    : "widget";
}

function getActiveRecaptchaApi() {
  if (!window.grecaptcha) {
    return null;
  }

  return window.grecaptcha.enterprise || window.grecaptcha;
}

export async function requestInvisibleRecaptchaToken({
  siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  action = "auth_form",
  mode = getDefaultMode(),
}: {
  siteKey?: string;
  action?: string;
  mode?: RecaptchaMode;
} = {}) {
  if (!siteKey || mode !== "invisible") {
    return null;
  }

  await loadRecaptchaScript(mode, siteKey);
  const activeApi = getActiveRecaptchaApi();
  if (!activeApi) {
    throw new Error("reCAPTCHA could not be loaded.");
  }

  const executeFn =
    typeof activeApi.execute === "function"
      ? activeApi.execute.bind(activeApi)
      : undefined;
  if (!executeFn) {
    throw new Error("Invisible reCAPTCHA is not available for this key.");
  }

  await new Promise<void>((resolve) => {
    if (typeof activeApi.ready === "function") {
      activeApi.ready(() => resolve());
      return;
    }
    resolve();
  });

  return executeFn(siteKey, { action });
}

export function RecaptchaBox({
  siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  theme = "light",
  resetSignal = 0,
  mode = getDefaultMode(),
  onVerify,
}: RecaptchaBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [displayMode, setDisplayMode] = useState<"widget" | "invisible">(
    "widget",
  );

  useEffect(() => {
    onVerify(null);
  }, [onVerify]);

  useEffect(() => {
    if (!siteKey) {
      setLoadError("reCAPTCHA site key is missing.");
      return;
    }

    let cancelled = false;

    loadRecaptchaScript(mode, siteKey)
      .then(() => {
        const activeApi = getActiveRecaptchaApi();
        if (cancelled || !activeApi) {
          return;
        }

        const runWhenReady =
          typeof activeApi.ready === "function"
            ? activeApi.ready.bind(activeApi)
            : (callback: () => void) => callback();

        runWhenReady(() => {
          if (cancelled) {
            return;
          }

          const renderFn =
            typeof activeApi.render === "function"
              ? activeApi.render.bind(activeApi)
              : undefined;

          if (
            mode === "widget" &&
            containerRef.current &&
            widgetIdRef.current === null &&
            renderFn
          ) {
            setDisplayMode("widget");
            widgetIdRef.current = renderFn(containerRef.current, {
              sitekey: siteKey,
              theme,
              callback: (token: string) => {
                setLoadError("");
                onVerify(token);
              },
              "expired-callback": () => onVerify(null),
              "error-callback": () => {
                setLoadError(
                  "reCAPTCHA could not be loaded. Please refresh the page.",
                );
                onVerify(null);
              },
            });
            return;
          }

          if (mode === "invisible") {
            setDisplayMode("invisible");
            setLoadError("");
            onVerify(null);
            return;
          }

          setLoadError(
            "This Google reCAPTCHA setup does not expose a renderable widget on this page.",
          );
          onVerify(null);
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error?.message || "Unable to load reCAPTCHA.");
        onVerify(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, onVerify, siteKey, theme]);

  useEffect(() => {
    const activeApi =
      typeof window === "undefined" ? null : getActiveRecaptchaApi();

    if (
      widgetIdRef.current !== null &&
      typeof activeApi?.reset === "function"
    ) {
      activeApi.reset(widgetIdRef.current);
    }

    onVerify(null);
  }, [onVerify, resetSignal]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="space-y-2 text-center">
      <div className="flex justify-center">
        <div ref={containerRef} className="overflow-hidden rounded-xl" />
      </div>
      {loadError ? (
        <p className="text-xs text-rose-500">{loadError}</p>
      ) : (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            {displayMode === "invisible"
              ? "This form is protected by Google reCAPTCHA."
              : "This verification helps protect the form from automated abuse."}
          </p>
          <p>
            Google{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Terms of Service
            </a>{" "}
            apply.
          </p>
        </div>
      )}
    </div>
  );
}

export default RecaptchaBox;
