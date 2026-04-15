const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth } = require("../middleware/auth");
const {
  publishNotificationEvent,
  registerNotificationClient,
} = require("../services/notification-stream");

function normalizeReadFilter(value) {
  const normalized = (value || "all").toString().trim().toLowerCase();
  if (["read", "true", "1"].includes(normalized)) return true;
  if (["unread", "false", "0"].includes(normalized)) return false;
  return null;
}

router.get("/stream", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("retry: 10000\n\n");

  const cleanup = registerNotificationClient(Number(req.user.id), res);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keep-alive\n\n");
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

router.get("/", auth, async (req, res) => {
  try {
    if (!prisma.notification) {
      return res.json({
        items: [],
        unreadCount: 0,
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    }

    const userId = Number(req.user.id);
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(req.query.pageSize || req.query.take || 10), 1),
      100,
    );
    const readFilter = normalizeReadFilter(req.query.read);
    const search = (req.query.search || "").toString().trim();

    const where = { userId };
    if (readFilter !== null) {
      where.read = readFilter;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
        { type: { contains: search, mode: "insensitive" } },
        { link: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, allMatching, unreadItems] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.findMany({ where }),
      prisma.notification.findMany({
        where: { userId, read: false },
      }),
    ]);

    const total = Array.isArray(allMatching) ? allMatching.length : 0;
    const unreadCount = Array.isArray(unreadItems) ? unreadItems.length : 0;

    res.json({
      items,
      unreadCount,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    console.error("notifications list error", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/read-all", auth, async (req, res) => {
  try {
    if (!prisma.notification) {
      return res.json({ success: true, count: 0 });
    }

    const result = await prisma.notification.updateMany({
      where: { userId: Number(req.user.id), read: false },
      data: { read: true, readAt: new Date() },
    });

    publishNotificationEvent(Number(req.user.id), "notification-sync", {
      type: "notification-sync",
      unreadCount: 0,
    });

    res.json({ success: true, count: Number(result?.count || 0) });
  } catch (err) {
    console.error("notifications read-all error", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/read", auth, async (req, res) => {
  try {
    if (!prisma.notification) {
      return res.status(404).json({ error: "Notifications not available" });
    }

    const id = Number(req.params.id);
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ error: "Notification not found" });
    if (Number(existing.userId) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    publishNotificationEvent(Number(req.user.id), "notification-sync", {
      type: "notification-sync",
      notificationId: id,
    });

    res.json(updated);
  } catch (err) {
    console.error("notifications read error", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
