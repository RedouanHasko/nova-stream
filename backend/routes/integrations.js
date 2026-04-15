const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const { logSecurityEvent } = require("../lib/security-monitor");

router.get("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const list = await prisma.apiIntegration.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const { name, provider, config } = req.body;
    const created = await prisma.apiIntegration.create({
      data: { name, provider, config },
    });
    logSecurityEvent("integration_created", req, {
      name,
      provider,
      integrationId: created.id,
      userId: req.user?.id,
      email: req.user?.email,
    });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;
    const updated = await prisma.apiIntegration.update({ where: { id }, data });
    logSecurityEvent("integration_updated", req, {
      integrationId: id,
      userId: req.user?.id,
      email: req.user?.email,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.apiIntegration.delete({ where: { id } });
    logSecurityEvent("integration_deleted", req, {
      integrationId: id,
      userId: req.user?.id,
      email: req.user?.email,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
