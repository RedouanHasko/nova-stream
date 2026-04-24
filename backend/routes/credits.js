const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const { logSecurityEvent } = require("../lib/security-monitor");
const {
  notifyUsersByRole,
  notifyResellerUsers,
} = require("../services/notifications");

const humanizeCreditType = (type) => {
  const labels = {
    RECHARGE_REQUEST: "recharge request",
    CREDIT_REQUEST: "credit request",
    CREDIT_RETURN: "credit return request",
    TRANSFER: "credit transfer",
    TOPUP: "credit top-up",
    PLAN_PURCHASE: "plan purchase",
    REVOKE: "credit revoke",
  };
  return labels[type] || (type || "credit update").toString().toLowerCase();
};

const formatCredits = (amount) => Number(amount || 0).toLocaleString();
const CREDIT_EPSILON = 1e-9;

function parseCreditAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function hasExpectedDelta(before, after, delta) {
  return (
    Math.abs(Number(after) - Number(before) - Number(delta)) <= CREDIT_EPSILON
  );
}

function assertExactCreditTransfer({
  amount,
  fromBefore,
  fromAfter,
  toBefore,
  toAfter,
}) {
  const numericValues = [amount, fromBefore, fromAfter, toBefore, toAfter].map(
    (value) => Number(value),
  );

  if (numericValues.some((value) => !Number.isFinite(value))) {
    throw new Error(
      "Credit balance verification failed because one of the balances is invalid.",
    );
  }

  const [
    numericAmount,
    senderBefore,
    senderAfter,
    receiverBefore,
    receiverAfter,
  ] = numericValues;

  if (senderAfter < -CREDIT_EPSILON || receiverAfter < -CREDIT_EPSILON) {
    throw new Error(
      "Credit balance verification failed because a balance became negative.",
    );
  }

  if (!hasExpectedDelta(senderBefore, senderAfter, -numericAmount)) {
    throw new Error(
      "Credit balance verification failed due to an unexpected sender balance delta.",
    );
  }

  if (!hasExpectedDelta(receiverBefore, receiverAfter, numericAmount)) {
    throw new Error(
      "Credit balance verification failed due to an unexpected receiver balance delta.",
    );
  }

  if (
    !hasExpectedDelta(
      senderBefore + receiverBefore,
      senderAfter + receiverAfter,
      0,
    )
  ) {
    throw new Error(
      "Credit balance verification failed because total credits were not conserved.",
    );
  }
}

function assertMintedCredits({ amount, before, after }) {
  const numericAmount = Number(amount);
  const previous = Number(before);
  const next = Number(after);

  if (![numericAmount, previous, next].every(Number.isFinite)) {
    throw new Error(
      "Credit mint verification failed because one of the balances is invalid.",
    );
  }

  if (
    next < -CREDIT_EPSILON ||
    !hasExpectedDelta(previous, next, numericAmount)
  ) {
    throw new Error(
      "Credit mint verification failed due to an unexpected balance delta.",
    );
  }
}

function assertBurnedCredits({ amount, before, after }) {
  const numericAmount = Number(amount);
  const previous = Number(before);
  const next = Number(after);

  if (![numericAmount, previous, next].every(Number.isFinite)) {
    throw new Error(
      "Credit burn verification failed because one of the balances is invalid.",
    );
  }

  if (
    next < -CREDIT_EPSILON ||
    !hasExpectedDelta(previous, next, -numericAmount)
  ) {
    throw new Error(
      "Credit burn verification failed due to an unexpected balance delta.",
    );
  }
}

function buildCreditsTabLink(tab, requestId) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (requestId) params.set("requestId", String(requestId));
  const suffix = params.toString();
  return suffix ? `/credits?${suffix}` : "/credits";
}

function getRequesterCreditsLink(requestType, requestId) {
  return requestType === "RECHARGE_REQUEST"
    ? buildCreditsTabLink("credit-logs", requestId)
    : buildCreditsTabLink("my-charge", requestId);
}

async function safeNotify(callback) {
  try {
    await callback();
  } catch (error) {
    console.error("credit notification dispatch error", error);
  }
}

/**
 * Extract the real client IP, honouring X-Forwarded-For when the app is
 * behind a reverse proxy.  The value is used only for audit logging — it
 * is never used in any authorization decision.
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || req.ip || null;
}

// Transfer or revoke credits
router.post(
  "/transfer",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const { recipient, amount, action, notes, senderId } = req.body; // recipient: email or code
      const amt = parseCreditAmount(amount);
      if (!recipient || amt === null) {
        return res.status(400).json({
          error:
            "Recipient and a valid whole-number credit amount are required",
        });
      }
      const to = await prisma.reseller.findFirst({
        where: { OR: [{ email: recipient }, { code: recipient }] },
      });
      if (!to)
        return res.status(404).json({ error: "Recipient reseller not found" });

      const role = (req.user.role || "").toString().toLowerCase();
      const actorName = req.user?.name || req.user?.email || "System";
      const ipAddress = getClientIp(req);

      // if requester is a reseller, ensure they can only transfer to their own sub-resellers or themselves
      if (role === "reseller") {
        const myId = req.user.resellerId;
        if (to.id !== myId && to.parentId !== myId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      // Handle revoke
      if (action === "revoke") {
        const fromId =
          role === "reseller" && req.user?.resellerId
            ? Number(req.user.resellerId)
            : null;

        if (fromId && Number(fromId) === Number(to.id)) {
          return res.status(400).json({
            error: "You cannot move credits back to the same reseller account.",
          });
        }

        const result = await prisma.$transaction(async (tx) => {
          const target = await tx.reseller.findUnique({ where: { id: to.id } });
          if (!target) throw new Error("NOT_FOUND");
          if (Number(target.credits) < amt) throw new Error("INSUFFICIENT");

          let fromBefore = null;
          let fromAfter = null;

          if (fromId) {
            fromBefore = await tx.reseller.findUnique({ where: { id: fromId } });
            if (!fromBefore) throw new Error("SENDER_NOT_FOUND");
          }

          const toAfter = await tx.reseller.update({
            where: { id: to.id },
            data: { credits: { decrement: amt } },
          });

          if (fromId) {
            fromAfter = await tx.reseller.update({
              where: { id: fromId },
              data: { credits: { increment: amt } },
            });
          }

          if (fromId) {
            assertExactCreditTransfer({
              amount: amt,
              fromBefore: fromBefore?.credits,
              fromAfter: fromAfter?.credits,
              toBefore: target?.credits,
              toAfter: toAfter?.credits,
            });
          } else {
            assertBurnedCredits({
              amount: amt,
              before: target?.credits,
              after: toAfter?.credits,
            });
          }

          const txrec = await tx.creditTransaction.create({
            data: {
              type: "REVOKE",
              status: "COMPLETED",
              amount: amt,
              fromResellerId: fromId,
              toResellerId: to.id,
              performedById: req.user.id,
              notes,
              ipAddress,
              fromBeforeBalance: fromBefore ? Number(fromBefore.credits) : null,
              fromAfterBalance: fromAfter ? Number(fromAfter.credits) : null,
              toBeforeBalance: Number(target.credits),
              toAfterBalance: Number(toAfter.credits),
            },
          });
          return txrec;
        });

        await safeNotify(async () => {
          await notifyResellerUsers(to.id, {
            type: "CREDITS_REVOKED",
            title: "Credits revoked",
            message: `${formatCredits(amt)} credits were removed from your account by ${actorName}.`,
            link: "/credits",
          });
          if (fromId) {
            await notifyResellerUsers(fromId, {
              type: "CREDITS_RETURNED",
              title: "Credits restored",
              message: `${formatCredits(amt)} credits were returned to your account from ${to.name || "your sub-reseller"}.`,
              link: "/credits",
            });
          }
        });
        logSecurityEvent("credit_revoke", req, {
          userId: req.user?.id,
          email: req.user?.email,
          amount: amt,
          targetResellerId: to.id,
          transactionId: result?.id,
        });
        return res.json(result);
      }

      // Transfer / Topup flows
      if (role === "reseller") {
        const fromId = Number(req.user.resellerId || 0);
        if (!fromId || Number(fromId) === Number(to.id)) {
          return res.status(400).json({
            error: "Credits can only be sent to a different sub-reseller account.",
          });
        }

        const result = await prisma.$transaction(async (tx) => {
          const fromBefore = await tx.reseller.findUnique({ where: { id: fromId } });
          const toBefore = await tx.reseller.findUnique({ where: { id: to.id } });
          if (!fromBefore) throw new Error("SENDER_NOT_FOUND");
          if (!toBefore) throw new Error("RECIPIENT_NOT_FOUND");
          if (Number(fromBefore.credits) < amt) throw new Error("INSUFFICIENT");

          const fromAfter = await tx.reseller.update({
            where: { id: fromId },
            data: { credits: { decrement: amt } },
          });
          const toAfter = await tx.reseller.update({
            where: { id: to.id },
            data: { credits: { increment: amt } },
          });

          assertExactCreditTransfer({
            amount: amt,
            fromBefore: fromBefore?.credits,
            fromAfter: fromAfter?.credits,
            toBefore: toBefore?.credits,
            toAfter: toAfter?.credits,
          });

          const txrec = await tx.creditTransaction.create({
            data: {
              type: "TRANSFER",
              status: "COMPLETED",
              amount: amt,
              fromResellerId: fromId,
              toResellerId: to.id,
              performedById: req.user.id,
              notes,
              ipAddress,
              fromBeforeBalance: Number(fromBefore.credits),
              fromAfterBalance: Number(fromAfter.credits),
              toBeforeBalance: Number(toBefore.credits),
              toAfterBalance: Number(toAfter.credits),
            },
          });
          return txrec;
        });

        await safeNotify(() =>
          notifyResellerUsers(to.id, {
            type: "CREDITS_RECEIVED",
            title: "Credits received",
            message: `You received ${formatCredits(amt)} credits from ${actorName}.`,
            link: "/credits",
          }),
        );
        logSecurityEvent("credit_transfer", req, {
          userId: req.user?.id,
          email: req.user?.email,
          amount: amt,
          toResellerId: to.id,
          transactionId: result?.id,
        });
        return res.json(result);
      }

      if (role === "superadmin") {
        if (senderId) {
          const fromId = Number(senderId);
          if (!fromId || Number(fromId) === Number(to.id)) {
            return res.status(400).json({
              error: "Admin credit moves must target a different reseller account.",
            });
          }

          const result = await prisma.$transaction(async (tx) => {
            const fromBefore = await tx.reseller.findUnique({ where: { id: fromId } });
            const toBefore = await tx.reseller.findUnique({ where: { id: to.id } });
            if (!fromBefore) throw new Error("SENDER_NOT_FOUND");
            if (!toBefore) throw new Error("RECIPIENT_NOT_FOUND");
            if (Number(fromBefore.credits) < amt) throw new Error("INSUFFICIENT");

            const fromAfter = await tx.reseller.update({
              where: { id: fromId },
              data: { credits: { decrement: amt } },
            });
            const toAfter = await tx.reseller.update({
              where: { id: to.id },
              data: { credits: { increment: amt } },
            });

            assertExactCreditTransfer({
              amount: amt,
              fromBefore: fromBefore?.credits,
              fromAfter: fromAfter?.credits,
              toBefore: toBefore?.credits,
              toAfter: toAfter?.credits,
            });

            const txrec = await tx.creditTransaction.create({
              data: {
                type: "TRANSFER",
                status: "COMPLETED",
                amount: amt,
                fromResellerId: fromId,
                toResellerId: to.id,
                performedById: req.user.id,
                notes,
                ipAddress,
                fromBeforeBalance: Number(fromBefore.credits),
                fromAfterBalance: Number(fromAfter.credits),
                toBeforeBalance: Number(toBefore.credits),
                toAfterBalance: Number(toAfter.credits),
              },
            });
            return txrec;
          });

          await safeNotify(async () => {
            await notifyResellerUsers(to.id, {
              type: "CREDITS_RECEIVED",
              title: "Credits received",
              message: `You received ${formatCredits(amt)} credits via an admin transfer.`,
              link: "/credits",
            });
            await notifyResellerUsers(Number(senderId), {
              type: "CREDITS_SENT",
              title: "Credits transferred out",
              message: `An admin moved ${formatCredits(amt)} credits from your account to ${to.name || `#${to.id}`}.`,
              link: "/credits",
            });
          });
          logSecurityEvent("credit_admin_transfer", req, {
            userId: req.user?.id,
            email: req.user?.email,
            amount: amt,
            fromResellerId: senderId,
            toResellerId: to.id,
            transactionId: result?.id,
          });
          return res.json(result);
        }

        // top-up by admin (minting)
        const result = await prisma.$transaction(async (tx) => {
          const toBefore = await tx.reseller.findUnique({ where: { id: to.id } });
          const toAfter = await tx.reseller.update({
            where: { id: to.id },
            data: { credits: { increment: amt } },
          });

          assertMintedCredits({
            amount: amt,
            before: toBefore?.credits,
            after: toAfter?.credits,
          });

          const txrec = await tx.creditTransaction.create({
            data: {
              type: "TOPUP",
              status: "COMPLETED",
              amount: amt,
              toResellerId: to.id,
              performedById: req.user.id,
              notes,
              ipAddress,
              toBeforeBalance: Number(toBefore.credits),
              toAfterBalance: Number(toAfter.credits),
            },
          });
          return txrec;
        });
        await safeNotify(() =>
          notifyResellerUsers(to.id, {
            type: "CREDITS_ADDED",
            title: "Credits added",
            message: `${formatCredits(amt)} credits were added to your account by ${actorName}.`,
            link: "/credits",
          }),
        );
        logSecurityEvent("credit_topup", req, {
          userId: req.user?.id,
          email: req.user?.email,
          amount: amt,
          toResellerId: to.id,
          transactionId: result?.id,
        });
        return res.json(result);
      }
    } catch (err) {
      console.error(err);

      const message = (err?.message || "").toString();
      if (
        message === "INSUFFICIENT" ||
        message === "Insufficient credits" ||
        message === "Invalid reseller credit operation"
      ) {
        return res.status(400).json({ error: "Insufficient credits" });
      }
      if (message === "SENDER_NOT_FOUND" || message === "RECIPIENT_NOT_FOUND") {
        return res.status(404).json({ error: "Reseller not found" });
      }
      if (
        message.includes("Credit balance verification failed") ||
        message.includes("Credit mint verification failed") ||
        message.includes("Credit burn verification failed")
      ) {
        return res.status(409).json({
          error:
            "Credit verification failed, so the transfer was blocked to protect balance integrity.",
        });
      }

      res.status(500).json({ error: "Server error" });
    }
  },
);

// List transactions (superadmin sees all; reseller/subreseller see scoped logs)
router.get(
  "/logs",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const role = (req.user.role || "").toString().toLowerCase();
      const search = (req.query.search || "").toString().trim();
      const typeFilter = (req.query.type || "").toString().trim().toUpperCase();
      const statusFilter = (req.query.status || "")
        .toString()
        .trim()
        .toUpperCase();
      const page = Math.max(Number(req.query.page || 1), 1);
      const requestedPageSize = Number(req.query.pageSize || 0);
      const pageSize = Math.min(Math.max(requestedPageSize || 10, 1), 100);

      let where = {};
      if (role === "reseller" || role === "subreseller") {
        const id = Number(req.user.resellerId);
        where = { OR: [{ fromResellerId: id }, { toResellerId: id }] };
      }

      if (typeFilter && typeFilter !== "ALL") {
        where.type = typeFilter;
      }

      if (statusFilter && statusFilter !== "ALL") {
        where.status = statusFilter;
      }

      if (search) {
        const numericSearch = Number(search);
        const isNumeric = !Number.isNaN(numericSearch);
        const searchWhere = {
          OR: [
            { notes: { contains: search, mode: "insensitive" } },
            { type: { contains: search, mode: "insensitive" } },
            { status: { contains: search, mode: "insensitive" } },
          ],
        };

        if (isNumeric) {
          searchWhere.OR.push({ id: numericSearch });
          searchWhere.OR.push({ fromResellerId: numericSearch });
          searchWhere.OR.push({ toResellerId: numericSearch });
        }

        where = Object.keys(where).length
          ? { AND: [where, searchWhere] }
          : searchWhere;
      }

      const hasQueryPagination = Boolean(req.query.page || req.query.pageSize);
      const hasFilters = Boolean(search || typeFilter || statusFilter);

      const [pageItems, allMatching] = await Promise.all([
        prisma.creditTransaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...(hasQueryPagination || hasFilters
            ? { skip: (page - 1) * pageSize, take: pageSize }
            : { take: 300 }),
        }),
        // Count efficiently — use prisma.creditTransaction.count when available,
        // otherwise fall back to fetching all matching rows just for the length.
        typeof prisma.creditTransaction.count === "function"
          ? prisma.creditTransaction.count({ where })
          : prisma.creditTransaction.findMany({ where }),
      ]);

      const total = typeof allMatching === "number" ? allMatching : Array.isArray(allMatching) ? allMatching.length : 0;

      const resellerIds = [
        ...new Set(
          pageItems
            .flatMap((log) => [log.fromResellerId, log.toResellerId])
            .map((id) => Number(id || 0))
            .filter(Boolean),
        ),
      ];
      const userIds = [
        ...new Set(
          pageItems
            .map((log) => Number(log.performedById || 0))
            .filter(Boolean),
        ),
      ];

      const [resellers, users] = await Promise.all([
        resellerIds.length > 0
          ? prisma.reseller.findMany({ orderBy: { createdAt: "desc" } })
          : Promise.resolve([]),
        userIds.length > 0
          ? prisma.user.findMany({
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                resellerId: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const resellerMap = new Map(
        (resellers || []).map((reseller) => [Number(reseller.id), reseller]),
      );
      const userMap = new Map(
        (users || []).map((user) => [Number(user.id), user]),
      );

      const enriched = pageItems.map((log) => ({
        ...log,
        fromReseller: resellerMap.get(Number(log.fromResellerId || 0)) || null,
        toReseller: resellerMap.get(Number(log.toResellerId || 0)) || null,
        performedBy: userMap.get(Number(log.performedById || 0)) || null,
      }));

      if (
        !req.query.page &&
        !req.query.pageSize &&
        !search &&
        !typeFilter &&
        !statusFilter
      ) {
        return res.json(enriched);
      }

      res.json({
        items: enriched,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      });
    } catch (err) {
      console.error("credits logs error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.get(
  "/summary",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);
      const [resellers, logs] = await Promise.all([
        prisma.reseller.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.creditTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      ]);

      const availableBalance =
        role === "superadmin"
          ? -1
          : Number(
              resellers.find((reseller) => Number(reseller.id) === myResellerId)
                ?.credits || 0,
            );

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentLogs = logs.filter((log) => {
        const when = new Date(log.createdAt || 0).getTime();
        if (Number.isNaN(when) || when < cutoff) return false;
        if (role === "superadmin") return true;
        return (
          Number(log.fromResellerId || 0) === myResellerId ||
          Number(log.toResellerId || 0) === myResellerId
        );
      });

      let incoming30d = 0;
      let outgoing30d = 0;

      for (const log of recentLogs) {
        const amount = Math.abs(Number(log.amount || 0));
        if (!amount || (log.status && log.status !== "COMPLETED")) continue;

        if (role === "superadmin") {
          if (
            ["TOPUP", "TRANSFER", "CREDIT_REQUEST", "PLAN_PURCHASE"].includes(
              log.type,
            )
          ) {
            incoming30d += amount;
          }
          if (["REVOKE", "CREDIT_RETURN"].includes(log.type)) {
            outgoing30d += amount;
          }
          continue;
        }

        if (Number(log.toResellerId || 0) === myResellerId)
          incoming30d += amount;
        if (Number(log.fromResellerId || 0) === myResellerId)
          outgoing30d += amount;
      }

      res.json({
        role,
        availableBalance,
        incoming30d,
        outgoing30d,
      });
    } catch (err) {
      console.error("credits summary error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.get(
  "/requests",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);
      const [logs, resellers] = await Promise.all([
        prisma.creditTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        prisma.reseller.findMany({ orderBy: { createdAt: "desc" } }),
      ]);

      const resellerMap = new Map(
        resellers.map((reseller) => [Number(reseller.id), reseller]),
      );
      const requestTypes = ["CREDIT_REQUEST", "CREDIT_RETURN"];

      let items = logs.filter((log) => requestTypes.includes(log.type));
      if (role !== "superadmin") {
        items = items.filter(
          (log) =>
            Number(log.fromResellerId || 0) === myResellerId ||
            Number(log.toResellerId || 0) === myResellerId,
        );
      }

      res.json(
        items.map((item) => ({
          ...item,
          fromReseller:
            resellerMap.get(Number(item.fromResellerId || 0)) || null,
          toReseller: resellerMap.get(Number(item.toResellerId || 0)) || null,
        })),
      );
    } catch (err) {
      console.error("credits requests list error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/requests",
  auth,
  requireRole("reseller", "subreseller"),
  async (req, res) => {
    try {
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);
      const amount = parseCreditAmount(req.body?.amount);
      const notes = req.body?.notes || null;
      const requestedType = (req.body?.type || "").toString().toUpperCase();
      const ipAddress = getClientIp(req);

      if (!myResellerId) {
        return res.status(400).json({ error: "No reseller account linked" });
      }
      if (amount === null) {
        return res.status(400).json({
          error: "A valid whole-number credit amount is required",
        });
      }

      const me = await prisma.reseller.findUnique({
        where: { id: myResellerId },
      });
      if (!me) return res.status(404).json({ error: "Reseller not found" });

      if (role === "reseller") {
        return res.status(400).json({
          error:
            "Resellers should recharge through the purchase plans page. Credit requests are only for sub-resellers requesting from their reseller.",
        });
      }

      let data = {
        type: "CREDIT_REQUEST",
        status: "PENDING",
        amount,
        performedById: req.user.id,
        notes,
        fromResellerId: null,
        toResellerId: myResellerId,
      };

      if (role === "subreseller") {
        if (!me.parentId) {
          return res.status(400).json({ error: "No parent reseller found" });
        }
        if (requestedType === "CREDIT_RETURN") {
          if (Number(me.credits || 0) < amount) {
            return res.status(400).json({
              error: "You cannot return more credits than you currently have.",
            });
          }

          data = {
            ...data,
            type: "CREDIT_RETURN",
            fromResellerId: myResellerId,
            toResellerId: Number(me.parentId),
          };
        } else {
          data = {
            ...data,
            type: "CREDIT_REQUEST",
            fromResellerId: Number(me.parentId),
            toResellerId: myResellerId,
          };
        }
      }

      const created = await prisma.creditTransaction.create({
        data: {
          ...data,
          ipAddress,
        },
      });

      await safeNotify(async () => {
        const requestTitle =
          data.type === "RECHARGE_REQUEST"
            ? "Recharge request submitted"
            : data.type === "CREDIT_RETURN"
              ? "Credit return submitted"
              : "Credit request submitted";

        await notifyResellerUsers(myResellerId, {
          type: "REQUEST_SUBMITTED",
          title: requestTitle,
          message: `Your ${humanizeCreditType(data.type)} for ${formatCredits(amount)} credits is pending approval.`,
          link: getRequesterCreditsLink(data.type, created.id),
          data: {
            requestId: created.id,
            requestType: data.type,
            tab: data.type === "RECHARGE_REQUEST" ? "credit-logs" : "my-charge",
          },
        });

        if (role === "reseller" && data.type === "RECHARGE_REQUEST") {
          await notifyUsersByRole("superadmin", {
            type: "REQUEST_PENDING",
            title: "New recharge request",
            message: `${me.name || `Reseller #${me.id}`} requested ${formatCredits(amount)} credits.`,
            link: buildCreditsTabLink("credit-logs", created.id),
            data: {
              requestId: created.id,
              requestType: data.type,
              tab: "credit-logs",
            },
          });
        } else if (role === "reseller" && data.type === "CREDIT_REQUEST") {
          await notifyResellerUsers(Number(me.parentId), {
            type: "REQUEST_PENDING",
            title: "New child reseller request",
            message: `${me.name || `Reseller #${me.id}`} requested ${formatCredits(amount)} credits from you.`,
            link: buildCreditsTabLink("pending-requests", created.id),
            data: {
              requestId: created.id,
              requestType: data.type,
              tab: "pending-requests",
            },
          });
        } else if (requestedType === "CREDIT_RETURN") {
          await notifyResellerUsers(Number(me.parentId), {
            type: "REQUEST_PENDING",
            title: "Credit return request",
            message: `${me.name || `Subreseller #${me.id}`} wants to return ${formatCredits(amount)} credits.`,
            link: buildCreditsTabLink("pending-requests", created.id),
            data: {
              requestId: created.id,
              requestType: data.type,
              tab: "pending-requests",
            },
          });
        } else {
          await notifyResellerUsers(Number(me.parentId), {
            type: "REQUEST_PENDING",
            title: "New credit request",
            message: `${me.name || `Subreseller #${me.id}`} requested ${formatCredits(amount)} credits.`,
            link: buildCreditsTabLink("pending-requests", created.id),
            data: {
              requestId: created.id,
              requestType: data.type,
              tab: "pending-requests",
            },
          });
        }
      });

      logSecurityEvent("credit_request_submitted", req, {
        userId: req.user?.id,
        email: req.user?.email,
        amount,
        requestType: created.type,
        transactionId: created.id,
      });
      res.json(created);
    } catch (err) {
      console.error("credits request create error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/requests/:id/approve",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);
      const ipAddress = getClientIp(req);
      const request = await prisma.creditTransaction.findUnique({
        where: { id },
      });

      if (!request) return res.status(404).json({ error: "Request not found" });
      if (
        !["RECHARGE_REQUEST", "CREDIT_REQUEST", "CREDIT_RETURN"].includes(
          request.type,
        )
      ) {
        return res.status(400).json({ error: "Invalid request type" });
      }
      if (request.status !== "PENDING") {
        return res.status(400).json({ error: "Request already processed" });
      }

      if (
        role === "reseller" &&
        (request.type === "RECHARGE_REQUEST" ||
          (Number(request.fromResellerId || 0) !== myResellerId &&
            Number(request.toResellerId || 0) !== myResellerId))
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const amount = parseCreditAmount(request.amount);
      if (amount === null) {
        return res.status(400).json({ error: "Invalid request amount" });
      }

      if (request.type === "RECHARGE_REQUEST") {
        try {
          const updated = await prisma.$transaction(async (tx) => {
            const currentRequest = await tx.creditTransaction.findUnique({ where: { id } });
            if (!currentRequest) throw new Error("REQUEST_NOT_FOUND");
            if (currentRequest.status !== "PENDING") throw new Error("REQUEST_ALREADY_PROCESSED");

            const target = await tx.reseller.findUnique({
              where: { id: currentRequest.toResellerId },
            });
            if (!target) throw new Error("TARGET_NOT_FOUND");

            const after = await tx.reseller.update({
              where: { id: currentRequest.toResellerId },
              data: { credits: { increment: amount } },
            });

            assertMintedCredits({ amount, before: target?.credits, after: after?.credits });

            return tx.creditTransaction.update({
              where: { id },
              data: {
                status: "COMPLETED",
                processedAt: new Date(),
                toBeforeBalance: Number(target.credits || 0),
                toAfterBalance: Number(after?.credits || 0),
                ipAddress,
              },
            });
          });

          await safeNotify(() =>
            notifyResellerUsers(Number(request.toResellerId), {
              type: "REQUEST_APPROVED",
              title: "Recharge approved",
              message: `Your recharge request for ${formatCredits(amount)} credits was approved.`,
              link: getRequesterCreditsLink(request.type, id),
              data: {
                requestId: id,
                requestType: request.type,
                tab:
                  request.type === "RECHARGE_REQUEST"
                    ? "credit-logs"
                    : "my-charge",
              },
            }),
          );
          return res.json(updated);
        } catch (error) {
          if (error?.message === "REQUEST_NOT_FOUND") {
            return res.status(404).json({ error: "Request not found" });
          }
          if (error?.message === "TARGET_NOT_FOUND") {
            return res.status(404).json({ error: "Target reseller not found" });
          }
          if (error?.message === "REQUEST_ALREADY_PROCESSED") {
            return res.status(400).json({ error: "Request already processed" });
          }
          throw error;
        }
      }

      const approveTransferRequest = async (tx) => {
        const currentRequest = await tx.creditTransaction.findUnique({ where: { id } });
        if (!currentRequest) throw new Error("REQUEST_NOT_FOUND");
        if (currentRequest.status !== "PENDING") throw new Error("REQUEST_ALREADY_PROCESSED");

        const from = await tx.reseller.findUnique({ where: { id: currentRequest.fromResellerId } });
        const to = await tx.reseller.findUnique({ where: { id: currentRequest.toResellerId } });

        if (!from || !to) throw new Error("LINKED_RESELLER_NOT_FOUND");
        if (Number(from.id) === Number(to.id)) throw new Error("SAME_RESELLER_REQUEST");
        if (
          currentRequest.type === "CREDIT_REQUEST" &&
          Number(to.parentId || 0) !== Number(from.id)
        ) throw new Error("REQUEST_HIERARCHY_CHANGED");
        if (
          currentRequest.type === "CREDIT_RETURN" &&
          Number(from.parentId || 0) !== Number(to.id)
        ) throw new Error("REQUEST_HIERARCHY_CHANGED");
        if (Number(from.credits || 0) < amount) throw new Error("INSUFFICIENT_CREDITS");

        const fromAfter = await tx.reseller.update({
          where: { id: from.id },
          data: { credits: { decrement: amount } },
        });
        const toAfter = await tx.reseller.update({
          where: { id: to.id },
          data: { credits: { increment: amount } },
        });

        assertExactCreditTransfer({
          amount,
          fromBefore: from?.credits,
          fromAfter: fromAfter?.credits,
          toBefore: to?.credits,
          toAfter: toAfter?.credits,
        });

        return tx.creditTransaction.update({
          where: { id },
          data: {
            status: "COMPLETED",
            processedAt: new Date(),
            ipAddress,
            fromBeforeBalance: Number(from.credits || 0),
            fromAfterBalance: Number(fromAfter?.credits || 0),
            toBeforeBalance: Number(to.credits || 0),
            toAfterBalance: Number(toAfter?.credits || 0),
          },
        });
      };

      let updated;
      try {
        updated = await prisma.$transaction((tx) => approveTransferRequest(tx));
      } catch (error) {
        if (error?.message === "REQUEST_NOT_FOUND") {
          return res.status(404).json({ error: "Request not found" });
        }
        if (error?.message === "LINKED_RESELLER_NOT_FOUND") {
          return res.status(404).json({ error: "Linked reseller not found" });
        }
        if (error?.message === "SAME_RESELLER_REQUEST") {
          return res.status(400).json({
            error:
              "The request source and destination cannot be the same reseller.",
          });
        }
        if (error?.message === "REQUEST_HIERARCHY_CHANGED") {
          return res.status(400).json({
            error: `This ${humanizeCreditType(request.type)} no longer matches the reseller hierarchy.`,
          });
        }
        if (error?.message === "INSUFFICIENT_CREDITS") {
          return res.status(400).json({ error: "Insufficient credits" });
        }
        if (error?.message === "REQUEST_ALREADY_PROCESSED") {
          return res.status(400).json({ error: "Request already processed" });
        }
        throw error;
      }
      const requesterResellerId =
        request.type === "CREDIT_RETURN"
          ? Number(request.fromResellerId || 0)
          : Number(request.toResellerId || 0);

      await safeNotify(() =>
        notifyResellerUsers(requesterResellerId, {
          type: "REQUEST_APPROVED",
          title: "Request approved",
          message: `Your ${humanizeCreditType(request.type)} for ${formatCredits(amount)} credits was approved.`,
          link: getRequesterCreditsLink(request.type, id),
          data: {
            requestId: id,
            requestType: request.type,
            tab:
              request.type === "RECHARGE_REQUEST" ? "credit-logs" : "my-charge",
          },
        }),
      );

      logSecurityEvent("credit_request_approved", req, {
        userId: req.user?.id,
        email: req.user?.email,
        transactionId: id,
        requestType: request.type,
        amount: request.amount,
      });
      res.json(updated);
    } catch (err) {
      console.error("credits request approve error", err);

      const message = (err?.message || "").toString();
      if (message === "Insufficient credits") {
        return res.status(400).json({ error: message });
      }
      if (
        message.includes("Credit balance verification failed") ||
        message.includes("Credit mint verification failed") ||
        message.includes("Credit burn verification failed")
      ) {
        return res.status(409).json({
          error:
            "Credit verification failed, so the request approval was blocked to protect balance integrity.",
        });
      }

      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/requests/:id/reject",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);
      const request = await prisma.creditTransaction.findUnique({
        where: { id },
      });

      if (!request) return res.status(404).json({ error: "Request not found" });
      if (
        !["RECHARGE_REQUEST", "CREDIT_REQUEST", "CREDIT_RETURN"].includes(
          request.type,
        )
      ) {
        return res.status(400).json({ error: "Invalid request type" });
      }
      if (request.status !== "PENDING") {
        return res.status(400).json({ error: "Request already processed" });
      }
      if (
        role === "reseller" &&
        (request.type === "RECHARGE_REQUEST" ||
          (Number(request.fromResellerId || 0) !== myResellerId &&
            Number(request.toResellerId || 0) !== myResellerId))
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updated = await prisma.creditTransaction.update({
        where: { id },
        data: { status: "REJECTED", processedAt: new Date(), ipAddress: getClientIp(req) },
      });
      const requesterResellerId =
        request.type === "CREDIT_RETURN"
          ? Number(request.fromResellerId || 0)
          : Number(request.toResellerId || 0);
      await safeNotify(() =>
        notifyResellerUsers(requesterResellerId, {
          type: "REQUEST_REJECTED",
          title: "Request rejected",
          message: `Your ${humanizeCreditType(request.type)} for ${formatCredits(request.amount)} credits was rejected.`,
          link: getRequesterCreditsLink(request.type, id),
          data: {
            requestId: id,
            requestType: request.type,
            tab:
              request.type === "RECHARGE_REQUEST" ? "credit-logs" : "my-charge",
          },
        }),
      );
      logSecurityEvent("credit_request_rejected", req, {
        userId: req.user?.id,
        email: req.user?.email,
        transactionId: id,
        requestType: request.type,
        amount: request.amount,
      });
      res.json(updated);
    } catch (err) {
      console.error("credits request reject error", err);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: err.message || "Server error", stack: err.stack });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Fetch a single transaction by id — for the detail modal
router.get(
  "/transactions/:id",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid transaction id" });
      }

      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);

      const tx = await prisma.creditTransaction.findUnique({ where: { id } });
      if (!tx) return res.status(404).json({ error: "Transaction not found" });

      // Scope check — non-admins can only view their own transactions
      if (role !== "superadmin") {
        const involved =
          Number(tx.fromResellerId || 0) === myResellerId ||
          Number(tx.toResellerId || 0) === myResellerId;
        if (!involved) return res.status(403).json({ error: "Forbidden" });
      }

      const [resellers, user] = await Promise.all([
        prisma.reseller.findMany({
          where: {
            id: {
              in: [tx.fromResellerId, tx.toResellerId].filter(Boolean),
            },
          },
        }),
        tx.performedById
          ? prisma.user.findUnique({
              where: { id: tx.performedById },
              select: { id: true, name: true, email: true, role: true, resellerId: true },
            })
          : Promise.resolve(null),
      ]);

      const resellerMap = new Map(resellers.map((r) => [Number(r.id), r]));

      res.json({
        ...tx,
        fromReseller: resellerMap.get(Number(tx.fromResellerId || 0)) || null,
        toReseller: resellerMap.get(Number(tx.toResellerId || 0)) || null,
        performedBy: user,
      });
    } catch (err) {
      console.error("credit transaction detail error", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
