const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");

// List parent change requests
router.get("/", auth, async (req, res) => {
  try {
    const role = (req.user.role || "").toString().toLowerCase();
    const rows = await prisma.parentChangeRequest.findMany({
      orderBy: { createdAt: "desc" },
    });

    const enriched = [];
    for (const r of rows) {
      const reseller = await prisma.reseller.findUnique({
        where: { id: r.resellerId },
      });
      const newParent = await prisma.reseller.findUnique({
        where: { id: r.newParentId },
      });
      enriched.push({ ...r, reseller, newParent });
    }

    if (role === "superadmin") return res.json(enriched);
    if (role === "reseller") {
      const myId = req.user.resellerId;
      if (!myId) return res.status(403).json({ error: "Not a reseller" });
      const filtered = enriched.filter((e) => {
        if (e.reseller && Number(e.reseller.parentId) === Number(myId))
          return true;
        if (e.newParent && Number(e.newParent.id) === Number(myId)) return true;
        return false;
      });
      return res.json(filtered);
    }

    return res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    console.error("parent-change-requests GET error:", err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Create a parent change request (usually called by a sub-reseller)
router.post("/", auth, async (req, res) => {
  try {
    const role = (req.user.role || "").toString().toLowerCase();
    const resellerId = req.user.resellerId;
    if (!resellerId) return res.status(403).json({ error: "Not a reseller" });

    const { newParentId, reason } = req.body;
    if (!newParentId)
      return res.status(400).json({ error: "newParentId required" });

    const created = await prisma.parentChangeRequest.create({
      data: {
        resellerId: Number(resellerId),
        newParentId: Number(newParentId),
        reason: reason || null,
      },
    });
    res.json(created);
  } catch (err) {
    console.error("parent-change-requests POST error:", err);
    if (process.env.NODE_ENV !== "production") {
      return res
        .status(500)
        .json({ error: err.message || "Server error", stack: err.stack });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Approve request
router.post(
  "/:id/approve",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const reqrec = await prisma.parentChangeRequest.findUnique({
        where: { id },
      });
      if (!reqrec) return res.status(404).json({ error: "Not found" });
      if (reqrec.status !== "PENDING")
        return res.status(400).json({ error: "Already processed" });

      const role = (req.user.role || "").toString().toLowerCase();
      if (role === "reseller") {
        const myId = req.user.resellerId;
        if (
          Number(reqrec.newParentId) !== Number(myId) &&
          Number(reqrec.resellerId) !== Number(myId)
        )
          return res.status(403).json({ error: "Forbidden" });
      }

      // update reseller parent
      await prisma.reseller.update({
        where: { id: reqrec.resellerId },
        data: { parentId: reqrec.newParentId },
      });
      const updated = await prisma.parentChangeRequest.update({
        where: { id },
        data: { status: "APPROVED", processedAt: new Date() },
      });
      res.json(updated);
    } catch (err) {
      console.error("parent-change-requests APPROVE error:", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Reject request
router.post(
  "/:id/reject",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const reqrec = await prisma.parentChangeRequest.findUnique({
        where: { id },
      });
      if (!reqrec) return res.status(404).json({ error: "Not found" });
      if (reqrec.status !== "PENDING")
        return res.status(400).json({ error: "Already processed" });

      const role = (req.user.role || "").toString().toLowerCase();
      if (role === "reseller") {
        const myId = req.user.resellerId;
        if (
          Number(reqrec.newParentId) !== Number(myId) &&
          Number(reqrec.resellerId) !== Number(myId)
        )
          return res.status(403).json({ error: "Forbidden" });
      }

      const updated = await prisma.parentChangeRequest.update({
        where: { id },
        data: { status: "REJECTED", processedAt: new Date() },
      });
      res.json(updated);
    } catch (err) {
      console.error("parent-change-requests REJECT error:", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
