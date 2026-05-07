const express = require("express");
const cors = require("cors");
const path = require("path");
const os = require("os");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const {
  assertSecurityConfig,
  areDebugRoutesEnabled,
} = require("./lib/auth-config");
const { sensitiveNoStore } = require("./lib/security-monitor");

assertSecurityConfig();

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const resellersRoutes = require("./routes/resellers");
const creditsRoutes = require("./routes/credits");
const devicesRoutes = require("./routes/devices");
const playlistsRoutes = require("./routes/playlists");
const pricingRoutes = require("./routes/pricing");
const settingsRoutes = require("./routes/settings");
const integrationsRoutes = require("./routes/integrations");
const debugRoutes = require("./routes/debug");
const parentChangeRoutes = require("./routes/parent-change-requests");
const applicationsRoutes = require("./routes/applications");
const dashboardRoutes = require("./routes/dashboard");
const uploadsRoutes = require("./routes/uploads");
const notificationsRoutes = require("./routes/notifications");
const searchRoutes = require("./routes/search");
const whatsappGatewayRoutes = require("./routes/whatsapp-gateway");
const auditLogsRoutes = require("./routes/audit-logs");
const { startEmbeddedWhatsAppGateway } = require("./services/whatsapp-gateway");

const app = express();
app.disable("x-powered-by");

function isPrivateNetworkOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (!["http:", "https:"].includes(protocol)) return false;

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function getLanIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const details of addresses || []) {
      if (details && details.family === "IPv4" && !details.internal) {
        return details.address;
      }
    }
  }
  return null;
}

function resolveTrustProxySetting() {
  const raw = (process.env.TRUST_PROXY || "1").toString().trim().toLowerCase();

  if (raw === "true") return true;
  if (raw === "false") return false;

  const parsedNumber = Number(raw);
  if (Number.isInteger(parsedNumber) && parsedNumber >= 0) {
    return parsedNumber;
  }

  return raw || 1;
}

// Security and performance middlewares
app.set("trust proxy", resolveTrustProxySetting());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(morgan("dev"));

const allowPrivateNetworkOrigins =
  process.env.ALLOW_PRIVATE_NETWORK_ORIGINS === "true" ||
  process.env.NODE_ENV !== "production";

const allowedOrigins = Array.from(
  new Set(
    [
      process.env.FRONTEND_URL,
      process.env.PUBLIC_FRONTEND_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      ...(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ].filter(Boolean),
  ),
);
const corsOptions = {
  origin: function (origin, callback) {
    // allow non-browser clients (curl, server-to-server)
    if (!origin) return callback(null, true);
    if (origin === "null") return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    if (allowPrivateNetworkOrigins && isPrivateNetworkOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression());

// Basic rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(
  "/api/pricing/public/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);

// Limit JSON body size to avoid large payload attacks
app.use(
  express.json({
    limit: "50kb",
    type: (req) => req.originalUrl !== "/api/pricing/public/stripe/webhook",
  }),
);
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

app.use(
  [
    "/api/auth",
    "/api/users",
    "/api/settings",
    "/api/integrations",
    "/api/debug",
    "/api/search",
    "/api/whatsapp-gateway",
    "/api/audit-logs",
  ],
  sensitiveNoStore,
);

// Static uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/resellers", resellersRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/integrations", integrationsRoutes);
if (areDebugRoutesEnabled()) {
  app.use("/api/debug", debugRoutes);
}
app.use("/api/parent-change-requests", parentChangeRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/upload", uploadsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/whatsapp-gateway", whatsappGatewayRoutes);
app.use("/api/audit-logs", auditLogsRoutes);

// In production you might serve the frontend build from the backend
if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(path.join(__dirname, "..", "dist"), {
      maxAge: "1d",
      etag: true,
    }),
  );
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
  });
}

// basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, HOST, () => {
  const lanIp = getLanIpAddress();
  console.log(`Backend API listening at http://localhost:${PORT}`);
  if (HOST === "0.0.0.0" && lanIp) {
    console.log(`Backend API LAN access: http://${lanIp}:${PORT}`);
  }

  if (process.env.WHATSAPP_GATEWAY_AUTOSTART !== "false") {
    startEmbeddedWhatsAppGateway().catch((error) => {
      console.warn(
        "Embedded WhatsApp gateway did not start:",
        error?.message || error,
      );
    });
  }
});
