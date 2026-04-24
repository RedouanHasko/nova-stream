/**
 * AES-256-GCM field-level encryption for sensitive database columns.
 *
 * Usage:
 *   const { encrypt, decrypt } = require('./field-encryption');
 *   const cipher = encrypt('my-api-key');      // store `cipher` in DB
 *   const plain  = decrypt(cipher);             // retrieve original value
 *
 * The key is derived from FIELD_ENCRYPTION_KEY (env). In development, a
 * fixed fallback key is used so the app still runs without configuration,
 * but a warning is printed. In production the env var is required.
 *
 * Ciphertext format (all base64url-encoded, colon-delimited):
 *   <iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * A "v1:" prefix is stored so future key rotation can be handled gracefully.
 */

"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12;  // 96-bit IV recommended for GCM
const TAG_BYTES = 16;
const VERSION_PREFIX = "v1:";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ── Key resolution ────────────────────────────────────────────────────────────

function resolveKey() {
  const raw = (process.env.FIELD_ENCRYPTION_KEY || "").trim();

  if (!raw) {
    if (IS_PRODUCTION) {
      throw new Error(
        "FIELD_ENCRYPTION_KEY must be set in production. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    // Dev fallback — deterministic so existing dev-DB values survive restarts.
    console.warn(
      "[field-encryption] WARNING: FIELD_ENCRYPTION_KEY is not set. " +
        "Using dev fallback key. Set FIELD_ENCRYPTION_KEY in production.",
    );
    return Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "hex",
    );
  }

  // Accept either a 64-char hex string (32 bytes) or a raw string that will
  // be SHA-256 hashed to produce a 32-byte key.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (raw.length < 32 && IS_PRODUCTION) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be at least 32 characters (or a 64-char hex string).",
    );
  }

  return crypto.createHash("sha256").update(raw).digest();
}

// Resolve once at module load time so the error is raised at startup, not
// lazily on the first encrypt/decrypt call.
const KEY = resolveKey();

// ── Core helpers ──────────────────────────────────────────────────────────────

function toB64(buf) {
  return buf.toString("base64url");
}

function fromB64(str) {
  return Buffer.from(str, "base64url");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a string value. Returns a versioned ciphertext string safe to store
 * in a TEXT database column. Returns null when value is null/undefined/empty.
 */
function encrypt(value) {
  if (value === null || value === undefined || value === "") return value ?? null;

  const plaintext = typeof value === "string" ? value : JSON.stringify(value);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv, {
    authTagLength: TAG_BYTES,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${VERSION_PREFIX}${toB64(iv)}:${toB64(tag)}:${toB64(encrypted)}`;
}

/**
 * Decrypt a value produced by `encrypt`. Returns the original string.
 * Returns the value unchanged when it is not in the expected format (allows
 * gradual migration — values written before encryption was enabled pass through
 * as-is during the transition period).
 */
function decrypt(value) {
  if (value === null || value === undefined || value === "") return value ?? null;
  if (typeof value !== "string") return value;
  if (!value.startsWith(VERSION_PREFIX)) {
    // Not yet encrypted (legacy value) — return as-is during migration.
    return value;
  }

  const withoutVersion = value.slice(VERSION_PREFIX.length);
  const parts = withoutVersion.split(":");
  if (parts.length !== 3) {
    throw new Error("field-encryption: malformed ciphertext");
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = fromB64(ivB64);
  const tag = fromB64(tagB64);
  const ciphertext = fromB64(cipherB64);

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Check whether a stored value is already encrypted by this module.
 */
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(VERSION_PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
