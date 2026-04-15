const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth } = require("../middleware/auth");

function clampLimit(value, fallback = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(8, Math.max(1, Math.floor(parsed)));
}

function containsInsensitive(value) {
  return {
    contains: value,
    mode: "insensitive",
  };
}

function buildSearchItems(items = []) {
  return items.filter(Boolean);
}

router.get("/global", auth, async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || "")
      .toString()
      .trim()
      .slice(0, 60);
    const limit = clampLimit(req.query.limit, 4);
    const role = (req.user?.role || "").toString().toLowerCase();
    const resellerId = Number(req.user?.resellerId || 0);

    if (!query) {
      return res.json({ query: "", items: [] });
    }

    const searchValue = containsInsensitive(query);

    const resellerScope =
      role === "superadmin"
        ? {}
        : role === "reseller" && resellerId > 0
          ? { OR: [{ id: resellerId }, { parentId: resellerId }] }
          : { id: -1 };

    const resellerWhere = {
      AND: [
        resellerScope,
        {
          OR: [
            { name: searchValue },
            { code: searchValue },
            { email: searchValue },
          ],
        },
      ],
    };

    const userWhere =
      role === "superadmin"
        ? {
            OR: [{ name: searchValue }, { email: searchValue }],
          }
        : role === "reseller" && resellerId > 0
          ? {
              resellerId,
              OR: [{ name: searchValue }, { email: searchValue }],
            }
          : { id: -1 };

    const deviceWhere =
      role === "superadmin"
        ? {
            OR: [
              { mac: searchValue },
              { deviceKey: searchValue },
              { domainUrl: searchValue },
            ],
          }
        : resellerId > 0
          ? {
              ownerResellerId: resellerId,
              OR: [
                { mac: searchValue },
                { deviceKey: searchValue },
                { domainUrl: searchValue },
              ],
            }
          : { id: -1 };

    const [resellers, users, devices] = await Promise.all([
      prisma.reseller.findMany({
        where: resellerWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.user.findMany({
        where: userWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.device.findMany({
        where: deviceWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    const items = buildSearchItems([
      ...resellers.map((reseller) => ({
        id: `reseller-${reseller.id}`,
        group: "Resellers",
        type: "reseller",
        title:
          reseller.name ||
          reseller.code ||
          reseller.email ||
          `Reseller #${reseller.id}`,
        subtitle: [
          reseller.parentId ? "Sub-reseller" : "Main reseller",
          reseller.code || reseller.email || null,
        ]
          .filter(Boolean)
          .join(" • "),
        path: "/resellers",
        tab: "list",
        search:
          reseller.name ||
          reseller.code ||
          reseller.email ||
          String(reseller.id),
      })),
      ...users.map((account) => ({
        id: `user-${account.id}`,
        group: "Resellers",
        type: "account",
        title: account.name || account.email || `User #${account.id}`,
        subtitle: [
          (account.role || "user")
            .toString()
            .replace(/^./, (letter) => letter.toUpperCase()),
          account.email && account.email !== account.name
            ? account.email
            : null,
        ]
          .filter(Boolean)
          .join(" • "),
        path: "/resellers",
        tab: "list",
        search: account.name || account.email || String(account.id),
      })),
      ...devices.map((device) => ({
        id: `device-${device.id}`,
        group: "Device Management",
        type: "device",
        title: device.mac || device.deviceKey || `Device #${device.id}`,
        subtitle: [
          device.deviceKey ? `Key: ${device.deviceKey}` : null,
          device.status || "ACTIVE",
        ]
          .filter(Boolean)
          .join(" • "),
        path: "/devices",
        tab: "list",
        search: device.mac || device.deviceKey || String(device.id),
      })),
    ]);

    res.json({ query, items });
  } catch (error) {
    console.error("Global search failed", error);
    res.status(500).json({ error: "Failed to search the panel." });
  }
});

module.exports = router;
