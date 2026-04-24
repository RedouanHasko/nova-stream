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

const ACTIVATION_WINDOW_MS = Number(
  process.env.ACTIVATION_GUARD_WINDOW_MS || 5 * 60 * 1000,
);
const ACTIVATION_MAX_REQUESTS_PER_IP = Number(
  process.env.ACTIVATION_GUARD_MAX_PER_IP || 120,
);
const ACTIVATION_MAX_REQUESTS_PER_MAC_PER_IP = Number(
  process.env.ACTIVATION_GUARD_MAX_PER_MAC_PER_IP || 30,
);
const ACTIVATION_BLOCK_DURATION_MS = Number(
  process.env.ACTIVATION_GUARD_BLOCK_MS || 30 * 60 * 1000,
);
const ACTIVATION_ANOMALY_THRESHOLD = Number(
  process.env.ACTIVATION_GUARD_ANOMALY_THRESHOLD || 220,
);
const SECURITY_ALERT_WEBHOOK_URL = (
  process.env.SECURITY_ALERT_WEBHOOK_URL || ""
).toString().trim();
const SECURITY_ALERT_COOLDOWN_MS = Number(
  process.env.SECURITY_ALERT_COOLDOWN_MS || 5 * 60 * 1000,
);
const DEVICE_KEY_MISMATCH_SPIKE_THRESHOLD = Number(
  process.env.DEVICE_KEY_MISMATCH_SPIKE_THRESHOLD || 25,
);
const DEVICE_KEY_MISMATCH_SPIKE_WINDOW_MS = Number(
  process.env.DEVICE_KEY_MISMATCH_SPIKE_WINDOW_MS || 10 * 60 * 1000,
);

const loginAttempts = new Map();
const activationAttempts = new Map();
const alertCooldowns = new Map();
const keyMismatchAttempts = new Map();

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

function shouldAlert(alertKey, now = Date.now()) {
  const lastSentAt = Number(alertCooldowns.get(alertKey) || 0);
  if (lastSentAt && now - lastSentAt < SECURITY_ALERT_COOLDOWN_MS) {
    return false;
  }
  alertCooldowns.set(alertKey, now);
  return true;
}

async function sendSecurityAlert(entry) {
  if (!SECURITY_ALERT_WEBHOOK_URL) return;

  try {
    if (typeof fetch !== "function") return;

    await fetch(SECURITY_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "backend-security-monitor",
        severity: "high",
        timestamp: entry.timestamp,
        event: entry.event,
        ip: entry.ip,
        path: entry.path,
        details: entry.details,
      }),
    });
  } catch (error) {
    console.warn("Security alert dispatch failed:", error?.message || error);
  }
}

function trackDeviceKeyMismatchSpike(entry) {
  const now = Date.now();
  const key = `${entry.ip || "unknown"}::device_key_mismatch`;
  const current = keyMismatchAttempts.get(key) || {
    startedAt: now,
    count: 0,
  };

  if (now - Number(current.startedAt || 0) > DEVICE_KEY_MISMATCH_SPIKE_WINDOW_MS) {
    current.startedAt = now;
    current.count = 0;
  }

  current.count += 1;
  keyMismatchAttempts.set(key, current);

  if (current.count < DEVICE_KEY_MISMATCH_SPIKE_THRESHOLD) {
    return;
  }

  const alertKey = `${key}:spike`;
  if (!shouldAlert(alertKey, now)) {
    return;
  }

  const spikeEntry = {
    ...entry,
    event: "device_key_mismatch_spike",
    details: {
      ...(entry.details || {}),
      count: current.count,
      windowMs: DEVICE_KEY_MISMATCH_SPIKE_WINDOW_MS,
      threshold: DEVICE_KEY_MISMATCH_SPIKE_THRESHOLD,
    },
  };

  appendAuditEntry(spikeEntry);
  void sendSecurityAlert(spikeEntry);
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

  if (event === "device_key_mismatch") {
    trackDeviceKeyMismatchSpike(entry);
  }

  if (["login_locked_out", "activation_guard_ip_blocked"].includes(event)) {
    const alertKey = `${event}:${entry.ip || "unknown"}`;
    if (shouldAlert(alertKey)) {
      void sendSecurityAlert(entry);
    }
  }
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

function normalizeMacAddressCandidate(value) {
  return (value || "").toString().trim().toUpperCase();
}

function extractMacFromRequest(req) {
  const body = req.body || {};
  const query = req.query || {};
  return (
    normalizeMacAddressCandidate(body.mac) ||
    normalizeMacAddressCandidate(body.macAddress) ||
    normalizeMacAddressCandidate(query.mac) ||
    normalizeMacAddressCandidate(query.macAddress)
  );
}

function getActivationAttemptRecord(ip) {
  const now = Date.now();
  const existing = activationAttempts.get(ip);
  if (!existing) {
    return {
      startedAt: now,
      total: 0,
      blockedUntil: 0,
      macAttempts: new Map(),
    };
  }

  if (existing.blockedUntil && existing.blockedUntil <= now) {
    activationAttempts.delete(ip);
    return {
      startedAt: now,
      total: 0,
      blockedUntil: 0,
      macAttempts: new Map(),
    };
  }

  if (now - Number(existing.startedAt || 0) > ACTIVATION_WINDOW_MS) {
    return {
      startedAt: now,
      total: 0,
      blockedUntil: 0,
      macAttempts: new Map(),
    };
  }

  return existing;
}

function createPublicActivationGuard(routeName = "activation") {
  return (req, res, next) => {
    const ip = resolveClientIp(req);
    const now = Date.now();
    const record = getActivationAttemptRecord(ip);

    if (record.blockedUntil && record.blockedUntil > now) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((record.blockedUntil - now) / 1000),
      );
      res.setHeader("Retry-After", retryAfterSec.toString());
      return res.status(429).json({
        error: "Too many activation attempts. Please try again later.",
      });
    }

    record.total = Number(record.total || 0) + 1;
    const mac = extractMacFromRequest(req);
    if (mac) {
      const currentMacAttempts = Number(record.macAttempts.get(mac) || 0) + 1;
      record.macAttempts.set(mac, currentMacAttempts);
    }

    const macAttempts = mac ? Number(record.macAttempts.get(mac) || 0) : 0;
    const ipLimitExceeded = record.total > ACTIVATION_MAX_REQUESTS_PER_IP;
    const macLimitExceeded =
      !!mac && macAttempts > ACTIVATION_MAX_REQUESTS_PER_MAC_PER_IP;

    if (record.total >= ACTIVATION_ANOMALY_THRESHOLD) {
      record.blockedUntil = now + ACTIVATION_BLOCK_DURATION_MS;
      logSecurityEvent("activation_guard_ip_blocked", req, {
        routeName,
        ip,
        total: record.total,
        mac: mac || null,
        macAttempts,
        blockedForMs: ACTIVATION_BLOCK_DURATION_MS,
      });
    }

    activationAttempts.set(ip, record);

    if (!ipLimitExceeded && !macLimitExceeded) {
      return next();
    }

    if (ipLimitExceeded || macLimitExceeded) {
      logSecurityEvent("activation_guard_rate_limited", req, {
        routeName,
        ip,
        total: record.total,
        mac: mac || null,
        macAttempts,
        ipLimitExceeded,
        macLimitExceeded,
      });
    }

    const retryAfterSec = Math.max(1, Math.ceil(ACTIVATION_WINDOW_MS / 1000));
    res.setHeader("Retry-After", retryAfterSec.toString());
    return res.status(429).json({
      error: "Too many activation attempts. Please try again later.",
    });
  };
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
  createPublicActivationGuard,
};
