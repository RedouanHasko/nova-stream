require("dotenv").config();

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const KNOWN_WEAK_SECRETS = new Set([
  "dev-secret",
  "dev_jwt_secret_change_me",
  "change_this_to_a_secure_random_value",
  "change_this_to_a_secure_random_value_min_32_chars",
  "change-me",
  "changeme",
]);

function isWeakJwtSecret(secret) {
  const normalized = (secret || "").trim();
  if (!normalized || normalized.length < 32) return true;
  return KNOWN_WEAK_SECRETS.has(normalized.toLowerCase());
}

function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || "").trim();

  if (IS_PRODUCTION && isWeakJwtSecret(secret)) {
    throw new Error(
      "JWT_SECRET must be set to a strong random value (minimum 32 characters) in production.",
    );
  }

  return secret || "dev-secret";
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

function isPublicRegistrationEnabled() {
  const flag = (process.env.ENABLE_PUBLIC_REGISTER || "").trim().toLowerCase();

  if (flag === "true") return true;
  if (flag === "false") return false;

  return !IS_PRODUCTION;
}

function getPublicRegisterKey() {
  return (process.env.PUBLIC_REGISTER_KEY || "").trim();
}

function areDebugRoutesEnabled() {
  return !IS_PRODUCTION || process.env.ENABLE_DEBUG_ROUTES === "true";
}

function assertSecurityConfig() {
  const secret = (process.env.JWT_SECRET || "").trim();

  if (!secret) {
    console.warn(
      "WARNING: JWT_SECRET is not set. Set a strong secret in backend/.env for production.",
    );
  }

  if (IS_PRODUCTION && isWeakJwtSecret(secret)) {
    throw new Error(
      "JWT_SECRET must be set to a strong random value (minimum 32 characters) in production.",
    );
  }

  if (
    IS_PRODUCTION &&
    isPublicRegistrationEnabled() &&
    !getPublicRegisterKey()
  ) {
    throw new Error(
      "PUBLIC_REGISTER_KEY must be set when ENABLE_PUBLIC_REGISTER=true in production.",
    );
  }
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  getJwtSecret,
  getAuthCookieOptions,
  isPublicRegistrationEnabled,
  getPublicRegisterKey,
  areDebugRoutesEnabled,
  assertSecurityConfig,
};
