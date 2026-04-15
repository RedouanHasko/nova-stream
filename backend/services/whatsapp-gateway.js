const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.join(__dirname, "..", ".whatsapp-auth");

let gatewayState = {
  status: "idle",
  connected: false,
  phoneNumber: null,
  qr: null,
  qrDataUrl: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

let gatewaySocket = null;
let startPromise = null;
let depsCache = null;

function stopGatewaySocket() {
  try {
    gatewaySocket?.ev?.removeAllListeners?.("connection.update");
    gatewaySocket?.ev?.removeAllListeners?.("creds.update");
  } catch {
    // noop
  }

  try {
    gatewaySocket?.end?.();
  } catch {
    // noop
  }

  try {
    gatewaySocket?.ws?.close?.();
  } catch {
    // noop
  }

  gatewaySocket = null;
}

function resetAuthStateDirectory() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    // noop
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function updateGatewayState(patch = {}) {
  gatewayState = {
    ...gatewayState,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return gatewayState;
}

function getWhatsAppGatewayStatus() {
  return { ...gatewayState };
}

async function loadDependencies() {
  if (depsCache) return depsCache;

  try {
    const baileys = require("@whiskeysockets/baileys");
    const QRCode = require("qrcode");
    const pino = require("pino");
    depsCache = { baileys, QRCode, pino };
    return depsCache;
  } catch (error) {
    updateGatewayState({
      status: "missing-dependency",
      connected: false,
      lastError:
        "Install @whiskeysockets/baileys, pino, and qrcode to use the built-in WhatsApp gateway.",
    });
    return null;
  }
}

function normalizeRecipientToJid(phoneNumber) {
  const digits = (phoneNumber || "").toString().replace(/\D/g, "");
  if (!digits) {
    throw new Error("A valid recipient phone number is required.");
  }
  return `${digits}@s.whatsapp.net`;
}

async function buildQrDataUrl(QRCode, qr) {
  try {
    return await QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
    });
  } catch {
    return null;
  }
}

async function startEmbeddedWhatsAppGateway({ force = false } = {}) {
  if (startPromise && !force) {
    return startPromise;
  }

  if (force) {
    stopGatewaySocket();
    if (gatewayState.status === "logged-out") {
      // If WhatsApp unlinked this device, discard stale auth state so the
      // next connection attempt emits a fresh QR code for re-pairing.
      resetAuthStateDirectory();
    }
  }

  startPromise = (async () => {
    const deps = await loadDependencies();
    if (!deps) {
      return getWhatsAppGatewayStatus();
    }

    const { baileys, QRCode, pino } = deps;
    const {
      default: makeWASocket,
      fetchLatestBaileysVersion,
      useMultiFileAuthState,
      DisconnectReason,
    } = baileys;

    fs.mkdirSync(AUTH_DIR, { recursive: true });

    updateGatewayState({
      status: "starting",
      connected: false,
      lastError: null,
    });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const logger =
      typeof pino === "function" ? pino({ level: "silent" }) : undefined;

    gatewaySocket = makeWASocket({
      auth: state,
      version,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: ["NOVA Panel", "Embedded Gateway", "1.0.0"],
    });

    gatewaySocket.ev.on("creds.update", saveCreds);

    gatewaySocket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update || {};

      if (qr) {
        const qrDataUrl = await buildQrDataUrl(QRCode, qr);
        updateGatewayState({
          status: "qr-required",
          connected: false,
          qr,
          qrDataUrl,
          lastError: null,
        });
        return;
      }

      if (connection === "open") {
        const connectedId = gatewaySocket?.user?.id || "";
        const phoneNumber = connectedId
          ? connectedId.toString().split(":")[0].replace(/\D/g, "")
          : null;

        updateGatewayState({
          status: "ready",
          connected: true,
          phoneNumber,
          qr: null,
          qrDataUrl: null,
          lastError: null,
        });
        return;
      }

      if (connection === "close") {
        const disconnectCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode ||
          null;
        const shouldRestart = disconnectCode !== DisconnectReason.loggedOut;

        updateGatewayState({
          status: shouldRestart ? "reconnecting" : "logged-out",
          connected: false,
          phoneNumber: null,
          qr: null,
          qrDataUrl: null,
          lastError: lastDisconnect?.error?.message || null,
        });

        if (shouldRestart) {
          setTimeout(() => {
            startEmbeddedWhatsAppGateway().catch((error) => {
              updateGatewayState({
                status: "error",
                connected: false,
                lastError:
                  error?.message || "Failed to reconnect WhatsApp gateway.",
              });
            });
          }, 2000);
        }
      }
    });

    return getWhatsAppGatewayStatus();
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

function waitForGatewayReady(timeoutMs = 15000) {
  if (gatewaySocket && gatewayState.status === "ready") {
    return Promise.resolve(getWhatsAppGatewayStatus());
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const checkState = () => {
      if (gatewaySocket && gatewayState.status === "ready") {
        resolve(getWhatsAppGatewayStatus());
        return;
      }

      if (
        ["qr-required", "logged-out", "missing-dependency", "error"].includes(
          gatewayState.status,
        )
      ) {
        reject(
          new Error(
            gatewayState.lastError ||
              "Built-in WhatsApp gateway is not connected yet. Open System Settings > API & Integrations, start the gateway, and scan the QR code first.",
          ),
        );
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(
          new Error(
            "Built-in WhatsApp gateway is still connecting. Please try again in a few seconds.",
          ),
        );
        return;
      }

      setTimeout(checkState, 500);
    };

    checkState();
  });
}

async function sendViaEmbeddedWhatsApp(_config, { to, message }) {
  if (!gatewaySocket || gatewayState.status !== "ready") {
    await startEmbeddedWhatsAppGateway();
    await waitForGatewayReady();
  }

  if (!gatewaySocket || gatewayState.status !== "ready") {
    throw new Error(
      "Built-in WhatsApp gateway is not connected yet. Open System Settings > API & Integrations, start the gateway, and scan the QR code first.",
    );
  }

  const jid = normalizeRecipientToJid(to);
  const result = await gatewaySocket.sendMessage(jid, { text: message });

  return {
    delivered: true,
    provider: "whatsapp-gateway",
    channel: "whatsapp",
    sid: result?.key?.id || null,
    embedded: true,
  };
}

module.exports = {
  getWhatsAppGatewayStatus,
  startEmbeddedWhatsAppGateway,
  sendViaEmbeddedWhatsApp,
};
