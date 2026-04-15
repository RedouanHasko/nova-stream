const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { auth, requireRole } = require("../middleware/auth");
const { areDebugRoutesEnabled, getJwtSecret } = require("../lib/auth-config");

const SECRET = getJwtSecret();

router.use(auth, requireRole("superadmin"));
router.use((req, res, next) => {
  if (!areDebugRoutesEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

router.post("/verify", (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!token) return res.status(400).json({ error: "token required" });
    const payload = jwt.verify(token, SECRET);
    res.json({ ok: true, payload });
  } catch (e) {
    console.error("debug verify error", e && e.message);
    res.status(400).json({ ok: false, error: e && e.message });
  }
});

module.exports = router;
