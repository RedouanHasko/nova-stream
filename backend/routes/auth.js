const express = require("express");
const router = express.Router();
const prisma = require("../db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const rateLimit = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const { sendSms } = require("../services/sms");
const {
  COOKIE_NAME,
  getJwtSecret,
  getAuthCookieOptions,
  isPublicRegistrationEnabled,
  getPublicRegisterKey,
  areDebugRoutesEnabled,
} = require("../lib/auth-config");
const {
  clearFailedLoginAttempts,
  getLoginLockoutState,
  logSecurityEvent,
  registerFailedLogin,
} = require("../lib/security-monitor");
const { verifyRecaptchaToken } = require("../lib/recaptcha");

const SECRET = getJwtSecret();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts, please try again later." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts, please try again later." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts, please try again later." },
});

const phoneCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many verification code requests, please try again later.",
  },
});

const VERIFICATION_CODE_TTL_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

function buildLoginLockoutMessage(remainingMs = 0) {
  const remainingMinutes = Math.max(
    1,
    Math.ceil(Number(remainingMs || 0) / 60000),
  );
  return `Too many failed login attempts. Please wait ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} and try again.`;
}

async function ensureRecaptchaOrReject(req, res, context) {
  const verification = await verifyRecaptchaToken(
    req.body?.captchaToken,
    req,
    context,
  );

  if (verification.ok) {
    return true;
  }

  logSecurityEvent("recaptcha_failed", req, {
    context,
    reason: verification.error,
    details: verification.details,
  });
  res.status(400).json({ error: verification.error });
  return false;
}

function normalizePhoneNumber(value) {
  const input = (value || "").toString().trim();
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }
  return input.startsWith("+") ? `+${digits}` : digits;
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(code) {
  return crypto
    .createHash("sha256")
    .update((code || "").toString())
    .digest("hex");
}

function isVerificationRecordUsable(record) {
  if (!record || record.consumedAt) return false;
  const expiresAtMs = new Date(record.expiresAt || 0).getTime();
  return (
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > Date.now() &&
    Number(record.attempts || 0) < MAX_VERIFICATION_ATTEMPTS
  );
}

async function consumeVerificationRecord(record, success = false) {
  if (!record?.id) return;
  const nextAttempts = Number(record.attempts || 0) + 1;
  await prisma.phoneVerificationCode.update({
    where: { id: record.id },
    data: {
      attempts: nextAttempts,
      consumedAt:
        success || nextAttempts >= MAX_VERIFICATION_ATTEMPTS
          ? new Date()
          : record.consumedAt || null,
    },
  });
}

async function issuePhoneVerificationCode({ purpose, email, phone, userId }) {
  await prisma.phoneVerificationCode.deleteMany({
    where: {
      purpose,
      phone,
      ...(email ? { email } : {}),
      ...(userId ? { userId } : {}),
    },
  });

  const code = generateVerificationCode();
  const expiresAt = new Date(
    Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
  );

  await prisma.phoneVerificationCode.create({
    data: {
      userId: userId || null,
      purpose,
      email: email || null,
      phone,
      codeHash: hashVerificationCode(code),
      expiresAt,
    },
  });

  const delivery = await sendSms({
    to: phone,
    message: `Your NOVA Panel verification code is ${code}. It expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes.`,
  });

  return { code, expiresAt, delivery };
}

function buildVerificationResponse(message, issued) {
  return {
    success: true,
    message,
    codeIssued: true,
    ...(process.env.NODE_ENV !== "production" && issued?.delivery?.simulated
      ? { devCode: issued.code }
      : {}),
  };
}

async function generateResellerCode(prefix = "RES") {
  const safePrefix = prefix === "SUB" ? "SUB" : "RES";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const seed = `${Date.now()}${attempt}`.slice(-6).padStart(6, "0");
    const candidate = `${safePrefix}-${seed}`;
    const existing = await prisma.reseller.findFirst({
      where: { code: candidate },
    });
    if (!existing) return candidate;
  }

  return `${safePrefix}-${Math.random().toString().slice(2, 8)}`;
}

async function buildAuthUser(user) {
  if (!user) return null;

  let reseller = null;
  if (user.resellerId) {
    const resellerRecord = await prisma.reseller.findUnique({
      where: { id: Number(user.resellerId) },
    });
    if (resellerRecord) {
      reseller = {
        id: resellerRecord.id,
        name: resellerRecord.name,
        code: resellerRecord.code,
        phone: resellerRecord.phone || null,
        credits: Number(resellerRecord.credits || 0),
        parentId: resellerRecord.parentId ?? null,
      };
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone || null,
    role: user.role,
    resellerId: user.resellerId ?? null,
    reseller,
  };
}

function extractTokenFromRequest(req) {
  const header = req.headers?.authorization;
  if (header && header.split(" ").length === 2) {
    return header.split(" ")[1];
  }

  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }

  return null;
}

function getRegisterAccess(req) {
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      if ((payload?.role || "").toString().toLowerCase() === "superadmin") {
        return { allowed: true, mode: "admin" };
      }
    } catch {
      // Ignore invalid auth here and continue to the public signup guard.
    }
  }

  if (!isPublicRegistrationEnabled()) {
    return {
      allowed: false,
      error: "Public registration is disabled on this endpoint.",
    };
  }

  const configuredKey = getPublicRegisterKey();
  if (!configuredKey) {
    return { allowed: true, mode: "public" };
  }

  const providedKey = (req.headers["x-signup-key"] || req.body?.signupKey || "")
    .toString()
    .trim();

  if (!providedKey || providedKey !== configuredKey) {
    return {
      allowed: false,
      error: "A valid registration key is required for public signup.",
    };
  }

  return { allowed: true, mode: "public" };
}

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const registerAccess = getRegisterAccess(req);
    if (!registerAccess.allowed) {
      logSecurityEvent("register_blocked", req, {
        reason: registerAccess.error,
      });
      return res.status(403).json({ error: registerAccess.error });
    }

    const { email, password, name, role, resellerId, phone } = req.body || {};
    const normalizedEmail = (email || "").toString().trim().toLowerCase();
    const normalizedPassword = (password || "").toString();
    const normalizedPhone = normalizePhoneNumber(phone);
    const verificationCodeInput = (req.body?.verificationCode || "")
      .toString()
      .trim();

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ error: "Email and password required" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res
        .status(400)
        .json({ error: "A valid email address is required" });
    }

    if (normalizedPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }

    if (
      registerAccess.mode === "public" &&
      !(await ensureRecaptchaOrReject(req, res, "public-register"))
    ) {
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      logSecurityEvent("register_conflict", req, {
        email: normalizedEmail,
        reason: "user_exists",
      });
      return res.status(409).json({ error: "User already exists" });
    }

    const requestedRole = (role || "").toString().toLowerCase();
    const safeRole =
      registerAccess.mode === "admin"
        ? ["superadmin", "reseller", "subreseller"].includes(requestedRole)
          ? requestedRole
          : "subreseller"
        : requestedRole === "reseller"
          ? "reseller"
          : "subreseller";
    const parsedResellerId =
      registerAccess.mode === "admin" &&
      resellerId !== undefined &&
      resellerId !== null &&
      resellerId !== ""
        ? Number(resellerId)
        : null;
    let linkedResellerId = Number.isFinite(parsedResellerId)
      ? parsedResellerId
      : null;

    if (!normalizedPhone) {
      return res.status(400).json({
        error:
          "A valid phone number is required for password recovery and notifications.",
      });
    }

    if (registerAccess.mode === "public" && verificationCodeInput) {
      const verificationRecord = await prisma.phoneVerificationCode.findFirst({
        where: {
          purpose: "SIGNUP",
          email: normalizedEmail,
          phone: normalizedPhone,
        },
        orderBy: { createdAt: "desc" },
      });

      if (
        !verificationRecord ||
        !isVerificationRecordUsable(verificationRecord)
      ) {
        return res.status(400).json({
          error:
            "The signup verification code is invalid or expired. Please request a new one.",
        });
      }

      const isCodeValid =
        hashVerificationCode(verificationCodeInput) ===
        verificationRecord.codeHash;
      await consumeVerificationRecord(verificationRecord, isCodeValid);

      if (!isCodeValid) {
        return res.status(400).json({
          error:
            "The signup verification code is invalid or expired. Please request a new one.",
        });
      }
    }

    if (safeRole === "reseller" && !linkedResellerId) {
      const existingReseller = await prisma.reseller.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingReseller) {
        linkedResellerId = existingReseller.id;
      } else {
        const resellerRecord = await prisma.reseller.create({
          data: {
            code: await generateResellerCode("RES"),
            name:
              (name || "").toString().trim() ||
              normalizedEmail.split("@")[0] ||
              "New Reseller",
            email: normalizedEmail,
            phone: normalizedPhone,
            credits: 0,
            status: "ACTIVE",
          },
        });
        linkedResellerId = resellerRecord.id;
      }
    }

    const hashed = await bcrypt.hash(normalizedPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name,
        phone: normalizedPhone,
        role: safeRole,
        resellerId: linkedResellerId,
      },
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET,
      { expiresIn: "7d" },
    );
    res.cookie(COOKIE_NAME, token, getAuthCookieOptions());
    logSecurityEvent("register_success", req, {
      email: normalizedEmail,
      userId: user.id,
      role: safeRole,
      mode: registerAccess.mode,
    });
    res.json({
      token,
      user: await buildAuthUser(user),
    });
  } catch (err) {
    console.error(err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").toString().trim().toLowerCase();

    if (!normalizedEmail || !password) {
      logSecurityEvent("login_rejected_missing_fields", req, {
        email: normalizedEmail || null,
      });
      return res.status(400).json({ error: "Email and password required" });
    }

    if (!(await ensureRecaptchaOrReject(req, res, "login"))) {
      return;
    }

    const lockoutState = getLoginLockoutState(req, normalizedEmail);
    if (lockoutState.locked) {
      logSecurityEvent("login_lockout_active", req, {
        email: normalizedEmail,
        failures: lockoutState.failures,
        remainingMs: lockoutState.remainingMs,
      });
      return res.status(429).json({
        error: buildLoginLockoutMessage(lockoutState.remainingMs),
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      const attempt = registerFailedLogin(req, normalizedEmail);
      logSecurityEvent(
        attempt.locked ? "login_locked_out" : "login_failed",
        req,
        {
          email: normalizedEmail,
          reason: "user_not_found",
          failures: attempt.failures,
          remainingMs: attempt.remainingMs,
        },
      );
      return res.status(attempt.locked ? 429 : 401).json({
        error: attempt.locked
          ? buildLoginLockoutMessage(attempt.remainingMs)
          : "Invalid credentials",
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const attempt = registerFailedLogin(req, normalizedEmail);
      logSecurityEvent(
        attempt.locked ? "login_locked_out" : "login_failed",
        req,
        {
          email: normalizedEmail,
          userId: user.id,
          reason: "invalid_password",
          failures: attempt.failures,
          remainingMs: attempt.remainingMs,
        },
      );
      return res.status(attempt.locked ? 429 : 401).json({
        error: attempt.locked
          ? buildLoginLockoutMessage(attempt.remainingMs)
          : "Invalid credentials",
      });
    }

    clearFailedLoginAttempts(req, normalizedEmail);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET,
      { expiresIn: "7d" },
    );
    // set httpOnly cookie for authenticated sessions
    res.cookie(COOKIE_NAME, token, getAuthCookieOptions());
    logSecurityEvent("login_success", req, {
      email: normalizedEmail,
      userId: user.id,
      role: user.role,
    });
    res.json({
      token,
      user: await buildAuthUser(user),
    });
  } catch (err) {
    console.error(err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/request-verification-code",
  phoneCodeLimiter,
  async (req, res) => {
    try {
      const purpose = (req.body?.purpose || "PASSWORD_RESET")
        .toString()
        .trim()
        .toUpperCase();
      const normalizedEmail = (req.body?.email || "")
        .toString()
        .trim()
        .toLowerCase();
      const normalizedPhone = normalizePhoneNumber(req.body?.phone);

      if (!normalizedPhone) {
        logSecurityEvent("verification_code_rejected", req, {
          email: normalizedEmail || null,
          purpose,
          reason: "invalid_phone",
        });
        return res.status(400).json({
          error: "A valid phone number is required.",
        });
      }

      if (purpose === "SIGNUP") {
        const registerAccess = getRegisterAccess(req);
        if (!registerAccess.allowed) {
          return res.status(403).json({ error: registerAccess.error });
        }
        if (!normalizedEmail) {
          return res.status(400).json({
            error: "Email and phone number are required.",
          });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return res.status(400).json({
            error: "A valid email address is required",
          });
        }

        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (existing) {
          return res.status(409).json({ error: "User already exists" });
        }

        const issued = await issuePhoneVerificationCode({
          purpose: "SIGNUP",
          email: normalizedEmail,
          phone: normalizedPhone,
        });

        logSecurityEvent("verification_code_issued", req, {
          email: normalizedEmail,
          purpose: "SIGNUP",
          phoneLast4: normalizedPhone.slice(-4),
        });
        return res.json(
          buildVerificationResponse(
            "Verification code sent to your phone.",
            issued,
          ),
        );
      }

      if (purpose !== "PASSWORD_RESET") {
        return res.status(400).json({
          error: "Unsupported verification purpose.",
        });
      }

      if (!normalizedEmail) {
        return res.status(400).json({
          error: "Email and phone number are required.",
        });
      }

      const successMessage =
        "A verification code has been sent to the saved phone number for this account.";
      const recoveryFailureMessage =
        "Recovery verification failed. The provided email and phone number did not match our records.";
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      const storedUserPhone = normalizePhoneNumber(user?.phone);

      if (!user || !storedUserPhone || storedUserPhone !== normalizedPhone) {
        logSecurityEvent("verification_code_rejected", req, {
          email: normalizedEmail,
          purpose: "PASSWORD_RESET",
          reason: "email_phone_mismatch",
          phoneLast4: normalizedPhone.slice(-4),
        });
        return res.status(400).json({
          error: recoveryFailureMessage,
          codeIssued: false,
        });
      }

      const issued = await issuePhoneVerificationCode({
        purpose: "PASSWORD_RESET",
        email: normalizedEmail,
        phone: normalizedPhone,
        userId: user.id,
      });

      logSecurityEvent("verification_code_issued", req, {
        email: normalizedEmail,
        userId: user.id,
        purpose: "PASSWORD_RESET",
        phoneLast4: normalizedPhone.slice(-4),
      });

      return res.json(buildVerificationResponse(successMessage, issued));
    } catch (err) {
      console.error("request-verification-code error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const normalizedEmail = (req.body?.email || "")
      .toString()
      .trim()
      .toLowerCase();
    const normalizedPhone = normalizePhoneNumber(req.body?.phone);
    const verificationCode = (req.body?.verificationCode || "")
      .toString()
      .trim();
    const newPassword = (req.body?.newPassword || "").toString();
    const recoveryFailureMessage =
      "Recovery verification failed. The provided email and phone number did not match our records.";

    if (
      !normalizedEmail ||
      !normalizedPhone ||
      !verificationCode ||
      !newPassword
    ) {
      return res.status(400).json({
        error:
          "Email, phone number, verification code, and a new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters long.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      logSecurityEvent("password_reset_rejected", req, {
        email: normalizedEmail,
        reason: "user_not_found",
      });
      return res.status(400).json({
        error: recoveryFailureMessage,
      });
    }

    const storedUserPhone = normalizePhoneNumber(user.phone);

    if (!storedUserPhone) {
      return res.status(400).json({
        error:
          "This account does not have a verified recovery phone yet. Please contact support.",
      });
    }

    if (normalizedPhone !== storedUserPhone) {
      logSecurityEvent("password_reset_rejected", req, {
        email: normalizedEmail,
        userId: user.id,
        reason: "phone_mismatch",
        phoneLast4: normalizedPhone.slice(-4),
      });
      return res.status(400).json({
        error: recoveryFailureMessage,
      });
    }

    const verificationRecord = await prisma.phoneVerificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        email: normalizedEmail,
        phone: normalizedPhone,
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      !verificationRecord ||
      !isVerificationRecordUsable(verificationRecord)
    ) {
      logSecurityEvent("password_reset_rejected", req, {
        email: normalizedEmail,
        userId: user.id,
        reason: "code_missing_or_expired",
      });
      return res.status(400).json({
        error:
          "The verification code is invalid or expired. Please request a new one.",
      });
    }

    const isCodeValid =
      hashVerificationCode(verificationCode) === verificationRecord.codeHash;
    await consumeVerificationRecord(verificationRecord, isCodeValid);

    if (!isCodeValid) {
      logSecurityEvent("password_reset_rejected", req, {
        email: normalizedEmail,
        userId: user.id,
        reason: "invalid_code",
      });
      return res.status(400).json({
        error:
          "The verification code is invalid or expired. Please request a new one.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    logSecurityEvent("password_reset_success", req, {
      email: normalizedEmail,
      userId: user.id,
    });
    res.json({
      success: true,
      message: "Password updated successfully. You can now sign in.",
    });
  } catch (err) {
    console.error("forgot-password error", err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Logout (clears cookie)
router.post("/logout", async (req, res) => {
  logSecurityEvent("logout", req, {});
  res.clearCookie(COOKIE_NAME, {
    ...getAuthCookieOptions(),
    maxAge: undefined,
  });
  res.json({ success: true });
});

// Get current authenticated user
router.get("/me", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json(await buildAuthUser(user));
  } catch (err) {
    console.error("/api/auth/me error", err && err.message);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Development helper: issue a JWT for a given email without a password (only in non-production)
router.post("/dev-login", async (req, res) => {
  if (!areDebugRoutesEnabled()) {
    logSecurityEvent("dev_login_blocked", req, { reason: "debug_disabled" });
    return res.status(403).json({ error: "Disabled" });
  }
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email required" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET,
      { expiresIn: "7d" },
    );
    logSecurityEvent("dev_login_success", req, {
      email: user.email,
      userId: user.id,
      role: user.role,
    });
    res.json({
      token,
      user: await buildAuthUser(user),
    });
  } catch (err) {
    console.error("dev-login error", err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
