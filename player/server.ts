import fs from "fs";
import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import zlib from "zlib";
import dns from "dns";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

import { createProxyMiddleware } from "http-proxy-middleware";

// Prefer IPv4 on Windows to avoid slow IPv6 probe timeouts
dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 256,
  maxFreeSockets: 64,
  timeout: 60000,
});
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 256,
  maxFreeSockets: 64,
  timeout: 60000,
});

// In-memory cache for Xtream API JSON responses
const apiCache = new Map<
  string,
  { body: string; contentType: string; ts: number }
>();
const API_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

type StreamDedupEntry = {
  ownerId: string;
  cancel: () => void;
  createdAt: number;
};

// Prevent duplicate in-flight live stream connections for the same stream URL.
const liveStreamDedupMap = new Map<string, StreamDedupEntry>();

function shiftWebVtt(vtt: string, delayMs: number): string {
  if (!delayMs) return vtt;

  const delta = delayMs / 1000;
  const toSeconds = (hh: string, mm: string, ss: string, ms: string) => {
    return (
      parseInt(hh, 10) * 3600 +
      parseInt(mm, 10) * 60 +
      parseInt(ss, 10) +
      parseInt(ms, 10) / 1000
    );
  };
  const fromSeconds = (value: number) => {
    const clamped = Math.max(0, value);
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = Math.floor(clamped % 60);
    const ms = Math.floor((clamped - Math.floor(clamped)) * 1000);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  return vtt.replace(
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g,
    (_, sh, sm, ss, sms, eh, em, es, ems) => {
      const start = toSeconds(sh, sm, ss, sms) + delta;
      const end = toSeconds(eh, em, es, ems) + delta;
      const safeStart = Math.max(0, start);
      const safeEnd = Math.max(safeStart + 0.01, end);
      return `${fromSeconds(safeStart)} --> ${fromSeconds(safeEnd)}`;
    },
  );
}

function shiftSrt(srt: string, delayMs: number): string {
  if (!delayMs) return srt;

  const delta = delayMs / 1000;
  const toSeconds = (hh: string, mm: string, ss: string, ms: string) => {
    return (
      parseInt(hh, 10) * 3600 +
      parseInt(mm, 10) * 60 +
      parseInt(ss, 10) +
      parseInt(ms, 10) / 1000
    );
  };
  const fromSeconds = (value: number) => {
    const clamped = Math.max(0, value);
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = Math.floor(clamped % 60);
    const ms = Math.floor((clamped - Math.floor(clamped)) * 1000);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  return srt.replace(
    /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/g,
    (_, sh, sm, ss, sms, eh, em, es, ems) => {
      const start = toSeconds(sh, sm, ss, sms) + delta;
      const end = toSeconds(eh, em, es, ems) + delta;
      const safeStart = Math.max(0, start);
      const safeEnd = Math.max(safeStart + 0.01, end);
      return `${fromSeconds(safeStart)} --> ${fromSeconds(safeEnd)}`;
    },
  );
}

function srtToVttText(srt: string): string {
  const cleaned = (srt || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!cleaned) return "WEBVTT\n\n";
  if (cleaned.startsWith("WEBVTT")) return cleaned;
  const body = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2 --> $3.$4",
  );
  return `WEBVTT\n\n${body}\n`;
}

function vttToSrtText(vtt: string): string {
  const cleaned = (vtt || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!cleaned) return "";
  const withoutHeader = cleaned.replace(/^WEBVTT[^\n]*\n+/i, "");
  return withoutHeader.replace(
    /(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})/g,
    "$1,$2 --> $3,$4",
  );
}

// Persist cache to disk so a dev-server restart doesn't cold-start every session
const CACHE_FILE = path.join(__dirname, ".nova-api-cache.json");
let saveCacheTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCacheSave() {
  if (saveCacheTimer) clearTimeout(saveCacheTimer);
  saveCacheTimer = setTimeout(() => {
    try {
      const obj: Record<
        string,
        { body: string; contentType: string; ts: number }
      > = {};
      for (const [k, v] of apiCache.entries()) obj[k] = v;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch (_) {
      /* disk full / permissions — silently ignore */
    }
  }, 2000);
}

try {
  const raw = fs.readFileSync(CACHE_FILE, "utf8");
  const saved = JSON.parse(raw) as Record<
    string,
    { body: string; contentType: string; ts: number }
  >;
  const now = Date.now();
  for (const [k, v] of Object.entries(saved)) {
    if (now - v.ts < API_CACHE_TTL) apiCache.set(k, v);
  }
  console.log(`[cache] Restored ${apiCache.size} entries from disk`);
} catch (_) {
  /* no cache file yet — start fresh */
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "4000");

  app.use(express.json());

  // Diagnostic endpoint to test reachability
  app.get("/api/test-reach", (req, res) => {
    const targetUrl = "http://line.dndnscloud.ru";
    const req2 = http.get(targetUrl, (r) => {
      res.json({ status: r.statusCode, reachable: true });
      r.destroy();
    });
    req2.on("error", (e) => res.json({ reachable: false, error: e.message }));
    req2.setTimeout(5000, () => {
      req2.destroy();
      res.json({ reachable: false, error: "timeout" });
    });
  });

  // Handle CORS preflight for proxy
  app.options("/api/proxy", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.status(200).end();
  });

  // Proxy endpoint for IPTV requests to bypass CORS
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No URL");

    // Serve cached API responses immediately
    const isApiCall = targetUrl.includes("player_api.php");
    if (isApiCall) {
      const cached = apiCache.get(targetUrl);
      if (cached && Date.now() - cached.ts < API_CACHE_TTL) {
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "*");
        return res.send(cached.body);
      }
    }

    let redirectCount = 0;
    const MAX_REDIRECTS = 20;
    let accumulatedCookies: string[] = [];
    let retryCount = 0;
    const MAX_RETRIES = 2; // Retry upstream 5xx errors up to 2 times
    let connLimitRetries = 0;
    const MAX_CONN_LIMIT_RETRIES = 4; // 551 = connection limit, retry a few times quickly
    let transientErrorRetries = 0;
    const MAX_TRANSIENT_ERROR_RETRIES = 3; // ECONNRESET / socket hang-up / timeout before any response
    let currentAttemptId = 0;
    let responseClosed = false;
    let activeProxyReq: http.ClientRequest | null = null;
    let activeProxyRes: http.IncomingMessage | null = null;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();

    const isLiveStreamRequest = /\/live\//i.test(targetUrl);
    const dedupKey = !isApiCall && isLiveStreamRequest ? targetUrl : null;
    const dedupOwnerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const isDedupOwnerActive = () => {
      if (!dedupKey) return true;
      const entry = liveStreamDedupMap.get(dedupKey);
      return !!entry && entry.ownerId === dedupOwnerId;
    };

    const clearRetryTimers = () => {
      for (const t of retryTimers) clearTimeout(t);
      retryTimers.clear();
    };

    const releaseDedup = () => {
      if (!dedupKey) return;
      const entry = liveStreamDedupMap.get(dedupKey);
      if (entry?.ownerId === dedupOwnerId) {
        liveStreamDedupMap.delete(dedupKey);
      }
    };

    const cancelInFlight = () => {
      responseClosed = true;
      currentAttemptId++;
      clearRetryTimers();
      if (activeProxyRes) {
        activeProxyRes.destroy();
        activeProxyRes = null;
      }
      if (activeProxyReq) {
        activeProxyReq.destroy();
        activeProxyReq = null;
      }
    };

    const scheduleRetry = (delayMs: number, cb: () => void) => {
      const t = setTimeout(() => {
        retryTimers.delete(t);
        if (!responseClosed && isDedupOwnerActive()) cb();
      }, delayMs);
      retryTimers.add(t);
    };

    if (dedupKey) {
      const existing = liveStreamDedupMap.get(dedupKey);
      if (existing) {
        existing.cancel();
      }
      liveStreamDedupMap.set(dedupKey, {
        ownerId: dedupOwnerId,
        cancel: cancelInFlight,
        createdAt: Date.now(),
      });
    }

    const isAttemptActive = (attemptId: number) =>
      !responseClosed &&
      isDedupOwnerActive() &&
      attemptId === currentAttemptId &&
      !res.headersSent &&
      !res.writableEnded &&
      !res.destroyed;

    const canWriteBody = (attemptId: number) =>
      !responseClosed &&
      isDedupOwnerActive() &&
      attemptId === currentAttemptId &&
      !res.writableEnded &&
      !res.destroyed;

    res.on("close", () => {
      responseClosed = true;
      clearRetryTimers();
      releaseDedup();
    });
    res.on("finish", () => {
      responseClosed = true;
      clearRetryTimers();
      releaseDedup();
    });

    // Helper: detect IP-like hostnames (IPv4 / simple IPv6-ish check)
    const isIpAddress = (h?: string) =>
      !!h && (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || /[:a-fA-F0-9]/.test(h));

    // Original host (first URL) — used to preserve Host / SNI when upstream redirects to raw IPs
    let originalHost: string | undefined = undefined;
    try {
      originalHost = new URL(targetUrl).hostname;
    } catch (e) {
      originalHost = undefined;
    }

    // Small UA fallback list (tried sequentially on empty upstream responses)
    const fallbackUAs = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.5790.170 Safari/537.36",
      "VLC/3.0.18 LibVLC/3.0.18",
      "Lavf/58.76.100",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    ];
    let uaFallbackAttempt = 0;
    const disableUaFallbackRotationForLive = /\/live\//i.test(targetUrl);

    const makeRequest = (currentUrl: string) => {
      try {
        const attemptId = ++currentAttemptId;
        let parsedUrl = new URL(currentUrl);
        // Prefer the client's User-Agent when available; fall back to VLC UA
        // Allow small client-driven experiments via query params:
        // - ?ua=... to override User-Agent
        // - ?upstreamReferer=... to set an explicit Referer for upstream
        const clientUa =
          (req.query.ua as string) ||
          (uaFallbackAttempt > 0
            ? fallbackUAs[uaFallbackAttempt - 1]
            : (req.headers["user-agent"] as string)) ||
          undefined;
        const headers: any = {
          // Prefer the caller UA first. Some providers reject fixed VLC/Lavf
          // signatures on direct VOD/series file URLs and return 400/403.
          "User-Agent": clientUa || "VLC/3.0.18 LibVLC/3.0.18",
          // Prefer client's Accept header when available
          Accept: (req.headers["accept"] as string) || "*/*",
          Connection: "keep-alive",
          // Ask upstream to gzip for API calls, but prefer identity for raw stream manifests
          "Accept-Encoding": isApiCall ? "gzip, deflate" : "identity",
        };

        // Forward a few common client headers — API calls keep full forwarding,
        // media calls forward only referer to improve compatibility with strict CDNs.
        if (isApiCall) {
          if (req.headers["referer"])
            headers["Referer"] = req.headers["referer"] as string;
          if (req.headers["origin"])
            headers["Origin"] = req.headers["origin"] as string;
        } else {
          if (req.headers["referer"])
            headers["Referer"] = req.headers["referer"] as string;
        }
        if (req.headers["accept-language"])
          headers["Accept-Language"] = req.headers["accept-language"] as string;

        // Allow explicit upstream referer override via query param for experimentation
        if (req.query.upstreamReferer) {
          headers["Referer"] = String(req.query.upstreamReferer);
        }

        // If the requested resource is an M3U8, hint Accept accordingly to encourage proper manifest responses
        if (currentUrl && (currentUrl as string).includes(".m3u8")) {
          headers["Accept"] =
            "application/vnd.apple.mpegurl, application/x-mpegURL, */*";
          // Keep Accept-Encoding as identity for manifests
          headers["Accept-Encoding"] = "identity";
        }
        if (req.headers["range"]) {
          headers["Range"] = req.headers["range"];
        }
        if (accumulatedCookies.length > 0) {
          headers["Cookie"] = accumulatedCookies.join("; ");
        }

        const requestTimeout = isApiCall ? 60000 : 120000;

        const options: any = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers: headers,
          agent: parsedUrl.protocol === "https:" ? httpsAgent : httpAgent,
          timeout: requestTimeout,
        };

        // Force specific User-Agent for certain domains known to be picky with VOD
        if (!isApiCall && parsedUrl.hostname.includes("dndnscloud.ru")) {
          headers["User-Agent"] = "IPTVSmartersPlayer";
          headers["Accept"] = "*/*";
        }

        // For this provider's live endpoints, mimic Lavf and disable content
        // encoding to avoid problematic compressed responses / throttled variants.
        if (
          !isApiCall &&
          parsedUrl.hostname.includes("line.dndnscloud.ru") &&
          /\/live\//i.test(currentUrl)
        ) {
          headers["User-Agent"] = "Lavf/58.76.100";
          delete headers["Accept-Encoding"];
        }

        // If upstream redirected to a raw IP but the original request used a hostname,
        // preserve the original Host header and SNI (servername) so virtual-hosted
        // backends validate correctly.
        try {
          const parsedHost = parsedUrl.hostname;
          if (
            originalHost &&
            !isIpAddress(originalHost) &&
            isIpAddress(parsedHost)
          ) {
            headers["Host"] = originalHost;
            if (parsedUrl.protocol === "https:")
              options.servername = originalHost;
          }
        } catch (e) {
          /* ignore host-override errors */
        }

        const proxyReq = (
          parsedUrl.protocol === "https:" ? https : http
        ).request(options, (proxyRes) => {
          activeProxyRes = proxyRes;
          if (!canWriteBody(attemptId)) {
            proxyRes.destroy();
            return;
          }
          // Keep terminal output useful: suppress routine redirect noise (3xx)
          // and focus warnings on real upstream errors.
          try {
            const upstreamStatus = proxyRes.statusCode || 0;
            if (upstreamStatus >= 400 || upstreamStatus < 200) {
              console.warn(
                `[proxy] upstream ${upstreamStatus} for ${parsedUrl.hostname}${parsedUrl.pathname} (${proxyRes.headers["content-type"] || "unknown type"})`,
              );
            }
          } catch (e) {
            /* ignore logging errors */
          }
          // Accumulate cookies
          if (proxyRes.headers["set-cookie"]) {
            const newCookies = Array.isArray(proxyRes.headers["set-cookie"])
              ? proxyRes.headers["set-cookie"]
              : [proxyRes.headers["set-cookie"]];

            newCookies.forEach((cookieStr) => {
              const cookiePart = cookieStr.split(";")[0];
              if (cookiePart) {
                // Remove existing cookie with same name if it exists
                const cookieName = cookiePart.split("=")[0];
                accumulatedCookies = accumulatedCookies.filter(
                  (c) => !c.startsWith(cookieName + "="),
                );
                accumulatedCookies.push(cookiePart);
              }
            });
          }

          // Handle redirects
          if (
            proxyRes.statusCode &&
            proxyRes.statusCode >= 300 &&
            proxyRes.statusCode < 400 &&
            proxyRes.headers.location
          ) {
            if (redirectCount >= MAX_REDIRECTS) {
              if (isAttemptActive(attemptId)) res.status(502).send("Too many redirects");
              return;
            }
            redirectCount++;
            const redirectUrl = new URL(
              String(proxyRes.headers.location),
              currentUrl
            );

            // If we are being redirected to the EXACT SAME URL, it's a loop. Stop.
            if (redirectUrl.toString() === currentUrl) {
               if (isAttemptActive(attemptId)) res.status(508).send("Loop detected");
               proxyRes.destroy();
               return;
            }

            proxyRes.destroy();
            parsedUrl = redirectUrl;
            makeRequest(redirectUrl.toString());
            return;
          }

          // Unsupported / empty EPG endpoints should resolve to an empty payload
          // instead of surfacing red 404/502 noise in the browser console.
          const isShortEpgRequest =
            isApiCall && targetUrl.includes("action=get_short_epg");
          const isSimpleEpgRequest =
            isApiCall && targetUrl.includes("action=get_simple_data_table");
          const isXmltvRequest = /\/xmltv\.php(\?|$)/i.test(targetUrl);
          const isSoftEpgFailure = [404, 500, 502, 503, 504].includes(
            proxyRes.statusCode || 0,
          );

          if (isSoftEpgFailure && (isShortEpgRequest || isSimpleEpgRequest)) {
            if (isAttemptActive(attemptId)) {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.status(200).end('{"epg_listings":[]}');
            }
            proxyRes.destroy();
            return;
          }

          if (isSoftEpgFailure && isXmltvRequest) {
            if (isAttemptActive(attemptId)) {
              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.status(200).end("<tv></tv>");
            }
            proxyRes.destroy();
            return;
          }

          // Retry on standard server errors (500-504)
          if (
            proxyRes.statusCode &&
            proxyRes.statusCode >= 500 &&
            proxyRes.statusCode <= 504 &&
            retryCount < MAX_RETRIES
          ) {
            proxyRes.destroy();
            retryCount++;
            console.log(
              `[proxy] Upstream ${proxyRes.statusCode} for ${currentUrl}, retrying (${retryCount}/${MAX_RETRIES})...`,
            );
            scheduleRetry(800 * retryCount, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }

          // 400/401/403 on non-API media endpoints can be UA/header sensitive.
          // Rotate to the next fallback UA profile before failing hard.
          if (
            !isApiCall &&
            proxyRes.statusCode &&
            [400, 401, 403].includes(proxyRes.statusCode) &&
            !disableUaFallbackRotationForLive &&
            uaFallbackAttempt < fallbackUAs.length
          ) {
            uaFallbackAttempt++;
            proxyRes.destroy();
            scheduleRetry(350, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }

          // 551/509 = IPTV connection limit / bandwidth throttle. For stream
          // requests (not API calls), retry with progressively longer delays
          // so we don't hammer upstream while waiting for a slot.
          if (
            (proxyRes.statusCode === 551 || proxyRes.statusCode === 509) &&
            !isApiCall &&
            connLimitRetries < MAX_CONN_LIMIT_RETRIES
          ) {
            proxyRes.destroy();
            connLimitRetries++;
            // Use longer backoff for 509 (rate/bandwidth limits) than 551.
            const delay =
              proxyRes.statusCode === 509
                ? 4000 + (connLimitRetries - 1) * 3000
                : 2500 + (connLimitRetries - 1) * 2000;
            console.log(
              `[proxy] ${proxyRes.statusCode} connection limit for ${currentUrl}, waiting ${delay / 1000}s (${connLimitRetries}/${MAX_CONN_LIMIT_RETRIES})...`,
            );
            scheduleRetry(delay, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }

          // Prevent serving HTML as a video stream.
          // If we requested a video file but got text/html after all redirects, it's an error.
          const contentType = String(proxyRes.headers["content-type"] || "").toLowerCase();
          const isVideoRequest = !isApiCall && /\.(ts|mkv|mp4|avi|mov|m4v|m3u8)(\?|$)/i.test(targetUrl);
          if (isVideoRequest && contentType.includes("text/html") && (proxyRes.statusCode === 200 || proxyRes.statusCode === 302)) {
             console.warn(`[proxy] Aborting: received HTML instead of video for ${targetUrl}`);
             if (isAttemptActive(attemptId)) {
               res.status(403).send("Upstream returned HTML instead of video stream. Access denied or blocked.");
             }
             proxyRes.destroy();
             proxyReq.destroy();
             return;
          }

          let isM3U8 = false;
          const bodyChunks: Buffer[] = [];
          let isTooLarge = false;
          let dataReceived = false;

          proxyRes.once("data", (firstChunk) => {
            if (!canWriteBody(attemptId)) {
              proxyRes.destroy();
              return;
            }
            dataReceived = true;
            const chunkStr = firstChunk.toString(
              "utf8",
              0,
              Math.min(firstChunk.length, 10),
            );
            // If upstream returned a non-success status, log a short body preview
            // for diagnostics. Redirects are intentionally ignored to avoid log spam.
            try {
              const upstreamStatus = proxyRes.statusCode || 0;
              if (upstreamStatus >= 400 || upstreamStatus < 200) {
                const preview = firstChunk.toString(
                  "utf8",
                  0,
                  Math.min(firstChunk.length, 200),
                );
                console.warn(
                  `[proxy] upstream ${upstreamStatus} body preview for ${parsedUrl.hostname}${parsedUrl.pathname}: ${preview.slice(0, 120)}`,
                );
              }
            } catch (e) {
              /* ignore logging errors */
            }
            if (chunkStr.startsWith("#EXTM3U")) {
              isM3U8 = true;
            }

            if (
              !isM3U8 &&
              req.query.url &&
              (req.query.url as string).includes(".m3u8") &&
              !(req.query.force === "1" || req.query.bypassTypeCheck === "1")
            ) {
              console.log(
                "Server returned video stream but client requested M3U8. Aborting to trigger fallback.",
              );
              res
                .status(415)
                .end("Expected M3U8 playlist but received video stream");
              proxyReq.destroy();
              return;
            }

            if (
              isM3U8 &&
              req.query.url &&
              (req.query.url as string).includes(".ts") &&
              !(req.query.force === "1" || req.query.bypassTypeCheck === "1")
            ) {
              console.log(
                "Server returned M3U8 but client requested TS. Aborting to trigger fallback.",
              );
              res
                .status(415)
                .end("Expected video stream but received M3U8 playlist");
              proxyReq.destroy();
              return;
            }

            // Now send headers
            if (!isAttemptActive(attemptId)) {
              proxyRes.destroy();
              return;
            }
            res.status(proxyRes.statusCode || 500);

            // Forward relevant headers
            const headersToForward = [
              "content-type",
              "content-length",
              "content-range",
              "accept-ranges",
              "cache-control",
              "expires",
              "last-modified",
            ];

            headersToForward.forEach((h) => {
              if (proxyRes.headers[h]) {
                res.setHeader(h, proxyRes.headers[h] as string);
              }
            });

            const isImageRequest = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(
              currentUrl,
            );
            if (isImageRequest && !proxyRes.headers["cache-control"]) {
              res.setHeader(
                "Cache-Control",
                "public, max-age=86400, stale-while-revalidate=604800",
              );
            }

            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Expose-Headers", "*");

            // Explicitly set content-type for common formats if missing
            if (!proxyRes.headers["content-type"]) {
              if (currentUrl.includes(".mp4"))
                res.setHeader("Content-Type", "video/mp4");
              else if (currentUrl.includes(".m3u8"))
                res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
              else if (currentUrl.includes(".ts"))
                res.setHeader("Content-Type", "video/mp2t");
              else if (currentUrl.includes(".mkv"))
                res.setHeader("Content-Type", "video/x-matroska");
              else if (currentUrl.includes(".avi"))
                res.setHeader("Content-Type", "video/x-msvideo");
              else res.setHeader("Content-Type", "application/octet-stream");
            }

            if (isM3U8) {
              bodyChunks.push(firstChunk);

              proxyRes.on("data", (chunk: Buffer) => {
                if (!canWriteBody(attemptId)) {
                  proxyRes.destroy();
                  return;
                }
                const total = bodyChunks.reduce((s, c) => s + c.length, 0);
                if (isTooLarge) {
                  res.write(chunk);
                  return;
                }
                bodyChunks.push(chunk);
                if (total + chunk.length > 5 * 1024 * 1024) {
                  isTooLarge = true;
                  res.write(Buffer.concat(bodyChunks).toString("utf8"));
                  bodyChunks.length = 0;
                }
              });
            } else if (isApiCall) {
              // Collect API body for caching using Buffer array (O(n) not O(n²))
              bodyChunks.push(firstChunk);
              proxyRes.on("data", (chunk: Buffer) => {
                bodyChunks.push(chunk);
              });
            } else {
              // Binary/stream — pipe directly
              res.write(firstChunk);
              proxyRes.pipe(res);
            }
          });

          proxyRes.on("end", () => {
            if (!canWriteBody(attemptId) && !dataReceived) {
              return;
            }
            if (!dataReceived) {
              console.warn(
                `[proxy] no data from upstream (status=${proxyRes.statusCode}) for ${parsedUrl.hostname}${parsedUrl.pathname}`,
              );

              // If upstream returned nothing, try a User-Agent fallback sequence
              if (
                !disableUaFallbackRotationForLive &&
                uaFallbackAttempt < fallbackUAs.length
              ) {
                uaFallbackAttempt++;
                proxyRes.destroy();
                scheduleRetry(400, () => {
                  if (attemptId === currentAttemptId) makeRequest(currentUrl);
                });
                return;
              }

              if (isAttemptActive(attemptId)) {
                // For API calls, return a JSON error to aid client-side diagnostics instead
                if (isApiCall) {
                  res.status(502).json({
                    error: "Upstream ended without data",
                    upstreamStatus: proxyRes.statusCode || 0,
                    url: currentUrl,
                  });
                } else {
                  res.status(proxyRes.statusCode || 500);
                  res.setHeader("Access-Control-Allow-Origin", "*");
                  res.end();
                }
              }
              return;
            }
            if (!isM3U8 && !isApiCall) {
              // pipe() already handled it
              return;
            }
            if (isApiCall && !isTooLarge) {
              // Decompress if upstream honoured our Accept-Encoding, then cache + send
              const ct =
                (proxyRes.headers["content-type"] as string) ||
                "application/json";
              const raw = Buffer.concat(bodyChunks);
              const encoding = (
                (proxyRes.headers["content-encoding"] as string) || ""
              ).toLowerCase();

              const finalize = (body: string) => {
                if (!canWriteBody(attemptId)) return;
                apiCache.set(targetUrl, {
                  body,
                  contentType: ct,
                  ts: Date.now(),
                });
                scheduleCacheSave();
                res.removeHeader("content-length");
                res.removeHeader("content-encoding");
                res.send(body);
              };

              if (encoding === "gzip") {
                zlib.gunzip(raw, (err, result) => {
                  finalize(
                    err ? raw.toString("utf8") : result.toString("utf8"),
                  );
                });
              } else if (encoding === "deflate") {
                zlib.inflate(raw, (err, result) => {
                  finalize(
                    err ? raw.toString("utf8") : result.toString("utf8"),
                  );
                });
              } else {
                finalize(raw.toString("utf8"));
              }
              return;
            }

            if (isTooLarge) {
              if (!canWriteBody(attemptId)) return;
              res.end();
              return;
            }
            const body = Buffer.concat(bodyChunks).toString("utf8");
            const lines = body.split("\n");
            const rewrittenLines = lines.map((line) => {
              const trimmed = line.trim();
              // Rewrite media segment URIs
              if (trimmed && !trimmed.startsWith("#")) {
                try {
                  const absoluteUrl = new URL(trimmed, currentUrl).toString();
                  return `${req.protocol}://${req.get("host")}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                  return line;
                }
              }
              // Rewrite URIs inside tags (e.g., #EXT-X-KEY, #EXT-X-STREAM-INF)
              if (trimmed.startsWith("#EXT") && trimmed.includes('URI="')) {
                return line.replace(/URI="([^"]+)"/, (match, uri) => {
                  try {
                    const absoluteUrl = new URL(uri, currentUrl).toString();
                    return `URI="${req.protocol}://${req.get("host")}/api/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
                  } catch (e) {
                    return match;
                  }
                });
              }
              return line;
            });
            const rewrittenBody = rewrittenLines.join("\n");

            // Remove headers that are no longer valid
            res.removeHeader("content-length");
            res.removeHeader("content-encoding");
            res.removeHeader("transfer-encoding");

            if (!canWriteBody(attemptId)) return;
            res.send(rewrittenBody);
          });
        });

        proxyReq.on("error", (err: any) => {
          activeProxyReq = null;
          if (responseClosed || attemptId !== currentAttemptId) return;
          // Suppress noisy DNS errors for broken logo/image URLs
          if (err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
            if (isAttemptActive(attemptId)) res.status(404).end();
            return;
          }

          // Retry on temporary DNS failure
          if (err.code === "EAI_AGAIN" && redirectCount < 3) {
            redirectCount++;
            scheduleRetry(1000, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }

          const isTransientStreamError =
            !isApiCall &&
            ((typeof err.code === "string" &&
              ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(err.code)) ||
              /socket hang up|aborted|premature close|reset/i.test(
                String(err.message || ""),
              ));

          if (
            isTransientStreamError &&
            transientErrorRetries < MAX_TRANSIENT_ERROR_RETRIES
          ) {
            transientErrorRetries++;
            const delay = 1000 * transientErrorRetries;
            console.log(
              `[proxy] transient ${err.code || err.message} for ${currentUrl}, retrying in ${delay / 1000}s (${transientErrorRetries}/${MAX_TRANSIENT_ERROR_RETRIES})...`,
            );
            scheduleRetry(delay, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }

          console.error(`Proxy error for ${currentUrl}:`, err.message);

          if (isAttemptActive(attemptId)) {
            res.status(502).json({
              error: "Proxy failed",
              message: err.message,
              url: currentUrl,
            });
          }
        });

        proxyReq.on("timeout", () => {
          if (responseClosed || attemptId !== currentAttemptId) {
            proxyReq.destroy();
            return;
          }
          console.error("Proxy timeout:", currentUrl);
          proxyReq.destroy();
          if (!isApiCall && transientErrorRetries < MAX_TRANSIENT_ERROR_RETRIES) {
            transientErrorRetries++;
            const delay = 1000 * transientErrorRetries;
            console.log(
              `[proxy] timeout for ${currentUrl}, retrying in ${delay / 1000}s (${transientErrorRetries}/${MAX_TRANSIENT_ERROR_RETRIES})...`,
            );
            scheduleRetry(delay, () => {
              if (attemptId === currentAttemptId) makeRequest(currentUrl);
            });
            return;
          }
          if (isAttemptActive(attemptId)) {
            res.status(504).json({ error: "Proxy timeout", url: currentUrl });
          }
        });

        req.on("close", () => {
          proxyReq.destroy();
        });

        activeProxyReq = proxyReq;
        proxyReq.end();
      } catch (err: any) {
        console.error("Proxy setup error:", err.message);
        if (!res.headersSent) {
          res.status(400).json({ error: "Invalid URL", message: err.message });
        }
      }
    };

    makeRequest(targetUrl);
  });

  // Diagnostic endpoint: try multiple header profiles against an upstream URL
  app.get("/api/proxy-test", async (req, res) => {
    const targetUrl = String(req.query.url || "");
    if (!targetUrl) return res.status(400).json({ error: "No URL" });

    const profiles = [
      {
        name: "browser",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.5790.170 Safari/537.36",
          Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        },
      },
      {
        name: "vlc",
        headers: { "User-Agent": "VLC/3.0.18 LibVLC/3.0.18", Accept: "*/*" },
      },
      {
        name: "ffmpeg",
        headers: { "User-Agent": "Lavf/58.76.100", Accept: "*/*" },
      },
      {
        name: "mobile",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
          Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        },
      },
    ];

    const results: any[] = [];

    for (const p of profiles) {
      const start = Date.now();
      try {
        const parsedUrl = new URL(targetUrl);
        const headers: any = {
          ...(p.headers || {}),
          Connection: "keep-alive",
          "Accept-Encoding": "identity",
        };
        if (req.query.upstreamReferer)
          headers["Referer"] = String(req.query.upstreamReferer);
        // Attach a best-effort X-Forwarded-For
        if (req.ip) headers["X-Forwarded-For"] = String(req.ip);

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers,
          agent: parsedUrl.protocol === "https:" ? httpsAgent : httpAgent,
          timeout: 10000,
        };

        const proto = parsedUrl.protocol === "https:" ? https : http;

        const probe = await new Promise<any>((resolve, reject) => {
          const req2 = proto.request(options, (upRes) => {
            let preview = "";
            let got = false;
            upRes.once("data", (chunk: Buffer) => {
              got = true;
              try {
                preview = chunk.toString(
                  "utf8",
                  0,
                  Math.min(chunk.length, 1024),
                );
              } catch (e) {
                preview = "<binary>";
              }
              // destroy early — we only need the first bytes for diagnostics
              upRes.destroy();
            });
            upRes.on("close", () => {
              resolve({
                status: upRes.statusCode,
                headers: upRes.headers,
                preview,
                remoteAddress: upRes.socket?.remoteAddress,
                remotePort: upRes.socket?.remotePort,
                got,
              });
            });
          });
          req2.on("timeout", () => {
            req2.destroy();
            reject(new Error("timeout"));
          });
          req2.on("error", (err) => reject(err));
          req2.end();
        });

        results.push({ profile: p.name, tookMs: Date.now() - start, ...probe });
      } catch (err: any) {
        results.push({
          profile: p.name,
          error: String(err.message || err),
          tookMs: Date.now() - start,
        });
      }
    }

    const out = { url: targetUrl, ts: new Date().toISOString(), results };
    try {
      const outPath = path.join(
        __dirname,
        `test-output/probe-${Date.now()}.json`,
      );
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    } catch (e) {
      /* ignore write errors */
    }

    res.json(out);
  });

  // ─── Track detection & remux endpoints (require ffprobe/ffmpeg in PATH) ─────

  // GET /api/tracks?url=<rawIptvUrl>
  // Uses ffprobe to list all audio / subtitle / video streams in the media file.
  // Returns { streams: [...], available: bool }
  app.get("/api/tracks", async (req, res) => {
    const rawUrl = req.query.url as string;
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).json({ error: "No URL", streams: [], available: false });
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}`;
    try {
      const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "quiet", "-print_format", "json", "-show_streams", proxyUrl],
        { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
      );
      const data = JSON.parse(stdout);
      res.json({ streams: data.streams || [], available: true });
    } catch (e: any) {
      const isEnoent = e.code === "ENOENT" || String(e).includes("ENOENT");
      res.status(isEnoent ? 503 : 500).json({
        error: String(e.message || e),
        streams: [],
        available: false,
      });
    }
  });

  // GET /api/stream-ts?url=<rawIptvUrl>&seek=<seconds>&audio=<audioStreamIdx>
  // Fast-start stream endpoint: remux to MPEG-TS without transcoding.
  // Designed for smoother starts and timeline jumps on strict IPTV sources.
  app.get("/api/stream-ts", (req, res) => {
    const rawUrl = req.query.url as string;
    const seekSec = Math.max(0, parseFloat((req.query.seek as string) || "0") || 0);
    const audioIdx = Math.max(0, parseInt((req.query.audio as string) || "0", 10) || 0);

    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).send("No URL");

    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}`;
    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-fflags",
      "+genpts",
      ...(seekSec > 0 ? ["-ss", seekSec.toFixed(3)] : []),
      "-i",
      proxyUrl,
      "-map",
      "0:v:0?",
      "-map",
      `0:a:${audioIdx}?`,
      "-c",
      "copy",
      "-copyts",
      "-muxpreload",
      "0",
      "-muxdelay",
      "0",
      "-f",
      "mpegts",
      "pipe:1",
    ];

    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Duration", "0");
    // Intentionally omit Content-Length so the client plays progressively.

    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    ff.stderr.on("data", (d: Buffer) => {
      process.stdout.write(`[stream-ts] ${d.toString()}`);
    });
    ff.on("error", (e: Error) => {
      if (!res.headersSent) {
        res.status(500).send(String(e.message || e));
      }
    });
    ff.on("close", () => {
      try {
        if (!res.writableEnded) res.end();
      } catch {}
    });
    req.on("close", () => {
      try {
        ff.kill("SIGKILL");
      } catch {}
    });
  });

  // GET /api/remux?url=<rawIptvUrl>&audio=<audioStreamIdx>&subtitle=<subtitleStreamIdx>&seek=<seconds>&quality=<height>
  // Outputs a browser-safe fragmented MP4 with the selected audio track.
  // When quality is provided, video is transcoded/scaled down to that height.
  // When subtitle is provided, it is muxed into the output MP4 as mov_text.
  app.get("/api/remux", async (req, res) => {
    const rawUrl = req.query.url as string;
    const videoIdx = Math.max(0, parseInt((req.query.video as string) || "0"));
    const audioIdx = Math.max(0, parseInt((req.query.audio as string) || "0"));
    const subtitleRaw = req.query.subtitle as string | undefined;
    const subtitleIdx =
      subtitleRaw != null && subtitleRaw !== ""
        ? Math.max(0, parseInt(subtitleRaw || "0"))
        : -1;
    const seekSec = parseFloat((req.query.seek as string) || "0") || 0;
    const audioDelayMs = Math.max(
      -3000,
      Math.min(
        3000,
        parseInt((req.query.audioDelayMs as string) || "0", 10) || 0,
      ),
    );
    const qualityHeight = Math.max(0, parseInt((req.query.quality as string) || "0"));
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).send("No URL");
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}`;
    let remuxSubtitleIdx = subtitleIdx;
    if (subtitleIdx >= 0) {
      try {
        const { stdout } = await execFileAsync(
          "ffprobe",
          [
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-select_streams",
            "s",
            "-show_entries",
            "stream=index,codec_name,codec_type",
            "-show_streams",
            proxyUrl,
          ],
          { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
        );

        const data = JSON.parse(stdout || "{}");
        const subtitleStreams = Array.isArray(data?.streams)
          ? data.streams.filter((s: any) => s?.codec_type === "subtitle")
          : [];

        const pickedSubtitle = subtitleStreams[subtitleIdx];
        const subtitleCodec = String(pickedSubtitle?.codec_name || "").toLowerCase();

        // Only allow subtitle codecs that are known to remux safely to mov_text.
        // Bitmap/teletext-like subtitle codecs are excluded to avoid ffmpeg crashes.
        const safeSubtitleCodecs = new Set([
          "subrip",
          "srt",
          "ass",
          "ssa",
          "webvtt",
          "mov_text",
          "text",
          "ttml",
          "tx3g",
        ]);

        if (!pickedSubtitle || !safeSubtitleCodecs.has(subtitleCodec)) {
          remuxSubtitleIdx = -1;
          console.warn(
            `[remux] skipping unsupported subtitle codec before remux: ${subtitleCodec || "unknown"}`,
          );
        }
      } catch {
        remuxSubtitleIdx = -1;
        console.warn(
          "[remux] subtitle codec probe failed before remux, continuing without subtitle stream",
        );
      }
    }
    const transcodeVideo = qualityHeight > 0;
    const videoArgs = transcodeVideo
      ? [
          "-vf",
          `scale=-2:${qualityHeight}`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          qualityHeight >= 1080 ? "23" : qualityHeight >= 720 ? "25" : "27",
          "-pix_fmt",
          "yuv420p",
          "-profile:v",
          "main",
          "-level:v",
          "4.0",
        ]
      : ["-c:v", "copy"];
    const audioFilter =
      audioDelayMs > 0
        ? `adelay=${audioDelayMs}|${audioDelayMs}`
        : audioDelayMs < 0
          ? `atrim=start=${Math.abs(audioDelayMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS`
          : "";
    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-fflags",
      "+genpts",
      ...(seekSec > 0 ? ["-ss", seekSec.toFixed(3)] : []),
      "-i",
      proxyUrl,
      "-map",
      `0:v:${videoIdx}?`,
      "-map",
      `0:a:${audioIdx}?`,
      ...(remuxSubtitleIdx >= 0 ? ["-map", `0:s:${remuxSubtitleIdx}?`] : []),
      ...videoArgs,
      ...(audioFilter ? ["-af", audioFilter] : []),
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      qualityHeight > 0 && qualityHeight <= 480 ? "128k" : "160k",
      "-ar",
      "48000",
      ...(remuxSubtitleIdx >= 0
        ? ["-c:s", "mov_text", "-disposition:s:0", "default"]
        : []),
      "-avoid_negative_ts",
      "make_zero",
      "-muxpreload",
      "0",
      "-muxdelay",
      "0",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof+faststart+omit_tfhd_offset",
      "-f",
      "mp4",
      "pipe:1",
    ];
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");
    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    ff.stderr.on("data", (d: Buffer) =>
      process.stdout.write(`[remux] ${d.toString()}`),
    );
    ff.on("error", (e: Error) => {
      if (!res.headersSent) res.status(500).send(String(e));
    });
    req.on("close", () => {
      try {
        ff.kill("SIGKILL");
      } catch {}
    });
  });

  // GET /api/subtitle?url=<rawIptvUrl>&index=<subtitleStreamIdx>&format=vtt|srt
  // Extracts the specified subtitle stream and returns text subtitles as WebVTT or SRT.
  // Results are cached in-memory for fast subtitle switching.
  const subtitleCache = new Map<
    string,
    { text: string; contentType: string; ts: number }
  >();
  const subtitleInflight = new Map<string, Promise<string>>();
  const SUBTITLE_CACHE_TTL = 30 * 60 * 1000; // 30 min
  app.get("/api/subtitle", async (req, res) => {
    const rawUrl = req.query.url as string;
    const subIdx = Math.max(0, parseInt((req.query.index as string) || "0"));
    const seekSec = parseFloat((req.query.seek as string) || "0") || 0;
    const delayMs = Math.max(
      -8000,
      Math.min(8000, parseInt((req.query.delayMs as string) || "0", 10) || 0),
    );
    const format =
      String(req.query.format || "vtt").toLowerCase() === "srt"
        ? "srt"
        : "vtt";
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).send("No URL");
    const cacheKey = `${rawUrl}::${subIdx}::${seekSec.toFixed(3)}::${delayMs}::${format}`;
    const cached = subtitleCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SUBTITLE_CACHE_TTL) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.send(cached.text);
    }
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}`;
    try {
      const codecCandidates =
        format === "srt"
          ? ["srt", "subrip", "webvtt"]
          : ["webvtt", "srt"];

      const runExtract = async (codec: string) => {
        const { stdout } = await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            ...(seekSec > 0 ? ["-ss", seekSec.toFixed(3)] : []),
            "-i",
            proxyUrl,
            "-map",
            `0:s:${subIdx}`,
            "-c:s",
            codec,
            "-f",
            codec,
            "pipe:1",
          ],
          { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        );
        const normalized = (stdout || "").trim();
        const hasTimelineData =
          normalized.includes("-->") ||
          normalized.includes("Dialogue:") ||
          normalized.includes("[Script Info]");
        if (!normalized || !hasTimelineData) {
          throw new Error("Subtitle track is empty or not text-based");
        }
        return stdout;
      };

      const extraction =
        subtitleInflight.get(cacheKey) ||
        (async () => {
          let lastErr: unknown;
          for (const codec of codecCandidates) {
            try {
              return await runExtract(codec);
            } catch (e) {
              lastErr = e;
            }
          }
          throw lastErr || new Error("No subtitle codec extraction succeeded");
        })()
          .finally(() => {
            subtitleInflight.delete(cacheKey);
          });

      subtitleInflight.set(cacheKey, extraction);
      const stdout = await extraction;
      const normalized =
        format === "srt"
          ? stdout.startsWith("WEBVTT")
            ? vttToSrtText(stdout)
            : stdout
          : stdout.startsWith("WEBVTT")
            ? stdout
            : srtToVttText(stdout);
      const shifted =
        format === "srt"
          ? shiftSrt(normalized, delayMs)
          : shiftWebVtt(normalized, delayMs);
      const contentType =
        format === "srt"
          ? "application/x-subrip; charset=utf-8"
          : "text/vtt; charset=utf-8";
      subtitleCache.set(cacheKey, { text: shifted, contentType, ts: Date.now() });
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.send(shifted);
    } catch (e: any) {
      res
        .status(500)
        .send("Subtitle extraction failed: " + String(e.message || e));
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
