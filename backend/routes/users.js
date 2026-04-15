const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const { requireRole } = require("../middleware/auth");
const { logSecurityEvent } = require("../lib/security-monitor");

function normalizePhoneNumber(value) {
  const input = (value || "").toString().trim();
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return input.startsWith("+") ? `+${digits}` : digits;
}

router.get("/me", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone || null,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update current user profile
router.patch("/me", auth, async (req, res) => {
  try {
    const { name, email, phone, currentPassword, newPassword } = req.body;
    const data = {};
    const normalizedEmail =
      email !== undefined ? email.toString().trim().toLowerCase() : undefined;
    if (name !== undefined) data.name = name;
    if (normalizedEmail !== undefined) {
      // check if email is already taken by another user
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== req.user.id) {
        return res.status(409).json({ error: "Email already in use" });
      }
      data.email = normalizedEmail;
    }
    if (phone !== undefined) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: "A valid phone number is required" });
      }
      data.phone = normalizedPhone;
    }
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Current password required to change password" });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      data.password = await bcrypt.hash(newPassword, 10);
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    logSecurityEvent("profile_updated", req, {
      userId: updated.id,
      email: updated.email,
      changedPassword: Boolean(data.password),
      changedPhone: Boolean(data.phone),
      changedEmail: Boolean(data.email),
    });

    if (data.phone && updated.resellerId) {
      await prisma.reseller.update({
        where: { id: Number(updated.resellerId) },
        data: { phone: data.phone },
      });
    }

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone || null,
      role: updated.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// List users (superadmin or reseller)
router.get("/", auth, async (req, res) => {
  try {
    const role = (req.user.role || "").toString().toLowerCase();
    if (role === "superadmin") {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          resellerId: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json(users);
    }
    if (role === "reseller") {
      const myResellerId = req.user.resellerId;
      const users = await prisma.user.findMany({
        where: { resellerId: myResellerId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          resellerId: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json(users);
    }
    return res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create user (superadmin or reseller can create users tied to their reseller)
router.post(
  "/",
  auth,
  [
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("name").optional().isString(),
    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required")
      .bail()
      .custom((value) => Boolean(normalizePhoneNumber(value)))
      .withMessage("A valid phone number is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
      const { email, password, name, role, phone } = req.body;
      const normalizedEmail = (email || "").toString().trim().toLowerCase();
      const normalizedPhone = normalizePhoneNumber(phone);
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing)
        return res.status(409).json({ error: "User already exists" });

      const requesterRole = (req.user.role || "").toString().toLowerCase();
      let assignedRole = role || "subreseller";
      let resellerId = null;

      if (requesterRole === "superadmin") {
        // superadmin may assign reseller id via body
        resellerId = req.body.resellerId || null;
        if (
          role &&
          ["superadmin", "reseller", "subreseller"].indexOf(role) === -1
        )
          assignedRole = "subreseller";
      } else if (requesterRole === "reseller") {
        // reseller can only create subaccounts under their reseller
        resellerId = req.user.resellerId || null;
        assignedRole = "subreseller";
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!normalizedPhone) {
        return res.status(400).json({
          error:
            "A valid phone number is required for password recovery and notifications",
        });
      }

      const hashed = await bcrypt.hash(password, 10);
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashed,
          name: name || null,
          phone: normalizedPhone,
          role: assignedRole,
          resellerId,
        },
      });
      logSecurityEvent("user_created", req, {
        userId: created.id,
        email: created.email,
        role: created.role,
        resellerId: created.resellerId,
      });
      res.json({
        id: created.id,
        email: created.email,
        name: created.name,
        phone: created.phone || null,
        role: created.role,
        resellerId: created.resellerId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
