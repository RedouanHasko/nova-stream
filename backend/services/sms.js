const fs = require("fs");
const path = require("path");
const prisma = require("../db");
const {
  sendViaEmbeddedWhatsApp,
  getWhatsAppGatewayStatus,
} = require("./whatsapp-gateway");

const RATE_LOG_FILE = path.join(__dirname, "..", ".whatsapp-rate-log.json");
const EMBEDDED_GATEWAY_AUTH_DIR = path.join(__dirname, "..", ".whatsapp-auth");
let sendQueue = Promise.resolve();

function normalizeProviderName(value) {
  return (value || "").toString().trim().toLowerCase();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildWhatsAppSafetyConfig(config = {}) {
  return {
    dailyLimit: parsePositiveInt(
      config.dailyLimit ?? process.env.WHATSAPP_DAILY_LIMIT,
      100,
    ),
    hourlyLimit: parsePositiveInt(
      config.hourlyLimit ?? process.env.WHATSAPP_HOURLY_LIMIT,
      10,
    ),
    cooldownSeconds: parsePositiveInt(
      config.cooldownSeconds ?? process.env.WHATSAPP_COOLDOWN_SECONDS,
      45,
    ),
    burstLimit: parsePositiveInt(
      config.burstLimit ?? process.env.WHATSAPP_BURST_LIMIT,
      3,
    ),
    burstWindowMinutes: parsePositiveInt(
      config.burstWindowMinutes ?? process.env.WHATSAPP_BURST_WINDOW_MINUTES,
      1,
    ),
  };
}

function ensureRateLogDirectory() {
  const dirPath = path.dirname(RATE_LOG_FILE);
  if (fs.existsSync(dirPath)) {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `Cannot initialize WhatsApp rate log storage at ${dirPath}.`,
      );
    }
    return;
  }

  fs.mkdirSync(dirPath, { recursive: true });
}

function readRateLog() {
  try {
    ensureRateLogDirectory();
    if (!fs.existsSync(RATE_LOG_FILE)) {
      return { whatsapp: [] };
    }
    const raw = fs.readFileSync(RATE_LOG_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      whatsapp: Array.isArray(parsed?.whatsapp) ? parsed.whatsapp : [],
    };
  } catch {
    return { whatsapp: [] };
  }
}

function writeRateLog(state) {
  ensureRateLogDirectory();
  fs.writeFileSync(RATE_LOG_FILE, JSON.stringify(state, null, 2), "utf8");
}

function pruneWhatsAppTimestamps(timestamps) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (timestamps || []).filter((value) => Number(value) >= cutoff);
}

async function enforceWhatsAppSafety(config) {
  const safety = config?.safety || buildWhatsAppSafetyConfig();
  const now = Date.now();
  const burstWindowMs = safety.burstWindowMinutes * 60 * 1000;
  const cooldownMs = safety.cooldownSeconds * 1000;
  const log = readRateLog();
  const timestamps = pruneWhatsAppTimestamps(log.whatsapp);
  const lastSentAt = timestamps[timestamps.length - 1] || 0;
  const recentHour = timestamps.filter((value) => now - value < 60 * 60 * 1000);
  const recentBurst = timestamps.filter((value) => now - value < burstWindowMs);
  const remainingCooldownMs = Math.max(0, cooldownMs - (now - lastSentAt));

  if (remainingCooldownMs > 0) {
    throw new Error(
      `WhatsApp OTP sending is cooling down. Please wait about ${Math.ceil(
        remainingCooldownMs / 1000,
      )} seconds before requesting another code.`,
    );
  }

  if (recentBurst.length >= safety.burstLimit) {
    throw new Error(
      "WhatsApp burst protection is active. Please wait a minute before sending more OTP codes.",
    );
  }

  if (recentHour.length >= safety.hourlyLimit) {
    throw new Error(
      "The hourly WhatsApp OTP limit has been reached. Please try again later.",
    );
  }

  if (timestamps.length >= safety.dailyLimit) {
    throw new Error(
      "The daily WhatsApp OTP limit has been reached for the configured sender number.",
    );
  }

  return timestamps;
}

function recordWhatsAppSend(timestamps) {
  writeRateLog({
    whatsapp: [...pruneWhatsAppTimestamps(timestamps), Date.now()],
  });
}

async function withProviderSafety(config, operation) {
  if (config.provider !== "whatsapp-gateway") {
    return operation();
  }

  const run = async () => {
    const timestamps = await enforceWhatsAppSafety(config);
    const result = await operation();
    recordWhatsAppSend(timestamps);
    return result;
  };

  const next = sendQueue.then(run, run);
  sendQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function getEnvSmsConfig() {
  const provider = normalizeProviderName(process.env.SMS_PROVIDER);

  if (provider === "twilio") {
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").toString().trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || "").toString().trim();
    const fromNumber = (process.env.TWILIO_FROM_NUMBER || "").toString().trim();

    if (accountSid && authToken && fromNumber) {
      return {
        provider: "twilio",
        accountSid,
        authToken,
        fromNumber,
      };
    }
  }

  if (
    [
      "whatsapp",
      "whatsapp-gateway",
      "whatsapp_gateway",
      "baileys",
      "whatsapp-web",
      "whatsapp-web.js",
    ].includes(provider)
  ) {
    const endpointUrl = (process.env.WHATSAPP_GATEWAY_URL || "")
      .toString()
      .trim();
    const embedded =
      process.env.WHATSAPP_GATEWAY_EMBEDDED === "true" || !endpointUrl;
    const token = (
      process.env.WHATSAPP_GATEWAY_TOKEN ||
      process.env.WHATSAPP_API_KEY ||
      ""
    )
      .toString()
      .trim();
    const fromNumber = (process.env.WHATSAPP_FROM_NUMBER || "")
      .toString()
      .trim();

    if (endpointUrl || embedded) {
      return {
        provider: "whatsapp-gateway",
        endpointUrl,
        token,
        fromNumber,
        channel: "whatsapp",
        embedded,
        safety: buildWhatsAppSafetyConfig(),
      };
    }
  }

  return null;
}

async function getIntegrationSmsConfig() {
  try {
    const integrations = await prisma.apiIntegration.findMany({
      orderBy: { createdAt: "desc" },
    });

    const matching = (integrations || []).filter((integration) => {
      const haystack =
        `${integration?.name || ""} ${integration?.provider || ""}`.toLowerCase();
      return (
        integration?.active !== false &&
        (haystack.includes("sms") ||
          haystack.includes("twilio") ||
          haystack.includes("whatsapp") ||
          haystack.includes("baileys"))
      );
    });

    const candidate =
      matching.find((integration) => {
        const haystack =
          `${integration?.name || ""} ${integration?.provider || ""}`.toLowerCase();
        return haystack.includes("whatsapp") || haystack.includes("baileys");
      }) ||
      matching.find((integration) => {
        const haystack =
          `${integration?.name || ""} ${integration?.provider || ""}`.toLowerCase();
        return haystack.includes("twilio") || haystack.includes("sms");
      });

    const provider = normalizeProviderName(candidate?.provider);
    const rawConfig = candidate?.config;
    const config =
      rawConfig && typeof rawConfig === "string"
        ? JSON.parse(rawConfig)
        : rawConfig && typeof rawConfig === "object"
          ? rawConfig
          : {};
    const candidateName = `${candidate?.name || ""}`.toLowerCase();

    if (provider === "twilio" || candidateName.includes("twilio")) {
      const accountSid = (
        config.accountSid ||
        config.sid ||
        candidate?.apiKey ||
        ""
      )
        .toString()
        .trim();
      const authToken = (config.authToken || config.token || "")
        .toString()
        .trim();
      const fromNumber = (
        config.fromNumber ||
        config.from ||
        candidate?.webhookUrl ||
        ""
      )
        .toString()
        .trim();

      if (accountSid && authToken && fromNumber) {
        return {
          provider: "twilio",
          accountSid,
          authToken,
          fromNumber,
        };
      }
    }

    if (
      ["whatsapp", "whatsapp-gateway", "baileys", "whatsapp-web"].includes(
        provider,
      ) ||
      candidateName.includes("whatsapp") ||
      candidateName.includes("baileys")
    ) {
      const endpointUrl = (
        config.endpointUrl ||
        config.endpoint ||
        config.url ||
        candidate?.webhookUrl ||
        ""
      )
        .toString()
        .trim();
      const embedded = Boolean(config.embedded || config.useBuiltInGateway);
      const token = (
        config.token ||
        config.authToken ||
        config.apiKey ||
        candidate?.apiKey ||
        ""
      )
        .toString()
        .trim();
      const fromNumber = (config.fromNumber || config.from || "")
        .toString()
        .trim();

      if (endpointUrl || embedded) {
        return {
          provider: "whatsapp-gateway",
          endpointUrl,
          token,
          fromNumber,
          channel: "whatsapp",
          embedded,
          safety: buildWhatsAppSafetyConfig(config),
        };
      }
    }
  } catch (error) {
    console.error("sms integration lookup error", error);
  }

  return null;
}

function getDefaultEmbeddedSmsConfig() {
  const gatewayStatus = getWhatsAppGatewayStatus();
  const authSessionExists = fs.existsSync(EMBEDDED_GATEWAY_AUTH_DIR);
  const autostartEnabled = process.env.WHATSAPP_GATEWAY_AUTOSTART !== "false";

  if (
    !autostartEnabled ||
    gatewayStatus.status === "missing-dependency" ||
    (!authSessionExists &&
      ![
        "starting",
        "qr-required",
        "ready",
        "reconnecting",
        "logged-out",
      ].includes(gatewayStatus.status))
  ) {
    return null;
  }

  return {
    provider: "whatsapp-gateway",
    endpointUrl: "",
    token: "",
    fromNumber: gatewayStatus.phoneNumber
      ? `+${gatewayStatus.phoneNumber}`
      : "",
    channel: "whatsapp",
    embedded: true,
    safety: buildWhatsAppSafetyConfig(),
  };
}

async function resolveSmsConfig() {
  return (
    (await getIntegrationSmsConfig()) ||
    getDefaultEmbeddedSmsConfig() ||
    getEnvSmsConfig()
  );
}

async function parseGatewayResponse(response, fallbackMessage) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json?.error || json?.message || text || fallbackMessage);
  }

  return json;
}

async function sendViaTwilio(config, { to, message }) {
  const body = new URLSearchParams({
    To: to,
    From: config.fromNumber,
    Body: message,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const json = await parseGatewayResponse(
    response,
    "Failed to send SMS verification code.",
  );

  return {
    delivered: true,
    provider: "twilio",
    channel: "sms",
    sid: json?.sid || null,
  };
}

async function sendViaWhatsAppGateway(config, { to, message }) {
  if (config.embedded || !config.endpointUrl) {
    return sendViaEmbeddedWhatsApp(config, { to, message });
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
    headers["X-API-Key"] = config.token;
  }

  const response = await fetch(config.endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to,
      message,
      channel: "whatsapp",
      from: config.fromNumber || undefined,
      type: "otp",
    }),
  });

  const json = await parseGatewayResponse(
    response,
    "Failed to send WhatsApp verification code.",
  );

  return {
    delivered: true,
    provider: "whatsapp-gateway",
    channel: "whatsapp",
    sid: json?.id || json?.messageId || json?.sid || null,
  };
}

async function sendSms({ to, message }) {
  const config = await resolveSmsConfig();

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Verification messaging service is not configured.");
    }

    console.log(`[OTP DEV] ${to}: ${message}`);
    return {
      delivered: false,
      simulated: true,
      provider: "development",
      channel: "development",
    };
  }

  return withProviderSafety(config, async () => {
    if (config.provider === "twilio") {
      return sendViaTwilio(config, { to, message });
    }

    if (config.provider === "whatsapp-gateway") {
      return sendViaWhatsAppGateway(config, { to, message });
    }

    throw new Error(`Unsupported messaging provider: ${config.provider}`);
  });
}

module.exports = {
  sendSms,
};
