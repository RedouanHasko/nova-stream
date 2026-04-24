const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");

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

function normalizePhoneNumber(value) {
  const input = (value || "").toString().trim();
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return input.startsWith("+") ? `+${digits}` : digits;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || req.ip || null;
}

async function archiveLinkedUsersForReseller(resellerId) {
  if (!resellerId) return;

  const linkedUsers = await prisma.user.findMany({
    where: { resellerId: Number(resellerId) },
  });

  for (const linkedUser of linkedUsers || []) {
    const stamp = `${Date.now()}-${linkedUser.id}`;
    const archivedEmail = `deleted+${stamp}@deleted.local`;
    const archivedPassword = await bcrypt.hash(`deleted-${stamp}`, 10);

    await prisma.user.update({
      where: { id: linkedUser.id },
      data: {
        email: archivedEmail,
        name: linkedUser.name
          ? `[Deleted] ${linkedUser.name}`
          : `Deleted User ${linkedUser.id}`,
        password: archivedPassword,
        role: "deleted",
        resellerId: null,
      },
    });
  }
}

async function findReusableUserByEmail(email) {
  if (!email) return null;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (!existingUser) return null;

  const existingRole = (existingUser.role || "").toString().toLowerCase();
  if (existingRole === "superadmin") return { existingUser, reusable: false };

  if (!existingUser.resellerId) return { existingUser, reusable: true };

  const linkedReseller = await prisma.reseller.findUnique({
    where: { id: Number(existingUser.resellerId) },
  });

  return {
    existingUser,
    reusable: !linkedReseller,
  };
}

// List resellers
router.get("/", auth, async (req, res) => {
  try {
    const role = (req.user.role || "").toString().toLowerCase();
    const search = (req.query.search || "").toString().trim();
    const status = (req.query.status || "").toString().trim().toUpperCase();
    const accountType = (req.query.accountType || "all")
      .toString()
      .trim()
      .toLowerCase();
    const page = Math.max(Number(req.query.page || 1), 1);
    const requestedPageSize = Number(req.query.pageSize || 0);
    const pageSize = Math.min(Math.max(requestedPageSize || 10, 1), 100);

    const where = {};

    if (role === "superadmin") {
      if (accountType === "main") {
        where.parentId = null;
      } else if (accountType === "sub") {
        where.parentId = { not: null };
      }
    } else if (role === "reseller") {
      const myId = req.user.resellerId;
      if (!myId) return res.status(403).json({ error: "Not a reseller" });
      where.parentId = Number(myId);
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const hasQueryPagination = Boolean(req.query.page || req.query.pageSize);
    const hasFilters = Boolean(search || status || accountType !== "all");

    if (!hasQueryPagination && !hasFilters) {
      const items = await prisma.reseller.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return res.json(items);
    }

    const [items, allMatching] = await Promise.all([
      prisma.reseller.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reseller.findMany({ where }),
    ]);

    const total = Array.isArray(allMatching) ? allMatching.length : 0;

    return res.json({
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get reseller full details (users, devices, playlists, children, credit transactions)
router.get("/:id/full", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const role = (req.user.role || "").toString().toLowerCase();

    // If requester is a reseller, allow only their own reseller or immediate children
    if (role === "reseller") {
      const myId = req.user.resellerId;
      if (!myId) return res.status(403).json({ error: "Not a reseller" });
      if (Number(id) !== Number(myId)) {
        const target = await prisma.reseller.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ error: "Not found" });
        if (Number(target.parentId) !== Number(myId))
          return res.status(403).json({ error: "Forbidden" });
      }
    }

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) return res.status(404).json({ error: "Not found" });

    const parent = reseller.parentId
      ? await prisma.reseller.findUnique({ where: { id: reseller.parentId } })
      : null;
    const children = await prisma.reseller.findMany({
      where: { parentId: id },
      orderBy: { createdAt: "desc" },
    });
    const users = await prisma.user.findMany({
      where: { resellerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        resellerId: true,
      },
    });
    const devices = await prisma.device.findMany({
      where: { ownerResellerId: id },
      orderBy: { createdAt: "desc" },
    });
    const playlists = await prisma.playlist.findMany({
      where: { ownerResellerId: id },
      orderBy: { createdAt: "desc" },
    });
    const transactions = await prisma.creditTransaction.findMany({
      where: { OR: [{ fromResellerId: id }, { toResellerId: id }] },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({
      reseller,
      parent,
      children,
      users,
      devices,
      playlists,
      transactions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create reseller
// Superadmin can create top-level or any reseller; reseller role can create sub-resellers under themselves.
router.post(
  "/",
  auth,
  [
    body("code").optional().isString().notEmpty(),
    body("name").isString().notEmpty(),
    body("email").optional({ nullable: true, checkFalsy: true }).isEmail(),
    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required")
      .bail()
      .custom((value) => Boolean(normalizePhoneNumber(value)))
      .withMessage("A valid phone number is required"),
    body("user").optional().isObject(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const role = (req.user.role || "").toString().toLowerCase();
      let { code, name, email, phone, parentId, user: userAccount } = req.body;

      name = (name || "").toString().trim();
      email = email ? email.toString().trim().toLowerCase() : null;
      phone = normalizePhoneNumber(phone);
      code = code ? code.toString().trim() : "";
      if (userAccount) {
        userAccount = {
          ...userAccount,
          email: userAccount.email
            ? userAccount.email.toString().trim().toLowerCase()
            : "",
          phone: normalizePhoneNumber(userAccount.phone || phone),
          name: (userAccount.name || name || "").toString().trim(),
        };
      }

      if (!phone) {
        return res.status(400).json({
          error:
            "A valid phone number is required for reseller password recovery and notifications.",
        });
      }

      if (!userAccount?.email || !userAccount?.password) {
        return res.status(400).json({
          error:
            "Email and password are required to create reseller login access.",
        });
      }

      if (userAccount.password.toString().length < 8) {
        return res.status(400).json({
          error: "Password must be at least 8 characters long.",
        });
      }

      // If the requester is a reseller, force parentId to their resellerId
      if (role === "reseller") {
        if (!req.user.resellerId)
          return res.status(403).json({ error: "Reseller account not linked" });
        parentId = req.user.resellerId;
      }

      // Only allow superadmin to set arbitrary parentId
      if (
        role !== "superadmin" &&
        parentId &&
        Number(parentId) !== Number(req.user.resellerId)
      ) {
        return res.status(403).json({ error: "Cannot set parentId" });
      }

      const isSubReseller = Boolean(parentId);
      const prefix = isSubReseller ? "SUB" : "RES";
      const generatedCode = code || (await generateResellerCode(prefix));

      const created = await prisma.reseller.create({
        data: {
          code: generatedCode,
          name,
          email: email || null,
          phone,
          parentId: parentId || null,
        },
      });

      const match = await findReusableUserByEmail(userAccount.email);
      if (match?.existingUser && !match.reusable) {
        await prisma.reseller.delete({ where: { id: created.id } });
        return res.status(409).json({ error: "User email already exists" });
      }

      const hashed = await bcrypt.hash(userAccount.password, 10);
      const accountRole = isSubReseller ? "subreseller" : "reseller";

      const newUser =
        match?.existingUser && match.reusable
          ? await prisma.user.update({
              where: { id: match.existingUser.id },
              data: {
                email: userAccount.email,
                password: hashed,
                name: userAccount.name || userAccount.email,
                phone: userAccount.phone || phone,
                role: accountRole,
                resellerId: created.id,
              },
            })
          : await prisma.user.create({
              data: {
                email: userAccount.email,
                password: hashed,
                name: userAccount.name || userAccount.email,
                phone: userAccount.phone || phone,
                role: accountRole,
                resellerId: created.id,
              },
            });

      return res.json({
        reseller: created,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          phone: newUser.phone || null,
          role: newUser.role,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Get reseller
router.get("/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) return res.status(404).json({ error: "Not found" });
    res.json(reseller);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update reseller (ADMIN or owner reseller)
router.put("/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;
    const role = (req.user.role || "").toString().toLowerCase();

    if (data.phone !== undefined) {
      const normalizedPhone = normalizePhoneNumber(data.phone);
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: "A valid phone number is required" });
      }
      data.phone = normalizedPhone;
    }

    if (role === "superadmin") {
      if (data.credits !== undefined) {
        const nextCredits = Number(data.credits);
        if (
          !Number.isFinite(nextCredits) ||
          nextCredits < 0 ||
          !Number.isInteger(nextCredits)
        ) {
          return res.status(400).json({
            error: "Credits must be a non-negative whole number",
          });
        }
        data.credits = nextCredits;
      }

      if (data.credits === undefined) {
        const updated = await prisma.reseller.update({ where: { id }, data });
        return res.json(updated);
      }

      const ipAddress = getClientIp(req);
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.reseller.findUnique({ where: { id } });
        if (!current) throw new Error("NOT_FOUND");

        const beforeCredits = Number(current.credits || 0);
        const afterCredits = Number(data.credits);
        const delta = afterCredits - beforeCredits;

        const updatedReseller = await tx.reseller.update({
          where: { id },
          data,
        });

        if (delta !== 0) {
          await tx.creditTransaction.create({
            data: {
              type: delta > 0 ? "TOPUP" : "REVOKE",
              status: "COMPLETED",
              amount: Math.abs(delta),
              fromResellerId: null,
              toResellerId: id,
              performedById: req.user.id,
              notes: `Manual credit adjustment from reseller management (${beforeCredits} -> ${afterCredits})`,
              ipAddress,
              fromBeforeBalance: null,
              fromAfterBalance: null,
              toBeforeBalance: beforeCredits,
              toAfterBalance: afterCredits,
            },
          });
        }

        return updatedReseller;
      });

      return res.json(updated);
    }

    if (role === "reseller") {
      // allow updating only child resellers or self
      const target = await prisma.reseller.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: "Not found" });
      const myId = req.user.resellerId;
      if (
        Number(target.parentId) !== Number(myId) &&
        Number(target.id) !== Number(myId)
      )
        return res.status(403).json({ error: "Forbidden" });
      const allowedFields = ["name", "status", "email", "phone"];
      const patch = {};
      for (const f of allowedFields)
        if (data[f] !== undefined) patch[f] = data[f];
      const updated = await prisma.reseller.update({
        where: { id },
        data: patch,
      });
      return res.json(updated);
    }

    return res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    console.error(err);
    if ((err?.message || "") === "NOT_FOUND") {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Delete reseller (ADMIN or owner reseller)
router.delete("/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = (req.user.role || "").toString().toLowerCase();
    if (role === "superadmin") {
      await archiveLinkedUsersForReseller(id);
      await prisma.reseller.delete({ where: { id } });
      return res.json({ success: true });
    }
    if (role === "reseller") {
      const target = await prisma.reseller.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: "Not found" });
      const myId = req.user.resellerId;
      if (Number(target.parentId) !== Number(myId))
        return res.status(403).json({ error: "Forbidden" });
      await archiveLinkedUsersForReseller(id);
      await prisma.reseller.delete({ where: { id } });
      return res.json({ success: true });
    }
    return res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
