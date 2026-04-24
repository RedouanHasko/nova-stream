const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { buildDeviceProfilePatch, sanitizeDeviceProfile } = require("../lib/device-profile");
const { auth, requireRole } = require("../middleware/auth");
const {
  createPublicActivationGuard,
  logSecurityEvent,
} = require("../lib/security-monitor");

const verifyActivationGuard = createPublicActivationGuard("verify-activation");
const startTrialGuard = createPublicActivationGuard("start-trial");

async function getAppCatalog() {
  try {
    const apps = await prisma.application.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    return apps;
  } catch (e) {
    console.error("Catalog error:", e);
    return [];
  }
}

function normalizeMac(value = "") {
  return value.toString().trim().toUpperCase();
}

function normalizeDeviceKey(value = "") {
  return value.toString().trim();
}

function computeExpiryDate(duration) {
  if ((duration || "").toString().toLowerCase() === "lifetime") {
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return expiresAt.toISOString();
}

function computeTrialExpiryDate(durationDays = 7) {
  const safeDuration = Math.min(Math.max(Number(durationDays) || 7, 1), 30);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + safeDuration);
  return expiresAt.toISOString();
}

function normalizeTrialDurationDays(value, fallback = 7) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 30);
}

function getActivationKind(activation) {
  return (activation?.activationKind || "PAID").toString().trim().toUpperCase();
}

function isTrialActivation(activation) {
  return getActivationKind(activation) === "TRIAL";
}

function getTrialDurationDaysForApplication(application) {
  return normalizeTrialDurationDays(application?.trialDurationDays, 7);
}

async function resolveTargetApplication({ applicationId, appName } = {}) {
  if (
    applicationId !== undefined &&
    applicationId !== null &&
    applicationId !== "" &&
    !Number.isNaN(Number(applicationId))
  ) {
    return prisma.application.findUnique({
      where: { id: Number(applicationId) },
    });
  }

  if (appName) {
    const exactMatch = await prisma.application.findFirst({
      where: { name: appName.toString().trim() },
    });
    if (exactMatch) return exactMatch;

    const activeApps = await prisma.application.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });

    const normalizedName = appName.toString().trim().toLowerCase();
    return (
      activeApps.find(
        (item) => (item?.name || "").toString().trim().toLowerCase() === normalizedName,
      ) || null
    );
  }

  const activeApps = await prisma.application.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  return activeApps.length === 1 ? activeApps[0] : null;
}

function buildTrialState(application, activations = []) {
  const trialActivation = activations.find(isTrialActivation) || null;
  const trialStatus = trialActivation
    ? getResolvedActivationStatus(trialActivation)
    : "NOT_STARTED";
  const trialDurationDays = getTrialDurationDaysForApplication(application);
  const trialEnabled = application ? application.trialEnabled !== false : false;
  const isTrialActive =
    !!trialActivation && trialStatus === "ACTIVE" && isTrialActivation(trialActivation);
  const consumed =
    !!trialActivation ||
    activations.some(
      (activation) =>
        !!activation?.trialConsumedAt ||
        !!activation?.trialStartedAt ||
        isTrialActivation(activation),
    );

  const expiresAt =
    trialActivation?.trialEndsAt || trialActivation?.expiresAt || null;
  const startedAt =
    trialActivation?.trialStartedAt || trialActivation?.activatedAt || null;
  const remainingDays =
    isTrialActive && expiresAt
      ? Math.max(
          0,
          Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        )
      : 0;

  return {
    enabled: trialEnabled,
    durationDays: trialDurationDays,
    consumed,
    available: trialEnabled && !consumed,
    eligible: trialEnabled && !consumed,
    active: isTrialActive,
    status: trialStatus,
    startedAt,
    expiresAt,
    remainingDays,
  };
}

function isExpiredByDate(activation) {
  if (!activation?.expiresAt) return false;
  const expiresAt = new Date(activation.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt <= Date.now();
}

function getResolvedActivationStatus(activation) {
  if (!activation) return "INACTIVE";
  const status = (activation.status || "ACTIVE").toString().toUpperCase();
  if (status === "ACTIVE" && isExpiredByDate(activation)) {
    return "EXPIRED";
  }
  return status;
}

function isActivationActive(activation) {
  if (!activation) return false;
  return getResolvedActivationStatus(activation) === "ACTIVE";
}

function isDeviceBlocked(device) {
  return (device?.status || "").toString().toUpperCase() === "BLOCKED";
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildPlaylistResponse(playlist = {}) {
  const parsedContent = safeJsonParse(playlist.content);
  const metadata =
    parsedContent &&
    typeof parsedContent === "object" &&
    !Array.isArray(parsedContent)
      ? parsedContent
      : {};

  return {
    id: playlist.id,
    name: playlist.name,
    type: (playlist.type || metadata.sourceType || "m3u")
      .toString()
      .toLowerCase(),
    url: playlist.url || metadata.url || null,
    rawContent:
      metadata.rawContent ||
      (!metadata.credentials ? playlist.content || null : null),
    credentials: metadata.credentials || null,
    targetApplicationId: metadata.targetApplicationId ?? null,
    targetAppName: metadata.targetAppName ?? null,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}

function matchesPlaylistTarget(playlist, { applicationId, appName } = {}) {
  const payload = buildPlaylistResponse(playlist);
  const targetApplicationId = payload.targetApplicationId;
  const targetAppName = (payload.targetAppName || "")
    .toString()
    .trim()
    .toLowerCase();

  if (targetApplicationId === null && !targetAppName) {
    return true;
  }

  if (
    applicationId !== undefined &&
    applicationId !== null &&
    applicationId !== "" &&
    targetApplicationId !== null &&
    Number(targetApplicationId) === Number(applicationId)
  ) {
    return true;
  }

  if (appName && targetAppName) {
    return targetAppName === appName.toString().trim().toLowerCase();
  }

  return !applicationId && !appName;
}

async function getAssignedPlaylistsForDevice(deviceId, filters = {}) {
  if (!deviceId || !prisma.devicePlaylist) return [];

  const assignments = await prisma.devicePlaylist.findMany({
    where: { deviceId },
    include: { playlist: true },
    orderBy: { addedAt: "desc" },
  });

  return assignments
    .filter(
      (assignment) =>
        assignment?.playlist &&
        matchesPlaylistTarget(assignment.playlist, filters),
    )
    .map((assignment) => ({
      assignmentId: assignment.id,
      addedAt: assignment.addedAt,
      ...buildPlaylistResponse(assignment.playlist),
    }));
}

async function syncDeviceStatus(deviceId) {
  if (!deviceId) return;

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return;
  if (isDeviceBlocked(device)) return;

  const deviceActivations = await prisma.activatedApp.findMany({
    where: { deviceId },
  });

  if (!Array.isArray(deviceActivations) || deviceActivations.length === 0) {
    if ((device.status || "").toString().toUpperCase() !== "INACTIVE") {
      await prisma.device.update({
        where: { id: deviceId },
        data: { status: "INACTIVE" },
      });
    }
    return;
  }

  const hasActive = deviceActivations.some(isActivationActive);
  const hasExpired = deviceActivations.some(
    (activation) => getResolvedActivationStatus(activation) === "EXPIRED",
  );

  const nextStatus = hasActive ? "ACTIVE" : hasExpired ? "EXPIRED" : "INACTIVE";

  if ((device.status || "").toString().toUpperCase() !== nextStatus) {
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: nextStatus },
    });
  }
}

async function refreshActivationStates(filters = {}) {
  const where = {};

  if (filters.deviceId !== undefined && filters.deviceId !== null) {
    where.deviceId = filters.deviceId;
  }

  if (
    filters.applicationId !== undefined &&
    filters.applicationId !== null &&
    filters.applicationId !== "" &&
    !Number.isNaN(Number(filters.applicationId))
  ) {
    where.applicationId = Number(filters.applicationId);
  }

  if (filters.appName) {
    where.appName = filters.appName;
  }

  const activations = await prisma.activatedApp.findMany({
    where,
    orderBy: { activatedAt: "desc" },
  });

  if (!Array.isArray(activations) || activations.length === 0) {
    if (filters.deviceId) {
      await syncDeviceStatus(filters.deviceId);
    }
    return [];
  }

  const expiredActiveRecords = activations.filter((activation) => {
    const currentStatus = (activation.status || "ACTIVE")
      .toString()
      .toUpperCase();
    return currentStatus === "ACTIVE" && isExpiredByDate(activation);
  });

  for (const activation of expiredActiveRecords) {
    if (typeof prisma.activatedApp.update === "function") {
      await prisma.activatedApp.update({
        where: { id: activation.id },
        data: { status: "EXPIRED" },
      });
    }
  }

  const affectedDeviceIds = Array.from(
    new Set(
      activations
        .map((activation) => Number(activation.deviceId || 0))
        .filter(Boolean),
    ),
  );

  for (const deviceId of affectedDeviceIds) {
    await syncDeviceStatus(deviceId);
  }

  return prisma.activatedApp.findMany({
    where,
    orderBy: { activatedAt: "desc" },
  });
}

let expiryWatcherStarted = false;
function startExpiryWatcher() {
  if (expiryWatcherStarted) return;
  expiryWatcherStarted = true;

  const runSync = () => {
    refreshActivationStates().catch((error) => {
      console.error("activation expiry sync error", error);
    });
  };

  const startupTimer = setTimeout(runSync, 15000);
  const intervalId = setInterval(runSync, 5 * 60 * 1000);

  if (typeof startupTimer.unref === "function") startupTimer.unref();
  if (typeof intervalId.unref === "function") intervalId.unref();
}

startExpiryWatcher();

async function buildActivationVerification(
  mac,
  deviceKey,
  applicationId,
  appName,
  deviceProfile,
) {
  const normalizedMac = normalizeMac(mac);
  const normalizedKey = normalizeDeviceKey(deviceKey);

  if (!normalizedMac || !normalizedKey) {
    return {
      activated: false,
      reason: "missing_credentials",
      device: null,
      activations: [],
      playlists: [],
    };
  }

  let device = await prisma.device.findUnique({
    where: { mac: normalizedMac },
  });

  if (!device) {
    const normalizedProfile = sanitizeDeviceProfile(deviceProfile);
    device = await prisma.device.create({
      data: {
        mac: normalizedMac,
        deviceKey: normalizedKey,
        ...(normalizedProfile || {}),
        status: "INACTIVE",
      },
    });
  } else if (!device.deviceKey) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: { deviceKey: normalizedKey },
    });
  }

  const deviceProfilePatch = buildDeviceProfilePatch(device, deviceProfile);
  if (deviceProfilePatch) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: deviceProfilePatch,
    });
  }

  if (!device.deviceKey) {
    return {
      activated: false,
      reason: "device_not_found",
      device: null,
      activations: [],
      playlists: [],
    };
  }

  if (normalizeDeviceKey(device.deviceKey) !== normalizedKey) {
    return {
      activated: false,
      reason: "device_key_mismatch",
      device: {
        id: device.id,
        mac: device.mac,
        deviceKey: device.deviceKey,
        status: device.status,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      },
      activations: [],
      playlists: [],
    };
  }

  await refreshActivationStates({ deviceId: device.id });
  device = await prisma.device.findUnique({ where: { id: device.id } });

  const targetApplication = await resolveTargetApplication({
    applicationId,
    appName,
  });

  let activations = await prisma.activatedApp.findMany({
    where: { deviceId: device.id },
    orderBy: { activatedAt: "desc" },
  });

  if (
    applicationId !== undefined &&
    applicationId !== null &&
    applicationId !== ""
  ) {
    activations = activations.filter(
      (activation) =>
        Number(activation.applicationId) === Number(applicationId),
    );
  }

  if (appName) {
    const targetAppName = appName.toString().trim().toLowerCase();
    activations = activations.filter(
      (activation) =>
        (activation.appName || "").toString().toLowerCase() === targetAppName,
    );
  }

  const activeActivations = activations.filter(isActivationActive);
  const hasExpiredActivations = activations.some(
    (activation) => getResolvedActivationStatus(activation) === "EXPIRED",
  );
  const activeTrialActivation = activeActivations.find(isTrialActivation) || null;
  const expiredTrialActivation = activations.find(
    (activation) =>
      isTrialActivation(activation) &&
      getResolvedActivationStatus(activation) === "EXPIRED",
  );
  const trialState = buildTrialState(targetApplication, activations);
  const blocked = isDeviceBlocked(device);
  const playlists =
    !blocked && activeActivations.length > 0
      ? await getAssignedPlaylistsForDevice(device.id, {
          applicationId,
          appName,
        })
      : [];

  return {
    activated: !blocked && activeActivations.length > 0,
    reason: blocked
      ? "blocked"
      : activeTrialActivation
        ? "trial_active"
        : activeActivations.length > 0
        ? "active"
        : expiredTrialActivation
          ? "trial_expired"
          : hasExpiredActivations
          ? "expired"
          : "not_activated",
    device: {
      id: device.id,
      mac: device.mac,
      deviceKey: device.deviceKey,
      ownerResellerId: device.ownerResellerId ?? null,
      platform: device.platform ?? null,
      deviceName: device.deviceName ?? null,
      osVersion: device.osVersion ?? null,
      identitySource: device.identitySource ?? null,
      deviceInfo: safeJsonParse(device.deviceInfo),
      status: device.status,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    },
    activations: activations.map((activation) => ({
      id: activation.id,
      applicationId: activation.applicationId,
      appName: activation.appName,
      activationKind: getActivationKind(activation),
      duration: activation.duration || "1_year",
      activatedAt: activation.activatedAt,
      expiresAt: activation.expiresAt || null,
      trialStartedAt: activation.trialStartedAt || null,
      trialEndsAt: activation.trialEndsAt || null,
      trialConsumedAt: activation.trialConsumedAt || null,
      status: getResolvedActivationStatus(activation),
    })),
    trial: trialState,
    playlists,
  };
}

async function startFreeTrial({
  mac,
  deviceKey,
  applicationId,
  appName,
  deviceProfile,
}) {
  const normalizedMac = normalizeMac(mac);
  const normalizedKey = normalizeDeviceKey(deviceKey);

  if (!normalizedMac || !normalizedKey) {
    const error = new Error("mac and deviceKey required");
    error.statusCode = 400;
    throw error;
  }

  const targetApplication = await resolveTargetApplication({
    applicationId,
    appName,
  });

  if (!targetApplication) {
    const error = new Error("application not found for trial activation");
    error.statusCode = 404;
    throw error;
  }

  let device = await prisma.device.findUnique({ where: { mac: normalizedMac } });
  if (!device) {
    const normalizedProfile = sanitizeDeviceProfile(deviceProfile);
    device = await prisma.device.create({
      data: {
        mac: normalizedMac,
        deviceKey: normalizedKey,
        ...(normalizedProfile || {}),
        status: "INACTIVE",
      },
    });
  } else if (!device.deviceKey) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: { deviceKey: normalizedKey },
    });
  }

  const deviceProfilePatch = buildDeviceProfilePatch(device, deviceProfile);
  if (deviceProfilePatch) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: deviceProfilePatch,
    });
  }

  if (normalizeDeviceKey(device.deviceKey) !== normalizedKey) {
    return buildActivationVerification(
      normalizedMac,
      normalizedKey,
      applicationId,
      appName,
      deviceProfile,
    );
  }

  if (isDeviceBlocked(device)) {
    return buildActivationVerification(
      normalizedMac,
      normalizedKey,
      applicationId,
      appName,
      deviceProfile,
    );
  }

  await refreshActivationStates({
    deviceId: device.id,
    applicationId: targetApplication.id,
  });

  const activations = await prisma.activatedApp.findMany({
    where: {
      deviceId: device.id,
      applicationId: targetApplication.id,
    },
    orderBy: { activatedAt: "desc" },
  });

  const currentTrialState = buildTrialState(targetApplication, activations);
  console.log("[startFreeTrial] app:", targetApplication?.id, "trialEnabled:", targetApplication?.trialEnabled, "trialState:", JSON.stringify(currentTrialState), "activations:", activations.length);
  if (!targetApplication.trialEnabled || !currentTrialState.available) {
    console.log("[startFreeTrial] BLOCKED by trialEnabled/available gate");
    return buildActivationVerification(
      normalizedMac,
      normalizedKey,
      targetApplication.id,
      targetApplication.name,
      deviceProfile,
    );
  }

  if (activations.length > 0) {
    console.log("[startFreeTrial] BLOCKED by activations.length > 0");
    return buildActivationVerification(
      normalizedMac,
      normalizedKey,
      targetApplication.id,
      targetApplication.name,
      deviceProfile,
    );
  }

  const trialStartedAt = new Date().toISOString();
  const trialEndsAt = computeTrialExpiryDate(
    getTrialDurationDaysForApplication(targetApplication),
  );

  await prisma.activatedApp.create({
    data: {
      deviceId: device.id,
      applicationId: targetApplication.id,
      appName: targetApplication.name,
      activationKind: "TRIAL",
      duration: `${getTrialDurationDaysForApplication(targetApplication)}_days_trial`,
      expiresAt: trialEndsAt,
      trialStartedAt,
      trialEndsAt,
      trialConsumedAt: trialStartedAt,
      status: "ACTIVE",
      activatedAt: trialStartedAt,
    },
  });

  await syncDeviceStatus(device.id);

  return buildActivationVerification(
    normalizedMac,
    normalizedKey,
    targetApplication.id,
    targetApplication.name,
    deviceProfile,
  );
}

async function handleVerifyActivation(req, res) {
  try {
    const payload = req.method === "GET" ? req.query : req.body;
    const { mac, deviceKey, applicationId, appName, deviceProfile } = payload || {};
    if (!mac || !deviceKey) {
      return res.status(400).json({ error: "mac and deviceKey required" });
    }

    const result = await buildActivationVerification(
      mac,
      deviceKey,
      applicationId,
      appName,
      deviceProfile,
    );

    if (result?.reason === "device_key_mismatch") {
      logSecurityEvent("device_key_mismatch", req, {
        mac: normalizeMac(mac),
        applicationId:
          applicationId !== undefined && applicationId !== null && applicationId !== ""
            ? Number(applicationId)
            : null,
        appName: (appName || "").toString().trim() || null,
      });
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// List devices
router.get(
  "/",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      await refreshActivationStates();

      const role = (req.user.role || "").toString().toLowerCase();
      const search = (req.query.search || "").toString().trim();
      const status = (req.query.status || "").toString().trim().toUpperCase();
      const page = Math.max(Number(req.query.page || 1), 1);
      const requestedPageSize = Number(req.query.pageSize || 0);
      const pageSize = Math.min(Math.max(requestedPageSize || 10, 1), 100);

      const where = {};
      if (role === "reseller") {
        // return only devices owned by this reseller
        where.ownerResellerId = Number(req.user.resellerId);
      }

      if (status && status !== "ALL") {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { mac: { contains: search, mode: "insensitive" } },
          { deviceKey: { contains: search, mode: "insensitive" } },
          { domainUrl: { contains: search, mode: "insensitive" } },
          { deviceName: { contains: search, mode: "insensitive" } },
          { platform: { contains: search, mode: "insensitive" } },
        ];
      }

      const hasQueryPagination = Boolean(req.query.page || req.query.pageSize);
      const hasFilters = Boolean(search || status);

      if (!hasQueryPagination && !hasFilters) {
        const items = await prisma.device.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        return res.json(items);
      }

      const [items, allMatching] = await Promise.all([
        prisma.device.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.device.findMany({ where }),
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
  },
);

// Create device
router.post(
  "/",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const {
        mac,
        deviceKey,
        ownerResellerId: providedOwner,
        domainUrl,
        deviceProfile,
      } = req.body;
      const normalizedMac = normalizeMac(mac);
      const normalizedDeviceKey = normalizeDeviceKey(deviceKey);
      if (!normalizedMac)
        return res.status(400).json({ error: "mac required" });

      let ownerResellerId = providedOwner;
      if ((req.user.role || "").toString().toLowerCase() === "reseller") {
        // reseller can only create devices for their own reseller account
        ownerResellerId = req.user.resellerId;
      }

      if (normalizedDeviceKey) {
        const existingByKey = await prisma.device.findUnique({
          where: { deviceKey: normalizedDeviceKey },
        });
        if (
          existingByKey &&
          normalizeMac(existingByKey.mac) !== normalizedMac
        ) {
          return res.status(409).json({
            error: "That device key is already linked to another MAC address",
          });
        }
      }

      const normalizedProfile = sanitizeDeviceProfile(deviceProfile);

      const created = await prisma.device.create({
        data: {
          mac: normalizedMac,
          deviceKey: normalizedDeviceKey || null,
          ownerResellerId,
          domainUrl,
          ...(normalizedProfile || {}),
        },
      });
      res.json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Get device
router.get(
  "/:id(\\d+)",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) return res.status(404).json({ error: "Not found" });
      if (
        (req.user.role || "").toString().toLowerCase() === "reseller" &&
        device.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(device);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Update device
router.put(
  "/:id(\\d+)",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.device.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (
        (req.user.role || "").toString().toLowerCase() === "reseller" &&
        existing.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const role = (req.user.role || "").toString().toLowerCase();
      const data = { ...req.body };
      if (data.mac !== undefined) {
        data.mac = normalizeMac(data.mac);
      }
      if (data.deviceKey !== undefined) {
        const normalizedDeviceKey = normalizeDeviceKey(data.deviceKey);
        data.deviceKey = normalizedDeviceKey || null;
      }
      const deviceProfilePatch = buildDeviceProfilePatch(existing, data.deviceProfile);
      delete data.deviceProfile;
      if (deviceProfilePatch) {
        Object.assign(data, deviceProfilePatch);
      }
      if (role !== "superadmin") {
        delete data.status;
        delete data.ownerResellerId;
      } else if (data.status !== undefined) {
        data.status = data.status.toString().trim().toUpperCase();
      }
      const updated = await prisma.device.update({ where: { id }, data });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Delete device
router.delete(
  "/:id(\\d+)",
  auth,
  requireRole("superadmin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (prisma.devicePlaylist) {
        await prisma.devicePlaylist.deleteMany({ where: { deviceId: id } });
      }
      await prisma.activatedApp.deleteMany({ where: { deviceId: id } });
      await prisma.device.delete({ where: { id } });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Check MAC + Device Key endpoint
router.post(
  "/check-mac",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const { mac, deviceKey, applicationId } = req.body;
      const normalizedMac = normalizeMac(mac);
      const normalizedKey = normalizeDeviceKey(deviceKey || "");
      if (!normalizedMac)
        return res.status(400).json({ error: "mac required" });

      const device = await prisma.device.findUnique({
        where: { mac: normalizedMac },
      });
      if (!device) {
        return res.json({
          exists: false,
          activated: false,
          keyMatches: false,
          reason: "device_not_found",
          device: null,
          activations: [],
        });
      }

      const role = (req.user.role || "").toString().toLowerCase();
      if (
        role !== "superadmin" &&
        device.ownerResellerId !== req.user.resellerId
      ) {
        return res.json({
          exists: false,
          activated: false,
          keyMatches: false,
          reason: "device_not_found",
          device: null,
          activations: [],
        });
      }

      await refreshActivationStates({ deviceId: device.id });
      const refreshedDevice = await prisma.device.findUnique({
        where: { id: device.id },
      });

      const activations = await prisma.activatedApp.findMany({
        where: { deviceId: device.id },
        orderBy: { activatedAt: "desc" },
      });

      let relevantActivations = activations;
      let activeActivations = activations.filter(isActivationActive);
      if (
        applicationId !== undefined &&
        applicationId !== null &&
        applicationId !== ""
      ) {
        relevantActivations = relevantActivations.filter(
          (activation) =>
            Number(activation.applicationId) === Number(applicationId),
        );
        activeActivations = activeActivations.filter(
          (activation) =>
            Number(activation.applicationId) === Number(applicationId),
        );
      }

      const hasExpiredActivations = relevantActivations.some(
        (activation) => getResolvedActivationStatus(activation) === "EXPIRED",
      );
      const playlists = await getAssignedPlaylistsForDevice(device.id, {
        applicationId,
      });

      const keyMatches = !normalizedKey
        ? true
        : !!device.deviceKey &&
          normalizeDeviceKey(device.deviceKey) === normalizedKey;
      const blocked = isDeviceBlocked(refreshedDevice || device);

      res.json({
        exists: true,
        activated: !blocked && keyMatches && activeActivations.length > 0,
        keyMatches,
        reason: !keyMatches
          ? "device_key_mismatch"
          : blocked
            ? "blocked"
            : activeActivations.length > 0
              ? "active"
              : hasExpiredActivations
                ? "expired"
                : "not_activated",
        device: refreshedDevice || device,
        activations: relevantActivations.map((activation) => ({
          ...activation,
          status: getResolvedActivationStatus(activation),
        })),
        playlists,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.get("/verify-activation", verifyActivationGuard, handleVerifyActivation);
router.post("/verify-activation", verifyActivationGuard, handleVerifyActivation);

router.post("/update-key", async (req, res) => {
  try {
    const { mac, currentDeviceKey, newDeviceKey } = req.body || {};
    const normalizedMac = normalizeMac(mac);
    const normalizedCurrentKey = normalizeDeviceKey(currentDeviceKey);
    const normalizedNewKey = normalizeDeviceKey(newDeviceKey);

    if (!normalizedMac || !normalizedCurrentKey || !normalizedNewKey) {
      return res.status(400).json({
        error: "mac, currentDeviceKey and newDeviceKey are required",
      });
    }

    if (normalizedCurrentKey === normalizedNewKey) {
      return res.status(400).json({
        error: "New device key must be different from current key",
      });
    }

    if (!/^\d{8}$/.test(normalizedNewKey)) {
      return res.status(400).json({
        error: "New device key must be exactly 8 digits",
      });
    }

    let device = await prisma.device.findUnique({ where: { mac: normalizedMac } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (!device.deviceKey) {
      return res.status(409).json({
        error: "This device does not have a key yet",
      });
    }

    if (normalizeDeviceKey(device.deviceKey) !== normalizedCurrentKey) {
      return res.status(403).json({ error: "Current device key is incorrect" });
    }

    if (device.ownerResellerId) {
      return res.status(403).json({
        error:
          "This device is managed by a reseller account. Change the key from the reseller panel.",
      });
    }

    const existingByNewKey = await prisma.device.findUnique({
      where: { deviceKey: normalizedNewKey },
    });

    if (existingByNewKey && Number(existingByNewKey.id) !== Number(device.id)) {
      return res.status(409).json({
        error: "That new device key is already linked to another MAC address",
      });
    }

    device = await prisma.device.update({
      where: { id: device.id },
      data: { deviceKey: normalizedNewKey },
    });

    return res.json({
      success: true,
      message: "Device key updated successfully",
      device: {
        id: device.id,
        mac: device.mac,
        status: device.status,
        updatedAt: device.updatedAt,
      },
    });
  } catch (err) {
    console.error("update-key error", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/start-trial", startTrialGuard, async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await startFreeTrial(payload);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({
      error: err.message || "Server error",
    });
  }
});

// Get app catalog
router.get("/catalog", auth, async (req, res) => {
  try {
    const catalog = await getAppCatalog();
    res.json(catalog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Activate one or more apps for a MAC address (charges reseller credits)
router.post(
  "/activate",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const {
        mac,
        deviceKey,
        apps,
        ownerResellerId,
        payerResellerId,
        remarks,
      } = req.body;
      const normalizedMac = normalizeMac(mac);
      const normalizedDeviceKey = normalizeDeviceKey(deviceKey);
      if (
        !normalizedMac ||
        !normalizedDeviceKey ||
        !Array.isArray(apps) ||
        apps.length === 0
      )
        return res
          .status(400)
          .json({ error: "mac, deviceKey and apps required" });

      // dynamic catalog from DB
      const catalogList = await getAppCatalog();
      const appCatalogMap = {};
      for (const item of catalogList) {
        appCatalogMap[item.id] = item;
      }

      const calcPrice = (a) => {
        const info = appCatalogMap[a.id] || { price: 1 };
        const mult = a.duration === "lifetime" ? 2 : 1;
        return (info.price || 1) * mult;
      };

      const totalCost = apps.reduce((s, a) => s + calcPrice(a), 0);

      const role = (req.user.role || "").toString().toLowerCase();
      let ownerId = null;
      let payerId = null;

      if (role === "superadmin") {
        if (ownerResellerId) ownerId = Number(ownerResellerId);
        else {
          const existing = await prisma.device.findUnique({
            where: { mac: normalizedMac },
          });
          if (existing && existing.ownerResellerId)
            ownerId = existing.ownerResellerId;
          else
            return res.status(400).json({
              error:
                "ownerResellerId required for superadmin when device unknown",
            });
        }
        if (payerResellerId) payerId = Number(payerResellerId);
      } else {
        ownerId = req.user.resellerId;
        payerId = req.user.resellerId;
        if (!ownerId)
          return res.status(403).json({ error: "Reseller account not linked" });
      }

      // find or create device
      const existingByKey = await prisma.device.findUnique({
        where: { deviceKey: normalizedDeviceKey },
      });
      if (existingByKey && normalizeMac(existingByKey.mac) !== normalizedMac) {
        return res.status(409).json({
          error: "That device key is already linked to another MAC address",
        });
      }

      let device = await prisma.device.findUnique({
        where: { mac: normalizedMac },
      });
      if (!device) {
        const created = await prisma.device.create({
          data: {
            mac: normalizedMac,
            deviceKey: normalizedDeviceKey,
            ownerResellerId: ownerId,
          },
        });
        device = created;
      } else {
        if (isDeviceBlocked(device)) {
          return res.status(403).json({
            error: "This device is currently blocked by the admin",
          });
        }
        if (
          ownerId &&
          device.ownerResellerId &&
          Number(device.ownerResellerId) !== Number(ownerId)
        ) {
          return res
            .status(403)
            .json({ error: "Device already owned by another reseller" });
        }
        if (
          device.deviceKey &&
          normalizeDeviceKey(device.deviceKey) !== normalizedDeviceKey
        ) {
          return res.status(409).json({
            error: "This MAC is already linked to a different device key",
          });
        }

        const patch = {};
        if (!device.ownerResellerId && ownerId) patch.ownerResellerId = ownerId;
        if (!device.deviceKey && normalizedDeviceKey) {
          patch.deviceKey = normalizedDeviceKey;
        }
        if (Object.keys(patch).length > 0) {
          await prisma.device.update({
            where: { id: device.id },
            data: patch,
          });
          device = await prisma.device.findUnique({ where: { id: device.id } });
        }
      }

      const supportsTx = typeof prisma.$transaction === "function";

      // If there's a payer reseller, charge them atomically when possible
      if (payerId) {
        if (supportsTx) {
          const result = await prisma.$transaction(async (tx) => {
            const payerBefore = await tx.reseller.findUnique({
              where: { id: payerId },
            });
            if (!payerBefore) throw new Error("PAYER_NOT_FOUND");
            if (Number(payerBefore.credits) < totalCost)
              throw new Error("INSUFFICIENT");
            const payerAfter = await tx.reseller.update({
              where: { id: payerId },
              data: { credits: { decrement: totalCost } },
            });
            const activations = [];
            for (const a of apps) {
              const appRecord = appCatalogMap[a.id];
              const act = await tx.activatedApp.create({
                data: {
                  deviceId: device.id,
                  applicationId: appRecord.id,
                  appName: appRecord.name,
                  duration: a.duration || "1_year",
                  expiresAt: computeExpiryDate(a.duration),
                  status: "ACTIVE",
                },
              });
              activations.push(act);
            }
            const txrec = await tx.creditTransaction.create({
              data: {
                type: "ACTIVATION_PURCHASE",
                status: "COMPLETED",
                amount: totalCost,
                fromResellerId: payerId,
                toResellerId: null,
                performedById: req.user.id,
                notes: JSON.stringify({
                  mac: normalizedMac,
                  deviceKey: normalizedDeviceKey,
                  apps,
                  remarks: remarks || null,
                }),
                fromBeforeBalance: Number(payerBefore.credits),
                fromAfterBalance: Number(payerAfter.credits),
              },
            });
            return { activations, transaction: txrec };
          });
          return res.json(result);
        } else {
          // adapter fallback (non-atomic)
          const payer = await prisma.reseller.findUnique({
            where: { id: payerId },
          });
          if (!payer) return res.status(404).json({ error: "Payer not found" });
          if (Number(payer.credits) < totalCost)
            return res.status(400).json({ error: "Insufficient credits" });
          await prisma.reseller.update({
            where: { id: payerId },
            data: { credits: { decrement: totalCost } },
          });
          const activations = [];
          for (const a of apps) {
            const appRecord = appCatalogMap[a.id];
            const act = await prisma.activatedApp.create({
              data: {
                deviceId: device.id,
                applicationId: appRecord.id,
                appName: appRecord.name,
                duration: a.duration || "1_year",
                expiresAt: computeExpiryDate(a.duration),
                status: "ACTIVE",
              },
            });
            activations.push(act);
          }
          const payerAfter = await prisma.reseller.findUnique({
            where: { id: payerId },
          });
          const txrec = await prisma.creditTransaction.create({
            data: {
              type: "ACTIVATION_PURCHASE",
              status: "COMPLETED",
              amount: totalCost,
              fromResellerId: payerId,
              toResellerId: null,
              performedById: req.user.id,
              notes: JSON.stringify({
                mac: normalizedMac,
                deviceKey: normalizedDeviceKey,
                apps,
                remarks: remarks || null,
              }),
              fromBeforeBalance: Number(payer.credits),
              fromAfterBalance: Number(payerAfter.credits),
            },
          });
          return res.json({ activations, transaction: txrec });
        }
      }

      // No payer specified (admin granting activation)
      const activations = [];
      for (const a of apps) {
        const appRecord = appCatalogMap[a.id];
        const act = await prisma.activatedApp.create({
          data: {
            deviceId: device.id,
            applicationId: appRecord.id,
            appName: appRecord.name,
            duration: a.duration || "1_year",
            expiresAt: computeExpiryDate(a.duration),
            status: "ACTIVE",
          },
        });
        activations.push(act);
      }
      const txrec = await prisma.creditTransaction.create({
        data: {
          type: "ADMIN_ACTIVATION",
          status: "COMPLETED",
          amount: 0,
          performedById: req.user.id,
          notes: JSON.stringify({
            mac: normalizedMac,
            deviceKey: normalizedDeviceKey,
            apps,
            remarks: remarks || null,
          }),
        },
      });
      return res.json({ activations, transaction: txrec });
    } catch (err) {
      console.error(err);
      if (err.message === "INSUFFICIENT")
        return res.status(400).json({ error: "Insufficient credits" });
      if (err.message === "PAYER_NOT_FOUND")
        return res.status(404).json({ error: "Payer not found" });
      res.status(500).json({ error: "Server error" });
    }
  },
);

// List activations (superadmin sees all; reseller/subreseller see their own)
router.get(
  "/activations",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      await refreshActivationStates();

      const role = (req.user.role || "").toString().toLowerCase();
      if (role === "superadmin") {
        const acts = await prisma.activatedApp.findMany({
          orderBy: { activatedAt: "desc" },
          take: 200,
        });
        // attach device info
        const enriched = [];
        for (const a of acts) {
          const device = await prisma.device.findUnique({
            where: { id: a.deviceId },
          });
          enriched.push({ ...a, device });
        }
        return res.json(enriched);
      }

      // reseller/subreseller: only activations for devices they own
      const resellerId = req.user.resellerId;
      if (!resellerId) return res.status(403).json({ error: "Not a reseller" });
      const devices = await prisma.device.findMany({
        where: { ownerResellerId: resellerId },
      });
      if (!devices || devices.length === 0) return res.json([]);
      const deviceIds = devices.map((d) => d.id);
      let activations = [];
      if (typeof prisma.$transaction === "function") {
        const acts = await prisma.activatedApp.findMany({
          where: { deviceId: { in: deviceIds } },
          orderBy: { activatedAt: "desc" },
        });
        const deviceMap = new Map(devices.map((d) => [d.id, d]));
        activations = acts.map((a) => ({
          ...a,
          device: deviceMap.get(a.deviceId) || null,
        }));
      } else {
        for (const d of devices) {
          const acts = await prisma.activatedApp.findMany({
            where: { deviceId: d.id },
            orderBy: { activatedAt: "desc" },
          });
          for (const a of acts) activations.push({ ...a, device: d });
        }
      }
      res.json(activations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Switch MAC: Transfer all activated apps from one MAC to another
router.post(
  "/switch-mac",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const { oldMac, newMac } = req.body;
      const normalizedOldMac = normalizeMac(oldMac);
      const normalizedNewMac = normalizeMac(newMac);
      if (!normalizedOldMac || !normalizedNewMac)
        return res.status(400).json({ error: "Old and New MAC required" });

      const oldDevice = await prisma.device.findUnique({
        where: { mac: normalizedOldMac },
        include: { activatedApps: true },
      });
      if (!oldDevice)
        return res.status(404).json({ error: "Source device not found" });

      const role = (req.user.role || "").toString().toLowerCase();
      if (
        (role === "reseller" || role === "subreseller") &&
        oldDevice.ownerResellerId !== req.user.resellerId
      ) {
        return res
          .status(403)
          .json({ error: "Source MAC belongs to another reseller" });
      }

      // Check if target device exists or create it
      let targetDevice = await prisma.device.findUnique({
        where: { mac: normalizedNewMac },
      });
      if (!targetDevice) {
        targetDevice = await prisma.device.create({
          data: {
            mac: normalizedNewMac,
            deviceKey: oldDevice.deviceKey || null,
            ownerResellerId: oldDevice.ownerResellerId,
          },
        });
      } else if (
        (role === "reseller" || role === "subreseller") &&
        targetDevice.ownerResellerId &&
        targetDevice.ownerResellerId !== req.user.resellerId
      ) {
        return res
          .status(403)
          .json({ error: "Target MAC belongs to another reseller" });
      }

      // Transfer apps
      const apps = oldDevice.activatedApps;
      const results = [];
      for (const app of apps) {
        const exists = await prisma.activatedApp.findFirst({
          where: { deviceId: targetDevice.id, appName: app.appName },
        });
        if (!exists) {
          const moved = await prisma.activatedApp.create({
            data: {
              deviceId: targetDevice.id,
              applicationId: app.applicationId,
              appName: app.appName,
              duration: app.duration || "1_year",
              expiresAt: app.expiresAt || null,
              status: app.status || "ACTIVE",
              activatedAt: app.activatedAt,
            },
          });
          results.push(moved);
        }
      }

      let playlistsMoved = 0;
      if (prisma.devicePlaylist) {
        const oldAssignments = await prisma.devicePlaylist.findMany({
          where: { deviceId: oldDevice.id },
        });

        for (const assignment of oldAssignments) {
          const existingAssignment = await prisma.devicePlaylist.findFirst({
            where: {
              deviceId: targetDevice.id,
              playlistId: assignment.playlistId,
            },
          });

          if (!existingAssignment) {
            await prisma.devicePlaylist.create({
              data: {
                deviceId: targetDevice.id,
                playlistId: assignment.playlistId,
              },
            });
            playlistsMoved += 1;
          }
        }

        await prisma.devicePlaylist.deleteMany({
          where: { deviceId: oldDevice.id },
        });
      }

      await prisma.activatedApp.deleteMany({
        where: { deviceId: oldDevice.id },
      });

      await syncDeviceStatus(oldDevice.id);
      await syncDeviceStatus(targetDevice.id);

      res.json({
        success: true,
        targetMac: normalizedNewMac,
        appsMoved: results.length,
        playlistsMoved,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Reset Playlists: Clear all playlists linked to a specific MAC
router.post(
  "/reset-playlists",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const { mac } = req.body;
      if (!mac) return res.status(400).json({ error: "mac required" });

      const device = await prisma.device.findUnique({ where: { mac } });
      if (!device) return res.status(404).json({ error: "Device not found" });

      const role = (req.user.role || "").toString().toLowerCase();
      if (
        role !== "superadmin" &&
        device.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "You don't own this device" });
      }

      await prisma.devicePlaylist.deleteMany({
        where: { deviceId: device.id },
      });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Change Domain URL: Update a specific device domain
router.post(
  "/change-domain",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const { mac, domainUrl } = req.body;
      if (!mac) return res.status(400).json({ error: "mac required" });

      const device = await prisma.device.findUnique({ where: { mac } });
      if (!device) return res.status(404).json({ error: "Device not found" });

      const role = (req.user.role || "").toString().toLowerCase();
      if (
        role !== "superadmin" &&
        device.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "You don't own this device" });
      }

      await prisma.device.update({
        where: { id: device.id },
        data: { domainUrl },
      });

      res.json({ success: true, domainUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Admin/Reseller: change device key without requiring the current key
router.post(
  "/admin-change-key",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const { mac, newDeviceKey } = req.body;
      const normalizedMac = normalizeMac(mac);
      const normalizedNewKey = normalizeDeviceKey(newDeviceKey || "");

      if (!normalizedMac) {
        return res.status(400).json({ error: "mac required" });
      }
      if (!normalizedNewKey) {
        return res.status(400).json({ error: "newDeviceKey required" });
      }
      if (normalizedNewKey.length < 4 || normalizedNewKey.length > 20) {
        return res
          .status(400)
          .json({ error: "Device key must be between 4 and 20 characters" });
      }

      const device = await prisma.device.findUnique({
        where: { mac: normalizedMac },
      });
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }

      const role = (req.user.role || "").toString().toLowerCase();
      if (
        role !== "superadmin" &&
        device.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "You don't own this device" });
      }

      // Ensure new key not already used by a different device
      const existingByNewKey = await prisma.device.findUnique({
        where: { deviceKey: normalizedNewKey },
      });
      if (existingByNewKey && Number(existingByNewKey.id) !== Number(device.id)) {
        return res.status(409).json({
          error: "That device key is already linked to another MAC address",
        });
      }

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: { deviceKey: normalizedNewKey },
      });

      return res.json({
        success: true,
        message: "Device key updated successfully",
        device: {
          id: updated.id,
          mac: updated.mac,
          deviceKey: updated.deviceKey,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err) {
      console.error("admin-change-key error", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
