const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { auth, requireRole } = require("../middleware/auth");

const AUDIT_LOG_FILE = path.join(__dirname, "..", "logs", "security-audit.log");

const CREDIT_EVENTS = new Set([
  "credit_topup",
  "credit_transfer",
  "credit_admin_transfer",
  "credit_revoke",
  "credit_request_submitted",
  "credit_request_approved",
  "credit_request_rejected",
]);

const AUTH_EVENTS = new Set([
  "login_success",
  "login_failed",
  "login_rejected_missing_fields",
  "login_lockout_active",
  "logout",
  "register_success",
  "register_blocked",
  "register_conflict",
  "recaptcha_failed",
  "verification_code_issued",
  "verification_code_rejected",
  "password_reset_success",
  "password_reset_rejected",
  "dev_login_blocked",
]);

const SYSTEM_EVENTS = new Set([
  "profile_updated",
  "setting_updated",
  "integration_created",
  "integration_updated",
  "integration_deleted",
]);

function categorizeEvent(event) {
  if (CREDIT_EVENTS.has(event)) return "credits";
  if (AUTH_EVENTS.has(event)) return "auth";
  if (SYSTEM_EVENTS.has(event)) return "system";
  return "other";
}

async function readLogLines() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return resolve([]);
    const lines = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(AUDIT_LOG_FILE, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        lines.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    });
    rl.on("close", () => resolve(lines));
    rl.on("error", reject);
  });
}

/**
 * GET /api/audit-logs
 * Query params:
 *   - category: "credits" | "auth" | "system" | "other" (default: all)
 *   - event: specific event name filter
 *   - search: string match against ip, email, event
 *   - page: 1-based (default: 1)
 *   - pageSize: 1–200 (default: 50)
 */
router.get("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const category = (req.query.category || "").toString().trim().toLowerCase();
    const eventFilter = (req.query.event || "").toString().trim().toLowerCase();
    const search = (req.query.search || "").toString().trim().toLowerCase();
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);

    let lines = await readLogLines();

    // Newest first
    lines.reverse();

    // Filter
    if (category) {
      lines = lines.filter((entry) => categorizeEvent(entry.event) === category);
    }
    if (eventFilter) {
      lines = lines.filter((entry) =>
        (entry.event || "").toString().toLowerCase() === eventFilter,
      );
    }
    if (search) {
      lines = lines.filter((entry) => {
        const haystack = [entry.event, entry.ip, entry.email, entry.userId]
          .map((v) => (v || "").toString().toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    }

    const total = lines.length;
    const items = lines.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      total,
      page,
      pageSize,
      items: items.map((entry) => ({
        ...entry,
        category: categorizeEvent(entry.event),
      })),
    });
  } catch (err) {
    console.error("audit-logs read error", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/audit-logs/events
 * Returns the list of all distinct event names seen in the log (for filter dropdowns).
 */
router.get("/events", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const lines = await readLogLines();
    const events = [...new Set(lines.map((l) => l.event).filter(Boolean))].sort();
    res.json(events);
  } catch (err) {
    console.error("audit-logs events error", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
