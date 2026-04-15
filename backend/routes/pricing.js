const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");
const {
  notifyUsersByRole,
  notifyResellerUsers,
} = require("../services/notifications");
const {
  getPaymentConfig,
  createCheckoutSession,
  verifyCheckoutSession,
} = require("../services/paymentGateway");

const formatCredits = (amount) => Number(amount || 0).toLocaleString();
const formatMoney = (plan) => {
  const symbol = (plan?.currency || "USD") === "EUR" ? "€" : "$";
  return `${symbol}${Number(plan?.price || 0).toFixed(2)}`;
};
const normalizeMac = (value = "") => value.toString().trim().toUpperCase();
const normalizeDeviceKey = (value = "") => value.toString().trim();
const PLAN_TYPES = {
  DIRECT: "DIRECT_ACTIVATION",
  CREDIT: "CREDIT_RECHARGE",
};

function inferPlanType(plan = {}) {
  return Number(plan?.credits || 0) > 0 ? PLAN_TYPES.CREDIT : PLAN_TYPES.DIRECT;
}

function normalizePlanType(value, fallback = PLAN_TYPES.CREDIT) {
  const candidate = (value || "").toString().trim().toUpperCase();

  if (candidate === "DIRECT" || candidate === "DIRECT_ACTIVATION") {
    return PLAN_TYPES.DIRECT;
  }

  if (
    candidate === "CREDIT" ||
    candidate === "CREDIT_RECHARGE" ||
    candidate === "RESELLER_CREDITS"
  ) {
    return PLAN_TYPES.CREDIT;
  }

  return fallback;
}

function normalizePlanDuration(value, fallback = "") {
  const candidate = (value || "").toString().trim().toLowerCase();

  if (["lifetime", "life_time", "life"].includes(candidate)) {
    return "lifetime";
  }

  if (["1_year", "one_year", "one year", "year"].includes(candidate)) {
    return "1_year";
  }

  return fallback;
}

function isPlanActive(plan = {}) {
  return plan?.active !== false && plan?.active !== 0;
}

function resolvePlanDuration(plan = {}, requestedDuration) {
  const explicitDuration = normalizePlanDuration(requestedDuration, "");
  if (explicitDuration) {
    return explicitDuration;
  }

  const storedDuration = normalizePlanDuration(plan?.duration, "");
  if (storedDuration) {
    return storedDuration;
  }

  const haystack = `${plan?.name || ""} ${plan?.features || ""}`.toLowerCase();
  if (haystack.includes("life")) return "lifetime";
  if (haystack.includes("6 month") || haystack.includes("semi"))
    return "6_months";
  if (haystack.includes("3 month") || haystack.includes("quarter"))
    return "3_months";
  if (
    haystack.includes("1 month") ||
    haystack.includes("monthly") ||
    haystack.includes("month")
  ) {
    return "1_month";
  }
  return "1_year";
}

function computeActivationExpiry(duration) {
  if (duration === "lifetime") return null;

  const expiresAt = new Date();
  if (duration === "6_months") {
    expiresAt.setMonth(expiresAt.getMonth() + 6);
  } else if (duration === "3_months") {
    expiresAt.setMonth(expiresAt.getMonth() + 3);
  } else if (duration === "1_month") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  return expiresAt.toISOString();
}

async function safeNotify(callback) {
  try {
    await callback();
  } catch (error) {
    console.error("pricing notification error", error);
  }
}

async function ensureDefaultDirectPlans() {
  const currentPlans = await prisma.pricingPlan.findMany({
    orderBy: { createdAt: "desc" },
  });

  const directPlans = (Array.isArray(currentPlans) ? currentPlans : []).filter(
    (plan) =>
      normalizePlanType(plan?.planType, inferPlanType(plan)) ===
      PLAN_TYPES.DIRECT,
  );

  const hasOneYear = directPlans.some(
    (plan) => resolvePlanDuration(plan) === "1_year",
  );
  const hasLifetime = directPlans.some(
    (plan) => resolvePlanDuration(plan) === "lifetime",
  );

  const defaultsToCreate = [];
  if (!hasOneYear) {
    defaultsToCreate.push({
      name: "One Year Activation",
      price: 19.99,
      currency: "USD",
      features:
        "One year activation for normal clients\nInstant device activation\nMAC + key verification",
      credits: 0,
      planType: PLAN_TYPES.DIRECT,
      duration: "1_year",
      active: true,
    });
  }
  if (!hasLifetime) {
    defaultsToCreate.push({
      name: "Lifetime Activation",
      price: 39.99,
      currency: "USD",
      features:
        "Lifetime activation for normal clients\nInstant device activation\nMAC + key verification",
      credits: 0,
      planType: PLAN_TYPES.DIRECT,
      duration: "lifetime",
      active: true,
    });
  }

  for (const defaultPlan of defaultsToCreate) {
    const existingByName = (
      Array.isArray(currentPlans) ? currentPlans : []
    ).some((plan) => (plan?.name || "").toString().trim() === defaultPlan.name);

    if (!existingByName) {
      await prisma.pricingPlan.create({ data: defaultPlan });
    }
  }

  if (defaultsToCreate.length === 0) {
    return currentPlans;
  }

  return prisma.pricingPlan.findMany({
    orderBy: { createdAt: "desc" },
  });
}

async function loadPublicCheckoutContext(planId, selectedApplicationId) {
  const [plan, application] = await Promise.all([
    prisma.pricingPlan.findUnique({ where: { id: Number(planId) } }),
    prisma.application.findUnique({
      where: { id: Number(selectedApplicationId) },
    }),
  ]);

  if (!plan) {
    const error = new Error("Pricing plan not found");
    error.statusCode = 404;
    throw error;
  }

  if (!isPlanActive(plan)) {
    const error = new Error("This plan is not currently available");
    error.statusCode = 400;
    throw error;
  }

  if (
    normalizePlanType(plan?.planType, inferPlanType(plan)) !== PLAN_TYPES.DIRECT
  ) {
    const error = new Error(
      "This plan is reserved for reseller credit purchases and cannot be used on the public activation website",
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    !application ||
    (application.status || "").toString().toUpperCase() !== "ACTIVE"
  ) {
    const error = new Error("Selected application is not available");
    error.statusCode = 404;
    throw error;
  }

  return { plan, application };
}

async function finalizePublicActivation({
  plan,
  application,
  mac,
  deviceKey,
  customerName,
  customerEmail,
  paymentMethod = "CARD",
  paymentReference,
  duration,
  paymentStatus = "CONFIRMED",
  gatewaySessionId = null,
}) {
  const normalizedMac = normalizeMac(mac);
  const normalizedDeviceKey = normalizeDeviceKey(deviceKey);
  const selectedApplicationId = Number(application.id);

  if (!normalizedMac || !normalizedDeviceKey) {
    const error = new Error("mac and deviceKey are required");
    error.statusCode = 400;
    throw error;
  }

  const existingByKey = await prisma.device.findUnique({
    where: { deviceKey: normalizedDeviceKey },
  });
  if (existingByKey && normalizeMac(existingByKey.mac) !== normalizedMac) {
    const error = new Error(
      "That device key is already linked to another MAC address",
    );
    error.statusCode = 409;
    throw error;
  }

  let device = await prisma.device.findUnique({
    where: { mac: normalizedMac },
  });
  if (!device) {
    device = await prisma.device.create({
      data: {
        mac: normalizedMac,
        deviceKey: normalizedDeviceKey,
        ownerResellerId: null,
        status: "ACTIVE",
      },
    });
  } else {
    if (device.ownerResellerId) {
      const error = new Error(
        "This device is already managed from the reseller panel. Use the reseller workflow for this MAC address.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (
      device.deviceKey &&
      normalizeDeviceKey(device.deviceKey) !== normalizedDeviceKey
    ) {
      const error = new Error(
        "This MAC address is already linked to a different device key",
      );
      error.statusCode = 409;
      throw error;
    }

    device = await prisma.device.update({
      where: { id: device.id },
      data: {
        deviceKey: normalizedDeviceKey,
        status: "ACTIVE",
      },
    });
  }

  const resolvedDuration = resolvePlanDuration(plan, duration);
  const expiresAt = computeActivationExpiry(resolvedDuration);
  const activatedAt = new Date().toISOString();

  let existingActivation = null;
  if (typeof prisma.activatedApp.findFirst === "function") {
    existingActivation = await prisma.activatedApp.findFirst({
      where: {
        deviceId: device.id,
        applicationId: selectedApplicationId,
      },
    });
  }

  const activationData = {
    deviceId: device.id,
    applicationId: selectedApplicationId,
    appName: application.name,
    duration: resolvedDuration,
    expiresAt,
    status: "ACTIVE",
    activatedAt,
  };

  const activation =
    existingActivation && typeof prisma.activatedApp.update === "function"
      ? await prisma.activatedApp.update({
          where: { id: existingActivation.id },
          data: activationData,
        })
      : await prisma.activatedApp.create({ data: activationData });

  const transaction = await prisma.creditTransaction.create({
    data: {
      type: "PUBLIC_PLAN_PURCHASE",
      status: paymentStatus,
      amount: Number(plan.price || 0),
      notes: JSON.stringify({
        source: "public_landing_page",
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        mac: normalizedMac,
        deviceKey: normalizedDeviceKey,
        applicationId: selectedApplicationId,
        appName: application.name,
        planId: plan.id,
        planName: plan.name,
        paymentMethod,
        paymentReference,
        gatewaySessionId,
      }),
      processedAt: activatedAt,
    },
  });

  await safeNotify(async () => {
    await notifyUsersByRole("superadmin", {
      type: "CLIENT_PURCHASE",
      title: "New direct client activation",
      message: `${customerName || customerEmail || "A direct client"} activated ${application.name} for ${normalizedMac} using ${plan.name}.`,
      link: "/devices",
    });
  });

  return {
    success: true,
    simulated: paymentStatus !== "PAID",
    paymentStatus,
    paymentMethod,
    paymentReference,
    plan,
    application,
    device,
    activation,
    transaction,
    verifyEndpoint: "/api/devices/verify-activation",
    playlistFeedEndpoint: "/api/playlists/device-feed",
  };
}

router.get("/public/payment-config", async (req, res) => {
  try {
    res.json(getPaymentConfig());
  } catch (err) {
    console.error("payment-config error", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/public", async (req, res) => {
  try {
    const plans = await ensureDefaultDirectPlans();

    res.json(
      (Array.isArray(plans) ? plans : []).filter(
        (plan) =>
          isPlanActive(plan) &&
          normalizePlanType(plan?.planType, inferPlanType(plan)) ===
            PLAN_TYPES.DIRECT,
      ),
    );
  } catch (err) {
    console.error("public pricing list error", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/public/:id/checkout", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      applicationId,
      customerName,
      customerEmail,
      mac,
      deviceKey,
      duration,
    } = req.body || {};

    if (!mac || !deviceKey) {
      return res.status(400).json({ error: "mac and deviceKey are required" });
    }
    if (!applicationId || Number.isNaN(Number(applicationId))) {
      return res.status(400).json({ error: "applicationId is required" });
    }

    const { plan, application } = await loadPublicCheckoutContext(
      id,
      applicationId,
    );

    const checkout = await createCheckoutSession(req, {
      amount: Math.round(Number(plan.price || 0) * 100),
      currency: (plan.currency || "USD").toString(),
      description: `${plan.name} • ${application.name}`,
      customerEmail: customerEmail || undefined,
      metadata: {
        planId: plan.id,
        applicationId: application.id,
        customerName: customerName || "",
        customerEmail: customerEmail || "",
        mac,
        deviceKey,
        duration: duration || "",
      },
    });

    if (checkout.mode === "redirect" && checkout.checkoutUrl) {
      return res.json({
        success: true,
        mode: "redirect",
        provider: checkout.provider,
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
      });
    }

    const activated = await finalizePublicActivation({
      plan,
      application,
      mac,
      deviceKey,
      customerName,
      customerEmail,
      paymentMethod: "SIMULATED",
      paymentReference: `PUBLIC-${Date.now().toString().slice(-6)}`,
      duration,
      paymentStatus: "CONFIRMED",
    });

    return res.json({
      ...activated,
      mode: "simulation",
      provider: checkout.provider,
      gatewayConfigured: false,
    });
  } catch (err) {
    console.error("public checkout error", err);
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500 && process.env.NODE_ENV !== "production") {
      return res.status(statusCode).json({
        error: err.message || "Server error",
        stack: err.stack,
      });
    }
    res.status(statusCode).json({ error: err.message || "Server error" });
  }
});

router.post("/public/confirm-checkout", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const verification = await verifyCheckoutSession(sessionId);
    if (!verification.paid) {
      return res.status(400).json({
        error: "The payment has not been completed yet",
        paymentStatus: verification.paymentStatus,
      });
    }

    const metadata = verification.metadata || {};
    const { plan, application } = await loadPublicCheckoutContext(
      metadata.planId,
      metadata.applicationId,
    );

    const activated = await finalizePublicActivation({
      plan,
      application,
      mac: metadata.mac,
      deviceKey: metadata.deviceKey,
      customerName: metadata.customerName || null,
      customerEmail:
        verification.customerEmail || metadata.customerEmail || null,
      paymentMethod: verification.provider.toUpperCase(),
      paymentReference: verification.sessionId,
      duration: metadata.duration || undefined,
      paymentStatus: "PAID",
      gatewaySessionId: verification.sessionId,
    });

    return res.json({
      ...activated,
      mode: "gateway",
      provider: verification.provider,
    });
  } catch (err) {
    console.error("confirm public checkout error", err);
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500 && process.env.NODE_ENV !== "production") {
      return res.status(statusCode).json({
        error: err.message || "Server error",
        stack: err.stack,
      });
    }
    res.status(statusCode).json({ error: err.message || "Server error" });
  }
});

router.post("/public/:id/activate", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      mac,
      deviceKey,
      applicationId,
      customerName,
      customerEmail,
      paymentMethod = "CARD",
      paymentReference = `PUBLIC-${Date.now().toString().slice(-6)}`,
      duration,
    } = req.body || {};

    const { plan, application } = await loadPublicCheckoutContext(
      id,
      applicationId,
    );

    const activated = await finalizePublicActivation({
      plan,
      application,
      mac,
      deviceKey,
      customerName,
      customerEmail,
      paymentMethod,
      paymentReference,
      duration,
      paymentStatus: "CONFIRMED",
    });

    res.json(activated);
  } catch (err) {
    console.error("public pricing activation error", err);
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500 && process.env.NODE_ENV !== "production") {
      return res.status(statusCode).json({
        error: err.message || "Server error",
        stack: err.stack,
      });
    }
    res.status(statusCode).json({ error: err.message || "Server error" });
  }
});

// List pricing plans
router.get(
  "/",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const requestedType = (req.query?.type || "").toString();
      const normalizedRequestedType = requestedType
        ? normalizePlanType(requestedType, "")
        : "";

      const plans = await ensureDefaultDirectPlans();

      const filteredPlans = (Array.isArray(plans) ? plans : []).filter(
        (plan) => {
          const currentType = normalizePlanType(
            plan?.planType,
            inferPlanType(plan),
          );
          if (!normalizedRequestedType) return true;
          return currentType === normalizedRequestedType;
        },
      );

      if ((req.user?.role || "").toString().toLowerCase() === "superadmin") {
        return res.json(filteredPlans);
      }

      res.json(
        filteredPlans.filter(
          (plan) =>
            isPlanActive(plan) &&
            normalizePlanType(plan?.planType, inferPlanType(plan)) ===
              PLAN_TYPES.CREDIT,
        ),
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const {
      name,
      price,
      credits,
      currency,
      features,
      active,
      planType,
      duration,
    } = req.body || {};
    const normalizedPlanType = normalizePlanType(
      planType,
      Number(credits || 0) > 0 ? PLAN_TYPES.CREDIT : PLAN_TYPES.DIRECT,
    );
    const created = await prisma.pricingPlan.create({
      data: {
        name,
        price: Number(price || 0),
        credits:
          normalizedPlanType === PLAN_TYPES.CREDIT ? Number(credits || 0) : 0,
        currency,
        features,
        planType: normalizedPlanType,
        duration:
          normalizedPlanType === PLAN_TYPES.DIRECT
            ? normalizePlanDuration(
                duration,
                resolvePlanDuration({ name, features }, duration),
              )
            : null,
        active: active === undefined ? true : Boolean(active),
      },
    });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Pricing plan not found" });
    }

    const {
      name,
      price,
      credits,
      currency,
      features,
      active,
      planType,
      duration,
    } = req.body || {};

    const nextPlanType =
      planType !== undefined
        ? normalizePlanType(
            planType,
            normalizePlanType(existing.planType, inferPlanType(existing)),
          )
        : normalizePlanType(existing.planType, inferPlanType(existing));

    const data = {
      ...(name !== undefined ? { name } : {}),
      ...(price !== undefined ? { price: Number(price || 0) } : {}),
      ...(credits !== undefined || nextPlanType === PLAN_TYPES.DIRECT
        ? {
            credits:
              nextPlanType === PLAN_TYPES.CREDIT ? Number(credits || 0) : 0,
          }
        : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(features !== undefined ? { features } : {}),
      ...(planType !== undefined ? { planType: nextPlanType } : {}),
      ...(duration !== undefined || nextPlanType === PLAN_TYPES.DIRECT
        ? {
            duration:
              nextPlanType === PLAN_TYPES.DIRECT
                ? normalizePlanDuration(
                    duration !== undefined ? duration : existing.duration,
                    resolvePlanDuration(existing, duration),
                  )
                : null,
          }
        : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    };
    const updated = await prisma.pricingPlan.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/:id/purchase",
  auth,
  requireRole("reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const resellerId = Number(req.user?.resellerId || 0);
      const paymentMethod = (req.body?.paymentMethod || "CARD").toString();
      const paymentReference = (
        req.body?.paymentReference || `DEV-${Date.now().toString().slice(-6)}`
      ).toString();
      const payerName = (
        req.body?.payerName ||
        req.user?.name ||
        req.user?.email ||
        "Development tester"
      ).toString();
      const payerEmail = (
        req.body?.payerEmail ||
        req.user?.email ||
        "dev@example.com"
      ).toString();

      if (!resellerId) {
        return res.status(400).json({ error: "No reseller account linked" });
      }

      const [plan, reseller] = await Promise.all([
        prisma.pricingPlan.findUnique({ where: { id } }),
        prisma.reseller.findUnique({ where: { id: resellerId } }),
      ]);

      if (!plan) {
        return res.status(404).json({ error: "Pricing plan not found" });
      }
      if (
        normalizePlanType(plan?.planType, inferPlanType(plan)) !==
        PLAN_TYPES.CREDIT
      ) {
        return res.status(400).json({
          error:
            "This plan is reserved for direct client activation and cannot be purchased as reseller credits",
        });
      }
      if (!isPlanActive(plan)) {
        return res
          .status(400)
          .json({ error: "This recharge plan is not active" });
      }
      if (!reseller) {
        return res.status(404).json({ error: "Reseller not found" });
      }

      const creditsToAdd = Number(plan.credits || 0);
      if (!creditsToAdd || creditsToAdd <= 0) {
        return res
          .status(400)
          .json({ error: "This plan does not include any credits" });
      }

      const purchaseNote = `Simulated payment confirmed via ${paymentMethod} • Ref ${paymentReference} • Payer ${payerName} (${payerEmail}) • ${plan.name} • ${creditsToAdd} credits • ${formatMoney(plan)}`;
      const supportsTx = typeof prisma.$transaction === "function";

      let transaction;
      let updatedBalance = Number(reseller.credits || 0);

      if (supportsTx) {
        const result = await prisma.$transaction(async (tx) => {
          const before = await tx.reseller.findUnique({
            where: { id: resellerId },
          });
          const after = await tx.reseller.update({
            where: { id: resellerId },
            data: { credits: { increment: creditsToAdd } },
          });

          const createdTx = await tx.creditTransaction.create({
            data: {
              type: "PLAN_PURCHASE",
              status: "COMPLETED",
              amount: creditsToAdd,
              toResellerId: resellerId,
              performedById: req.user.id,
              notes: purchaseNote,
              toBeforeBalance: Number(before?.credits || 0),
              toAfterBalance: Number(after?.credits || 0),
              processedAt: new Date().toISOString(),
            },
          });

          return { createdTx, updatedBalance: Number(after?.credits || 0) };
        });

        transaction = result.createdTx;
        updatedBalance = result.updatedBalance;
      } else {
        const before = await prisma.reseller.findUnique({
          where: { id: resellerId },
        });
        await prisma.reseller.update({
          where: { id: resellerId },
          data: { credits: { increment: creditsToAdd } },
        });
        const after = await prisma.reseller.findUnique({
          where: { id: resellerId },
        });
        transaction = await prisma.creditTransaction.create({
          data: {
            type: "PLAN_PURCHASE",
            status: "COMPLETED",
            amount: creditsToAdd,
            toResellerId: resellerId,
            performedById: req.user.id,
            notes: purchaseNote,
            toBeforeBalance: Number(before?.credits || 0),
            toAfterBalance: Number(after?.credits || 0),
            processedAt: new Date().toISOString(),
          },
        });
        updatedBalance = Number(after?.credits || 0);
      }

      await safeNotify(async () => {
        await notifyResellerUsers(resellerId, {
          type: "PURCHASE_COMPLETED",
          title: "Recharge completed",
          message: `${formatCredits(creditsToAdd)} credits were added to your account after simulated ${paymentMethod.toLowerCase()} payment confirmation for ${plan.name}.`,
          link: "/credits",
        });

        await notifyUsersByRole("superadmin", {
          type: "PURCHASE_COMPLETED",
          title: "New reseller purchase",
          message: `${reseller.name || `Reseller #${reseller.id}`} purchased ${formatCredits(creditsToAdd)} credits via ${plan.name} (${formatMoney(plan)}) using simulated ${paymentMethod.toLowerCase()} checkout.`,
          link: "/credits",
        });
      });

      res.json({
        success: true,
        simulated: true,
        paymentStatus: "CONFIRMED",
        paymentMethod,
        paymentReference,
        payerName,
        payerEmail,
        plan,
        creditsAdded: creditsToAdd,
        balance: updatedBalance,
        transaction,
      });
    } catch (err) {
      console.error("pricing purchase error", err);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: err.message || "Server error",
          stack: err.stack,
        });
      }
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.delete("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.pricingPlan.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
