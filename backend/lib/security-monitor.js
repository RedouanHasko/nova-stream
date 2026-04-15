const fs = require("fs");
const path = require("path");

const AUDIT_LOG_DIR = path.join(__dirname, "..", "logs");
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, "security-audit.log");

const LOGIN_LOCK_WINDOW_MS = Number(
  process.env.LOGIN_LOCK_WINDOW_MS || 15 * 60 * 1000,
);
const LOGIN_LOCK_DURATION_MS = Number(
  process.env.LOGIN_LOCK_DURATION_MS || 15 * 60 * 1000,
);
const LOGIN_MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);

const loginAttempts = new Map();

function resolveClientIp(req) {
  const forwarded = (req.headers?.["x-forwarded-for"] || "")
    .toString()
    .split(",")[0]
    .trim();
  const ip =
    forwarded ||
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "unknown";

  return ip.replace(/^::ffff:/, "");
}

function sanitizeDetails(details = {}) {
  const next = { ...details };
  for (const key of ["password", "token", "verificationCode", "code"]) {
    if (next[key] !== undefined) {
      next[key] = "[redacted]";
    }
  }
  return next;
}

function appendAuditEntry(entry) {
  try {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    fs.appendFile(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`, (error) => {
      if (error) {
        console.warn("Security audit log write failed:", error.message);
      }
    });
  } catch (error) {
    console.warn("Security audit log write failed:", error.message);
  }
}

function logSecurityEvent(event, req, details = {}) {
  const safeDetails = sanitizeDetails(details);
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ip: resolveClientIp(req),
    method: req.method,
    path: req.originalUrl || req.url,
    userAgent: req.headers?.["user-agent"] || "",
    userId: req.user?.id || safeDetails.userId || null,
    email: safeDetails.email || req.user?.email || null,
    details: safeDetails,
  };

  appendAuditEntry(entry);
}

function getLockKey(req, email = "") {
  return `${resolveClientIp(req)}::${(email || "").toString().trim().toLowerCase()}`;
}

function getFreshAttemptRecord(record) {
  if (!record) {
    return {
      failures: 0,
      firstFailureAt: Date.now(),
      lockedUntil: 0,
    };
  }

  if (
    record.firstFailureAt &&
    Date.now() - Number(record.firstFailureAt) > LOGIN_LOCK_WINDOW_MS
  ) {
    return {
      failures: 0,
      firstFailureAt: Date.now(),
      lockedUntil: 0,
    };
  }

  return record;
}

function getLoginLockoutState(req, email = "") {
  const key = getLockKey(req, email);
  const record = getFreshAttemptRecord(loginAttempts.get(key));

  if (!record.failures && !record.lockedUntil) {
    loginAttempts.delete(key);
    return { locked: false, failures: 0, remainingMs: 0 };
  }

  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    return {
      locked: true,
      failures: Number(record.failures || 0),
      remainingMs: Math.max(0, record.lockedUntil - Date.now()),
    };
  }

  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    loginAttempts.delete(key);
    return { locked: false, failures: 0, remainingMs: 0 };
  }

  loginAttempts.set(key, record);
  return {
    locked: false,
    failures: Number(record.failures || 0),
    remainingMs: 0,
  };
}

function registerFailedLogin(req, email = "") {
  const key = getLockKey(req, email);
  const now = Date.now();
  const record = getFreshAttemptRecord(loginAttempts.get(key));

  record.failures = Number(record.failures || 0) + 1;
  record.firstFailureAt = record.firstFailureAt || now;

  if (record.failures >= LOGIN_MAX_FAILURES) {
    record.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
  }

  loginAttempts.set(key, record);

  return {
    locked: Boolean(record.lockedUntil && record.lockedUntil > now),
    failures: record.failures,
    remainingMs:
      record.lockedUntil && record.lockedUntil > now
        ? record.lockedUntil - now
        : 0,
  };
}

function clearFailedLoginAttempts(req, email = "") {
  loginAttempts.delete(getLockKey(req, email));
}

function sensitiveNoStore(req, res, next) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, private",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
}

module.exports = {
  LOGIN_LOCK_DURATION_MS,
  LOGIN_MAX_FAILURES,
  clearFailedLoginAttempts,
  getLoginLockoutState,
  logSecurityEvent,
  registerFailedLogin,
  resolveClientIp,
  sensitiveNoStore,
};
