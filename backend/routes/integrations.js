const express = require("express");

const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const { logSecurityEvent } = require("../lib/security-monitor");
const { encrypt, decrypt } = require("../lib/field-encryption");

function encryptIntegrationFields(data = {}) {
  const next = { ...data };

  if (next.apiKey !== undefined) {
    next.apiKey = next.apiKey ? encrypt(next.apiKey) : null;
  }

  if (next.config !== undefined) {
    if (next.config === null) {
      next.config = null;
    } else {
      const serializedConfig =
        typeof next.config === "string"
          ? next.config
          : JSON.stringify(next.config);
      next.config = encrypt(serializedConfig);
    }
  }

  return next;
}

function decryptIntegrationFields(record) {
  if (!record) return record;

  const next = { ...record };

  if (next.apiKey) {
    try {
      next.apiKey = decrypt(next.apiKey);
    } catch {
      next.apiKey = "[encrypted]";
    }
  }

  if (next.config) {
    try {
      const rawConfig =
        typeof next.config === "string"
          ? next.config
          : JSON.stringify(next.config);
      const decryptedConfig = decrypt(rawConfig);

      try {
        next.config = JSON.parse(decryptedConfig);
      } catch {
        next.config = decryptedConfig;
      }
    } catch {
      next.config = null;
    }
  }

  return next;
}

router.get("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const items = await prisma.apiIntegration.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json((Array.isArray(items) ? items : []).map(decryptIntegrationFields));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const { name, provider, apiKey, webhookUrl, config, active } = req.body;

    const created = await prisma.apiIntegration.create({
      data: encryptIntegrationFields({
        name,
        provider,
        apiKey,
        webhookUrl,
        config,
        active,
      }),
    });

    logSecurityEvent("integration_created", req, {
      integrationId: created.id,
      name,
      provider,
      userId: req.user?.id,
      email: req.user?.email,
    });

    res.json(decryptIntegrationFields(created));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, provider, apiKey, webhookUrl, config, active } = req.body;

    const updated = await prisma.apiIntegration.update({
      where: { id },
      data: encryptIntegrationFields({
        name,
        provider,
        apiKey,
        webhookUrl,
        config,
        active,
      }),
    });

    logSecurityEvent("integration_updated", req, {
      integrationId: id,
      userId: req.user?.id,
      email: req.user?.email,
    });

    res.json(decryptIntegrationFields(updated));
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
