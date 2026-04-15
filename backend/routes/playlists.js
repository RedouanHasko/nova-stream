const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");

function normalizeMac(value = "") {
  return value.toString().trim().toUpperCase();
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
  return getResolvedActivationStatus(activation) === "ACTIVE";
}

function buildXtreamUrl(credentials = {}) {
  const host = (credentials.host || "").toString().trim().replace(/\/+$/, "");
  const username = (credentials.username || "").toString().trim();
  const password = (credentials.password || "").toString().trim();

  if (!host || !username || !password) return "";

  return `${host}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
}

function buildStoredPlaylistContent({
  existingContent,
  playlistType,
  credentials,
  targetApplicationId,
  targetAppName,
}) {
  const metadata = {
    sourceType: playlistType,
    credentials:
      credentials &&
      credentials.host &&
      credentials.username &&
      credentials.password
        ? {
            host: credentials.host,
            username: credentials.username,
            password: credentials.password,
          }
        : null,
    targetApplicationId:
      targetApplicationId !== undefined &&
      targetApplicationId !== null &&
      targetApplicationId !== ""
        ? Number(targetApplicationId)
        : null,
    targetAppName: targetAppName ? targetAppName.toString().trim() : null,
    rawContent: existingContent || null,
  };

  return JSON.stringify(metadata);
}

function getPlaylistMetadata(playlist = {}) {
  const parsed = safeJsonParse(playlist.content);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function buildPlaylistPayload(playlist = {}) {
  const metadata = getPlaylistMetadata(playlist);
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

function matchesTargetApplication(playlist, { applicationId, appName } = {}) {
  const payload = buildPlaylistPayload(playlist);
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

async function getDeviceAssignments(deviceId, filters = {}) {
  if (
    !prisma.devicePlaylist ||
    typeof prisma.devicePlaylist.findMany !== "function"
  ) {
    return [];
  }

  const assignments = await prisma.devicePlaylist.findMany({
    where: { deviceId },
    include: { playlist: true },
    orderBy: { addedAt: "desc" },
  });

  return assignments
    .filter(
      (item) =>
        item?.playlist && matchesTargetApplication(item.playlist, filters),
    )
    .map((item) => ({
      assignmentId: item.id,
      addedAt: item.addedAt,
      ...buildPlaylistPayload(item.playlist),
    }));
}

async function buildDeviceFeed({ mac, deviceKey, applicationId, appName }) {
  const normalizedMac = normalizeMac(mac);
  const normalizedKey = (deviceKey || "").toString().trim();

  if (!normalizedMac || !normalizedKey) {
    return {
      exists: false,
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
    device = await prisma.device.create({
      data: {
        mac: normalizedMac,
        deviceKey: normalizedKey,
        status: "INACTIVE",
      },
    });
  } else if (!device.deviceKey) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: { deviceKey: normalizedKey },
    });
  }

  if ((device.deviceKey || "").toString().trim() !== normalizedKey) {
    return {
      exists: true,
      activated: false,
      reason: "device_key_mismatch",
      device: {
        id: device.id,
        mac: device.mac,
        status: device.status,
      },
      activations: [],
      playlists: [],
    };
  }

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
    const normalizedAppName = appName.toString().trim().toLowerCase();
    activations = activations.filter(
      (activation) =>
        (activation.appName || "").toString().trim().toLowerCase() ===
        normalizedAppName,
    );
  }

  const activeActivations = activations.filter(isActivationActive);
  const hasExpiredActivations = activations.some(
    (activation) => getResolvedActivationStatus(activation) === "EXPIRED",
  );
  const playlists =
    activeActivations.length > 0
      ? await getDeviceAssignments(device.id, { applicationId, appName })
      : [];

  return {
    exists: true,
    activated: activeActivations.length > 0,
    reason:
      activeActivations.length > 0
        ? "active"
        : hasExpiredActivations
          ? "expired"
          : "not_activated",
    device,
    activations: activations.map((activation) => ({
      ...activation,
      status: getResolvedActivationStatus(activation),
    })),
    playlists,
  };
}

// List playlists
router.get(
  "/",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const where = {};
      if ((req.user.role || "").toString().toLowerCase() === "reseller") {
        where.ownerResellerId = req.user.resellerId;
      }
      const lists = await prisma.playlist.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      res.json(lists);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Public device feed for real app-side syncing by MAC + key
router.get("/device-feed", async (req, res) => {
  try {
    const result = await buildDeviceFeed(req.query || {});
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/device-feed", async (req, res) => {
  try {
    const result = await buildDeviceFeed(req.body || {});
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create playlist
router.post(
  "/",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const {
        ownerResellerId: providedOwner,
        name,
        url,
        content,
        type,
      } = req.body;
      let ownerResellerId = providedOwner;
      if ((req.user.role || "").toString().toLowerCase() === "reseller") {
        ownerResellerId = req.user.resellerId;
      }
      const created = await prisma.playlist.create({
        data: { ownerResellerId, name, url, content, type },
      });
      res.json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Assign playlist to a device/app by MAC so the player app can fetch it in real time
router.post(
  "/assign-to-device",
  auth,
  requireRole("superadmin", "reseller", "subreseller"),
  async (req, res) => {
    try {
      const { mac, name, url, content, credentials, applicationId, appName } =
        req.body || {};

      const normalizedMac = normalizeMac(mac);
      const trimmedName = (name || "").toString().trim();

      if (!normalizedMac || !trimmedName) {
        return res.status(400).json({ error: "mac and name are required" });
      }

      const trimmedUrl = (url || "").toString().trim();
      const xtreamUrl = buildXtreamUrl(credentials || {});
      if (!trimmedUrl && !xtreamUrl && !(content || "").toString().trim()) {
        return res.status(400).json({
          error: "Provide a valid M3U URL, raw content, or Xtream credentials",
        });
      }

      const role = (req.user.role || "").toString().toLowerCase();
      let device = await prisma.device.findUnique({
        where: { mac: normalizedMac },
      });

      if (!device) {
        device = await prisma.device.create({
          data: {
            mac: normalizedMac,
            ownerResellerId:
              role === "superadmin" ? null : req.user.resellerId || null,
            status: "INACTIVE",
          },
        });
      }

      if (
        role !== "superadmin" &&
        device.ownerResellerId &&
        Number(device.ownerResellerId) !== Number(req.user.resellerId)
      ) {
        return res.status(403).json({ error: "You do not own this device" });
      }

      if (
        role !== "superadmin" &&
        !device.ownerResellerId &&
        req.user.resellerId
      ) {
        device = await prisma.device.update({
          where: { id: device.id },
          data: { ownerResellerId: req.user.resellerId },
        });
      }

      let selectedActivation = null;
      if (
        applicationId !== undefined &&
        applicationId !== null &&
        applicationId !== ""
      ) {
        const activations = await prisma.activatedApp.findMany({
          where: { deviceId: device.id },
          orderBy: { activatedAt: "desc" },
        });
        selectedActivation = activations.find(
          (activation) =>
            Number(activation.applicationId) === Number(applicationId),
        );

        if (!selectedActivation || !isActivationActive(selectedActivation)) {
          return res.status(400).json({
            error:
              "The selected app is not currently active on this MAC address",
          });
        }
      }

      const playlistType =
        trimmedUrl || (content || "").toString().trim() ? "m3u" : "xtream";
      const finalUrl = trimmedUrl || xtreamUrl || null;
      const finalContent = buildStoredPlaylistContent({
        existingContent: (content || "").toString().trim() || null,
        playlistType,
        credentials: credentials || null,
        targetApplicationId:
          applicationId !== undefined &&
          applicationId !== null &&
          applicationId !== ""
            ? Number(applicationId)
            : selectedActivation?.applicationId || null,
        targetAppName: appName || selectedActivation?.appName || null,
      });

      const playlist = await prisma.playlist.create({
        data: {
          ownerResellerId:
            device.ownerResellerId || req.user.resellerId || null,
          name: trimmedName,
          url: finalUrl,
          content: finalContent,
          type: playlistType,
        },
      });

      const assignment = await prisma.devicePlaylist.create({
        data: {
          deviceId: device.id,
          playlistId: playlist.id,
        },
      });

      res.json({
        success: true,
        message: "Playlist stored and linked to the device successfully.",
        device,
        assignment,
        playlist: buildPlaylistPayload(playlist),
        delivery: {
          mode: "panel-api",
          verifyEndpoint: "/api/devices/verify-activation",
          feedEndpoint: "/api/playlists/device-feed",
          mac: device.mac,
          applicationId:
            applicationId !== undefined &&
            applicationId !== null &&
            applicationId !== ""
              ? Number(applicationId)
              : null,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Get playlist
router.get(
  "/:id",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const p = await prisma.playlist.findUnique({ where: { id } });
      if (!p) return res.status(404).json({ error: "Not found" });
      if (
        (req.user.role || "").toString().toLowerCase() === "reseller" &&
        p.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(p);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Update playlist
router.put(
  "/:id",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.playlist.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (
        (req.user.role || "").toString().toLowerCase() === "reseller" &&
        existing.ownerResellerId !== req.user.resellerId
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const data = req.body;
      const updated = await prisma.playlist.update({ where: { id }, data });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Delete playlist
router.delete("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.playlist.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Check playlist content (simple stub)
router.post(
  "/check",
  auth,
  requireRole("superadmin", "reseller"),
  async (req, res) => {
    try {
      const { content, url } = req.body;
      const source = content || url || "";
      const lines = source.split("\n").filter(Boolean);
      res.json({ ok: true, lines: lines.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
