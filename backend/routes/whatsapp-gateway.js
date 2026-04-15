const express = require("express");
const router = express.Router();
const { auth, requireRole } = require("../middleware/auth");
const {
  getWhatsAppGatewayStatus,
  startEmbeddedWhatsAppGateway,
} = require("../services/whatsapp-gateway");

router.get("/status", auth, requireRole("superadmin"), async (req, res) => {
  try {
    res.json(getWhatsAppGatewayStatus());
  } catch (error) {
    console.error("whatsapp gateway status error", error);
    res.status(500).json({ error: "Unable to read WhatsApp gateway status." });
  }
});

router.post("/start", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const state = await startEmbeddedWhatsAppGateway({ force: true });
    res.json(state);
  } catch (error) {
    console.error("whatsapp gateway start error", error);
    res.status(500).json({
      error: error?.message || "Unable to start the embedded WhatsApp gateway.",
    });
  }
});

module.exports = router;
