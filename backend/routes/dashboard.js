const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
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

function getResolvedActivationStatus(activation) {
  if (!activation) return "INACTIVE";
  const status = (activation.status || "ACTIVE").toString().toUpperCase();
  if (status !== "ACTIVE") return status;
  if (!activation.expiresAt) return status;

  const expiresAt = new Date(activation.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) return status;
  return expiresAt <= Date.now() ? "EXPIRED" : "ACTIVE";
}

function getActivationKind(activation) {
  return (activation?.activationKind || "PAID").toString().trim().toUpperCase();
}

function buildActivationDevices(devices, activations, resellers) {
  const deviceMap = new Map(devices.map((device) => [Number(device.id), device]));
  const resellerMap = new Map(
    resellers.map((reseller) => [Number(reseller.id), reseller]),
  );
  const grouped = new Map();

  for (const activation of activations) {
    const deviceId = Number(activation.deviceId);
    const device = deviceMap.get(deviceId);
    if (!device) continue;

    const ownerResellerId = Number(device.ownerResellerId || 0);
    const ownerReseller = resellerMap.get(ownerResellerId) || null;
    const activationStatus = getResolvedActivationStatus(activation);
    const normalizedActivation = {
      id: activation.id,
      appName: activation.appName || "Unnamed App",
      applicationId: activation.applicationId ?? null,
      activationKind: getActivationKind(activation),
      status: activationStatus,
      activatedAt: activation.activatedAt || null,
      expiresAt: activation.expiresAt || null,
      trialStartedAt: activation.trialStartedAt || null,
      trialEndsAt: activation.trialEndsAt || null,
      trialConsumedAt: activation.trialConsumedAt || null,
    };

    if (!grouped.has(deviceId)) {
      grouped.set(deviceId, {
        deviceId,
        mac: device.mac,
        deviceKey: device.deviceKey || null,
        deviceStatus: (device.status || "ACTIVE").toString().toUpperCase(),
        platform: device.platform || null,
        deviceName: device.deviceName || null,
        domainUrl: device.domainUrl || null,
        identitySource: device.identitySource || null,
        createdAt: device.createdAt || null,
        ownerResellerId: ownerResellerId || null,
        ownerResellerName:
          ownerReseller?.fullName || ownerReseller?.name || ownerReseller?.username || null,
        latestActivationAt: activation.activatedAt || null,
        accessState: "INACTIVE",
        activations: [],
      });
    }

    const entry = grouped.get(deviceId);
    entry.activations.push(normalizedActivation);

    const latestCurrent = new Date(entry.latestActivationAt || 0).getTime();
    const latestNext = new Date(activation.activatedAt || 0).getTime();
    if (Number.isNaN(latestCurrent) || latestNext > latestCurrent) {
      entry.latestActivationAt = activation.activatedAt || entry.latestActivationAt;
    }
  }

  return Array.from(grouped.values())
    .map((entry) => {
      entry.activations.sort(
        (left, right) =>
          new Date(right.activatedAt || 0).getTime() -
          new Date(left.activatedAt || 0).getTime(),
      );

      const hasPaidActive = entry.activations.some(
        (activation) =>
          activation.activationKind === "PAID" && activation.status === "ACTIVE",
      );
      const hasTrialActive = entry.activations.some(
        (activation) =>
          activation.activationKind === "TRIAL" && activation.status === "ACTIVE",
      );
      const hasExpired = entry.activations.some(
        (activation) => activation.status === "EXPIRED",
      );

      entry.accessState =
        entry.deviceStatus === "BLOCKED"
          ? "BLOCKED"
          : hasPaidActive
            ? "PAID_ACTIVE"
            : hasTrialActive
              ? "TRIAL_ACTIVE"
              : hasExpired
                ? "EXPIRED"
                : "INACTIVE";

      return entry;
    })
    .sort(
      (left, right) =>
        new Date(right.latestActivationAt || 0).getTime() -
        new Date(left.latestActivationAt || 0).getTime(),
    );
}

async function buildDashboardSummaryForUser(user) {
  const role = (user?.role || "").toString().toLowerCase();
  const myResellerId = Number(user?.resellerId || 0);

  const [resellers, devices, activations, logs] = await Promise.all([
    prisma.reseller.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.device.findMany({
      where: role === "superadmin" ? {} : { ownerResellerId: myResellerId || -1 },
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
      : activations.filter((activation) => deviceIds.has(Number(activation.deviceId)));

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
      ? resellers.filter((reseller) => Number(reseller.parentId || 0) === myResellerId)
          .length
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

  const activationDevices = buildActivationDevices(
    devices,
    visibleActivations,
    resellers,
  );
  const activeDeviceCount = activationDevices.filter((device) =>
    ["PAID_ACTIVE", "TRIAL_ACTIVE"].includes(
      (device?.accessState || "").toString().toUpperCase(),
    ),
  ).length;
  const directSubscriptionCount = visibleActivations.filter(
    (activation) =>
      getActivationKind(activation) === "PAID" &&
      getResolvedActivationStatus(activation) === "ACTIVE",
  ).length;

  return {
    role,
    totalDevices: activeDeviceCount,
    totalResellers: role === "superadmin" ? resellers.length : mySubResellers,
    directSubscriptions: directSubscriptionCount,
    mySubResellers,
    availableBalance,
    incoming30d,
    outgoing30d,
    monthlyRevenue,
    chartData: buckets,
    recentTransactions: visibleLogs,
    activationDevices,
  };
}

router.get(
  "/summary",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const summary = await buildDashboardSummaryForUser(req.user);
      res.json(summary);
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

router.get(
  "/summary/report",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const summary = await buildDashboardSummaryForUser(req.user);
      const generatedAt = new Date();
      const fileDate = generatedAt.toISOString().slice(0, 10);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dashboard-report-${fileDate}.pdf"`,
      );

      const doc = new PDFDocument({ margin: 48, size: "A4" });
      doc.pipe(res);

      const line = (label, value) => {
        doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
        doc.font("Helvetica").text(String(value ?? "-"));
      };

      doc.fontSize(22).font("Helvetica-Bold").text("NOVA Panel Dashboard Report");
      doc.moveDown(0.4);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#555")
        .text(`Generated at: ${generatedAt.toLocaleString()}`)
        .text(`Role scope: ${summary.role}`)
        .fillColor("#000");

      doc.moveDown(1);
      doc.fontSize(14).font("Helvetica-Bold").text("Summary");
      doc.moveDown(0.5);
      doc.fontSize(11);
      line("Total active devices", summary.totalDevices);
      line("Direct subscriptions", summary.directSubscriptions);
      line("Total resellers in scope", summary.totalResellers);
      line("Sub-resellers", summary.mySubResellers);
      line(
        "Available balance",
        summary.role === "superadmin"
          ? "Unlimited"
          : Number(summary.availableBalance || 0).toLocaleString(),
      );
      line("Incoming credits (30d)", Number(summary.incoming30d || 0).toLocaleString());
      line("Outgoing credits (30d)", Number(summary.outgoing30d || 0).toLocaleString());
      line("Revenue/flow sum (30d)", Number(summary.monthlyRevenue || 0).toLocaleString());

      doc.moveDown(1);
      doc.fontSize(14).font("Helvetica-Bold").text("Monthly Trend (Last 6 Months)");
      doc.moveDown(0.4);
      doc.fontSize(10).font("Helvetica");
      for (const bucket of summary.chartData || []) {
        doc.text(
          `${bucket.name}: activations=${Number(bucket.activations || 0)} | revenue=${Number(bucket.revenue || 0).toLocaleString()}`,
        );
      }

      doc.moveDown(1);
      doc.fontSize(14).font("Helvetica-Bold").text("Recent Credit Transactions");
      doc.moveDown(0.4);
      doc.fontSize(9).font("Helvetica");
      const transactions = (summary.recentTransactions || []).slice(0, 25);
      if (transactions.length === 0) {
        doc.text("No recent transactions in scope.");
      } else {
        transactions.forEach((tx) => {
          const row = [
            `#${tx.id}`,
            (tx.type || "-").toString(),
            (tx.status || "-").toString(),
            `amt=${Number(tx.amount || 0).toLocaleString()}`,
            `from=${tx.fromResellerId || "-"}`,
            `to=${tx.toResellerId || "-"}`,
            new Date(tx.createdAt || 0).toLocaleString(),
          ].join(" | ");
          doc.text(row);
        });
      }

      doc.moveDown(1);
      doc.fontSize(14).font("Helvetica-Bold").text("Activation Devices Snapshot");
      doc.moveDown(0.4);
      doc.fontSize(9).font("Helvetica");
      const devices = (summary.activationDevices || []).slice(0, 20);
      if (devices.length === 0) {
        doc.text("No activation devices in scope.");
      } else {
        devices.forEach((device) => {
          const row = [
            `MAC=${device.mac || "-"}`,
            `Key=${device.deviceKey || "-"}`,
            `State=${device.accessState || "INACTIVE"}`,
            `Owner=${device.ownerResellerName || device.ownerResellerId || "-"}`,
            `Apps=${Array.isArray(device.activations) ? device.activations.length : 0}`,
          ].join(" | ");
          doc.text(row);
        });
      }

      doc.end();
    } catch (err) {
      console.error("dashboard report error", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate dashboard report" });
      }
    }
  },
);

module.exports = router;
