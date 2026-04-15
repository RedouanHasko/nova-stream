const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");

const SUPERADMIN_INCOMING_TYPES = [
  "TOPUP",
  "TRANSFER",
  "CREDIT_REQUEST",
  "PLAN_PURCHASE",
];
const SUPERADMIN_OUTGOING_TYPES = ["REVOKE", "CREDIT_RETURN"];

function getMonthBuckets() {
  const now = new Date();
  const buckets = [];
  const monthMap = new Map();

  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const entry = {
      name: date.toLocaleString("en-US", { month: "short" }),
      activations: 0,
      revenue: 0,
    };
    buckets.push(entry);
    monthMap.set(key, entry);
  }

  return { buckets, monthMap };
}

router.get(
  "/summary",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const role = (req.user.role || "").toString().toLowerCase();
      const myResellerId = Number(req.user.resellerId || 0);

      const [resellers, devices, activations, logs] = await Promise.all([
        prisma.reseller.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.device.findMany({
          where:
            role === "superadmin"
              ? {}
              : { ownerResellerId: myResellerId || -1 },
          orderBy: { createdAt: "desc" },
        }),
        prisma.activatedApp.findMany({ orderBy: { activatedAt: "desc" } }),
        prisma.creditTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);

      const deviceIds = new Set(devices.map((device) => Number(device.id)));
      const visibleActivations =
        role === "superadmin"
          ? activations
          : activations.filter((activation) =>
              deviceIds.has(Number(activation.deviceId)),
            );

      const visibleLogs = logs.filter((log) => {
        if (role === "superadmin") return true;
        if (!myResellerId) return false;
        return (
          Number(log.fromResellerId || 0) === myResellerId ||
          Number(log.toResellerId || 0) === myResellerId
        );
      });

      const mySubResellers =
        role === "reseller"
          ? resellers.filter(
              (reseller) => Number(reseller.parentId || 0) === myResellerId,
            ).length
          : 0;

      const myReseller = resellers.find(
        (reseller) => Number(reseller.id) === myResellerId,
      );

      const availableBalance =
        role === "superadmin" ? -1 : Number(myReseller?.credits || 0);

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let incoming30d = 0;
      let outgoing30d = 0;
      let monthlyRevenue = 0;

      for (const log of visibleLogs) {
        const amount = Number(log.amount || 0);
        const absoluteAmount = Math.abs(amount);
        const when = new Date(log.createdAt || log.activatedAt || 0).getTime();

        if (Number.isNaN(when) || when < cutoff) continue;
        monthlyRevenue += amount;
        if (!absoluteAmount || (log.status && log.status !== "COMPLETED")) {
          continue;
        }

        if (role === "superadmin") {
          if (SUPERADMIN_INCOMING_TYPES.includes(log.type)) {
            incoming30d += absoluteAmount;
          }
          if (SUPERADMIN_OUTGOING_TYPES.includes(log.type)) {
            outgoing30d += absoluteAmount;
          }
          continue;
        }

        if (Number(log.toResellerId || 0) === myResellerId) {
          incoming30d += absoluteAmount;
        }
        if (Number(log.fromResellerId || 0) === myResellerId) {
          outgoing30d += absoluteAmount;
        }
      }

      const { buckets, monthMap } = getMonthBuckets();

      for (const activation of visibleActivations) {
        const when = new Date(activation.activatedAt || 0).getTime();
        if (Number.isNaN(when)) continue;
        const date = new Date(when);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const entry = monthMap.get(key);
        if (entry) entry.activations += 1;
      }

      for (const log of visibleLogs) {
        const when = new Date(log.createdAt || log.activatedAt || 0).getTime();
        if (Number.isNaN(when)) continue;
        const date = new Date(when);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const entry = monthMap.get(key);
        if (entry) entry.revenue += Number(log.amount || 0);
      }

      res.json({
        role,
        totalDevices: devices.length,
        totalResellers:
          role === "superadmin" ? resellers.length : mySubResellers,
        directSubscriptions: visibleActivations.length,
        mySubResellers,
        availableBalance,
        incoming30d,
        outgoing30d,
        monthlyRevenue,
        chartData: buckets,
        recentTransactions: visibleLogs,
      });
    } catch (err) {
      console.error("dashboard summary error", err);
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
