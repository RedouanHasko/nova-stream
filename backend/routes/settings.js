const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const { logSecurityEvent } = require("../lib/security-monitor");

// Get all settings
router.get("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single setting
router.get("/:key", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const key = req.params.key;
    const s = await prisma.systemSetting.findUnique({ where: { key } });
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create or update setting
router.put("/:key", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const key = req.params.key;
    const { value } = req.body;
    const upsert = await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    logSecurityEvent("setting_updated", req, {
      key,
      userId: req.user?.id,
      email: req.user?.email,
    });
    res.json(upsert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
