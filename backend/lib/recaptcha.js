const { resolveClientIp } = require("./security-monitor");

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

function isRecaptchaEnabled() {
  return (
    (process.env.ENABLE_RECAPTCHA || "").toString().trim().toLowerCase() ===
      "true" && Boolean((process.env.RECAPTCHA_SECRET_KEY || "").trim())
  );
}

async function verifyRecaptchaToken(token, req, context = "auth") {
  if (!isRecaptchaEnabled()) {
    return { ok: true, skipped: true, context };
  }

  const secret = (process.env.RECAPTCHA_SECRET_KEY || "").trim();
  const normalizedToken = (token || "").toString().trim();

  if (!secret) {
    return {
      ok: false,
      context,
      error: "reCAPTCHA is not configured correctly on the server.",
      details: ["missing-input-secret"],
    };
  }

  if (!normalizedToken) {
    return {
      ok: false,
      context,
      error: "Please complete the reCAPTCHA challenge.",
      details: ["missing-input-response"],
    };
  }

  const payload = new URLSearchParams();
  payload.set("secret", secret);
  payload.set("response", normalizedToken);

  const remoteIp = resolveClientIp(req);
  if (remoteIp && remoteIp !== "unknown") {
    payload.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    const result = await response.json().catch(() => null);
    const errorCodes = Array.isArray(result?.["error-codes"])
      ? result["error-codes"]
      : ["verification-failed"];

    if (!response.ok || !result?.success) {
      let errorMessage = "reCAPTCHA verification failed. Please try again.";

      if (errorCodes.includes("timeout-or-duplicate")) {
        errorMessage = "The reCAPTCHA check expired. Please try again.";
      } else if (errorCodes.includes("browser-error")) {
        errorMessage =
          "The browser could not complete the reCAPTCHA check. Refresh the page and try again, and disable strict ad-block/privacy shields for this site if needed.";
      } else if (errorCodes.includes("invalid-input-response")) {
        errorMessage = "The reCAPTCHA response was invalid. Please try again.";
      }

      return {
        ok: false,
        context,
        error: errorMessage,
        details: errorCodes,
      };
    }

    return {
      ok: true,
      context,
      details: result,
    };
  } catch (error) {
    return {
      ok: false,
      context,
      error: "reCAPTCHA verification could not be completed. Please try again.",
      details: [error?.message || "network-error"],
    };
  }
}

module.exports = {
  isRecaptchaEnabled,
  verifyRecaptchaToken,
};
