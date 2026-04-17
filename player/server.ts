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

    const makeRequest = (currentUrl: string) => {
      try {
        const parsedUrl = new URL(currentUrl);
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
          "User-Agent": clientUa || "VLC/3.0.18 LibVLC/3.0.18",
          // Prefer client's Accept header when available (helps m3u8 negotiation)
          Accept: (req.headers["accept"] as string) || "*/*",
          Connection: "keep-alive",
          // Ask upstream to gzip for API calls, but prefer identity for raw stream manifests
          "Accept-Encoding": isApiCall ? "gzip, deflate" : "identity",
        };

        // Forward a few common client headers that some providers check
        if (req.headers["referer"])
          headers["Referer"] = req.headers["referer"] as string;
        if (req.headers["origin"])
          headers["Origin"] = req.headers["origin"] as string;
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

        const options: any = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers: headers,
          agent: parsedUrl.protocol === "https:" ? httpsAgent : httpAgent,
          timeout: 60000, // Increased timeout to 60 seconds for live streams
        };

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
          // Log upstream status and headers for non-2xx responses to aid debugging
          try {
            const upstreamStatus = proxyRes.statusCode || 0;
            if (upstreamStatus < 200 || upstreamStatus >= 300) {
              console.log(
                `[proxy] upstream ${upstreamStatus} for ${currentUrl}`,
                {
                  host: parsedUrl.hostname,
                  path: parsedUrl.pathname + parsedUrl.search,
                  contentType: proxyRes.headers["content-type"],
                  headers: proxyRes.headers,
                  remoteAddress: proxyRes.socket?.remoteAddress,
                  remotePort: proxyRes.socket?.remotePort,
                },
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
              if (!res.headersSent) res.status(502).send("Too many redirects");
              return;
            }
            redirectCount++;
            const redirectUrl = new URL(
              proxyRes.headers.location,
              currentUrl,
            ).toString();
            makeRequest(redirectUrl);
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
            if (!res.headersSent) {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.status(200).end('{"epg_listings":[]}');
            }
            proxyRes.destroy();
            return;
          }

          if (isSoftEpgFailure && isXmltvRequest) {
            if (!res.headersSent) {
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
            setTimeout(() => makeRequest(currentUrl), 800 * retryCount);
            return;
          }

          // 551 = IPTV connection limit. For stream requests (not API calls),
          // retry with longer delays — a slot usually frees up in a few seconds.
          if (
            proxyRes.statusCode === 551 &&
            !isApiCall &&
            connLimitRetries < MAX_CONN_LIMIT_RETRIES
          ) {
            proxyRes.destroy();
            connLimitRetries++;
            // 2s wait per retry (4 retries = 8s total worst-case).
            const delay = 2000;
            console.log(
              `[proxy] 551 connection limit for ${currentUrl}, waiting ${delay / 1000}s (${connLimitRetries}/${MAX_CONN_LIMIT_RETRIES})...`,
            );
            setTimeout(() => makeRequest(currentUrl), delay);
            return;
          }

          let isM3U8 = false;
          const bodyChunks: Buffer[] = [];
          let isTooLarge = false;
          let dataReceived = false;

          proxyRes.once("data", (firstChunk) => {
            dataReceived = true;
            const chunkStr = firstChunk.toString(
              "utf8",
              0,
              Math.min(firstChunk.length, 10),
            );
            // If upstream returned a non-2xx status, log the first chunk for diagnostics
            try {
              const upstreamStatus = proxyRes.statusCode || 0;
              if (upstreamStatus < 200 || upstreamStatus >= 300) {
                const preview = firstChunk.toString(
                  "utf8",
                  0,
                  Math.min(firstChunk.length, 1024),
                );
                console.log(
                  `[proxy] upstream non-2xx first bytes for ${currentUrl}:`,
                  preview,
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
            if (!dataReceived) {
              console.log(
                `[proxy] upstream ended without data for ${currentUrl} (status=${proxyRes.statusCode})`,
                {
                  headers: proxyRes.headers,
                  remoteAddress: proxyRes.socket?.remoteAddress,
                  remotePort: proxyRes.socket?.remotePort,
                },
              );

              // If upstream returned nothing, try a User-Agent fallback sequence
              if (uaFallbackAttempt < fallbackUAs.length) {
                uaFallbackAttempt++;
                console.log(
                  `[proxy] no-data from upstream; retrying with alternative User-Agent (${uaFallbackAttempt}/${fallbackUAs.length}) for ${currentUrl}`,
                );
                proxyRes.destroy();
                setTimeout(() => makeRequest(currentUrl), 400);
                return;
              }

              if (!res.headersSent) {
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

            res.send(rewrittenBody);
          });
        });

        proxyReq.on("error", (err: any) => {
          // Suppress noisy DNS errors for broken logo/image URLs
          if (err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
            if (!res.headersSent) res.status(404).end();
            return;
          }

          // Retry on temporary DNS failure
          if (err.code === "EAI_AGAIN" && redirectCount < 3) {
            redirectCount++;
            setTimeout(() => makeRequest(currentUrl), 1000);
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
            setTimeout(() => makeRequest(currentUrl), delay);
            return;
          }

          console.error(`Proxy error for ${currentUrl}:`, err.message);

          if (!res.headersSent) {
            res.status(502).json({
              error: "Proxy failed",
              message: err.message,
              url: currentUrl,
            });
          }
        });

        proxyReq.on("timeout", () => {
          console.error("Proxy timeout:", currentUrl);
          proxyReq.destroy();
          if (!res.headersSent) {
            res.status(504).json({ error: "Proxy timeout", url: currentUrl });
          }
        });

        req.on("close", () => {
          proxyReq.destroy();
        });

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
