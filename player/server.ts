// Clean up duplicate /api/stream endpoints. Only one definition after app and PORT.
import fs from "fs";
import crypto from "crypto";
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
import { pipeline } from "stream/promises";

const execFileAsync = promisify(execFile);

// Run a command with comprehensive logging. Returns { stdout, stderr } on success or throws { code, stdout, stderr } on failure.
async function runLoggedCommand(cmd: string, args: string[], opts: { timeout?: number; signal?: AbortSignal; cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  const cmdText = `${cmd} ${args.map(a => JSON.stringify(a)).join(" ")}`;
  console.log(`[CMD] ${cmdText}`);
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", d => { try { stdout += d.toString(); } catch {} });
    if (child.stderr) child.stderr.on("data", d => { try { stderr += d.toString(); } catch {} });
    let timer: NodeJS.Timeout | null = null;
    if (opts.timeout && opts.timeout > 0) {
      timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {};
      }, opts.timeout);
    }
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        try { child.kill("SIGKILL"); } catch {};
      }, { once: true });
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      console.error(`[CMD] ${cmdText} ERROR: ${String(err?.message || err)}`);
      console.error(`SUBTITLE_EXTRACTION_FAILURE -- ${cmdText} -- (error event)`);
      reject({ code: -1, stdout, stderr: String(err?.message || err) + "\n" + stderr });
    });
    child.on("close", (code, _signal) => {
      if (timer) clearTimeout(timer);
      console.log(`[CMD] ${cmdText} exited with ${code}`);
      if (stdout && stdout.length < 10000) console.log(`[CMD] stdout:\n${stdout}`);
      if (stderr && stderr.length < 20000) console.log(`[CMD] stderr:\n${stderr}`);
      if (code === 0) return resolve({ stdout, stderr });
      console.error(`SUBTITLE_EXTRACTION_FAILURE -- ${cmdText} -- exit=${code}\n${stderr}`);
      reject({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runFfprobeJson(inputPath: string, signal?: AbortSignal): Promise<any> {
  const args = [
    "-v", "error",
    "-show_entries", "stream=index,codec_name,codec_type:stream_tags=language",
    "-of", "json",
    "-i", inputPath,
  ];
  try {
    const res = await runLoggedCommand("ffprobe", args, { signal, timeout: 60_000 });
    try { return JSON.parse(res.stdout || "{}"); } catch (e) { throw new Error(`ffprobe JSON parse error: ${String(e)}`); }
  } catch (e: any) {
    const errMsg = (e && typeof e === "object") ? (e.stderr || e.stdout || String(e)) : String(e);
    console.error(`SUBTITLE_EXTRACTION_FAILURE -- ffprobe ${inputPath} failed:\n${errMsg}`);
    throw e;
  }
}

/**
 * Map a user-provided subtitle index (frontend) to the absolute ffmpeg
 * stream index by probing the input. The frontend index may be either the
 * absolute stream index or the ordinal among subtitle streams — we support both.
 */
async function mapUserSubtitleIndexToAbsolute(inputUrl: string, userIndex: number, signal?: AbortSignal): Promise<number> {
  const data = await runFfprobeJson(inputUrl, signal);
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  // Try direct match: stream.index === userIndex and is subtitle
  for (const s of streams) {
    if (typeof s?.index === "number" && s.index === userIndex && String(s?.codec_type).toLowerCase() === "subtitle") {
      return s.index;
    }
  }
  // Otherwise, interpret userIndex as ordinal among subtitle streams
  const subtitleStreams = streams.filter((s: any) => String(s?.codec_type).toLowerCase() === "subtitle");
  if (userIndex >= 0 && userIndex < subtitleStreams.length) {
    return subtitleStreams[userIndex].index;
  }
  // As a final attempt, return -1 to indicate not found
  return -1;
}

// Helper to extract packet pts_time list for a subtitle stream (used by OCR flow)
async function getSubtitlePacketTimes(inputUrl: string, absSubIndex: number, maxPackets = 300, signal?: AbortSignal): Promise<number[]> {
  const args = [
    "-v", "error",
    "-select_streams", `s:${absSubIndex}`,
    "-show_entries", "packet=pts_time",
    "-of", "csv=p=0",
    "-i", inputUrl,
  ];
  try {
    const res = await runLoggedCommand("ffprobe", args, { signal, timeout: 60_000 });
    const lines = (res.stdout || "").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const times: number[] = [];
    for (const l of lines) {
      if (times.length >= maxPackets) break;
      const v = parseFloat(l);
      if (!Number.isFinite(v)) continue;
      times.push(v);
    }
    return times;
  } catch (e) {
    console.warn(`[subtitle] failed to get packet times for s:${absSubIndex} -> ${String(e)}`);
    return [];
  }
}

// OCR using tesseract CLI (falls back if not installed). Returns recognized text or empty string.
async function ocrImageToText(imagePath: string, lang = "eng"): Promise<string> {
  try {
    const args = [imagePath, "stdout", "-l", lang];
    const { stdout } = await runLoggedCommand("tesseract", args, { timeout: 30_000 });
    return String(stdout || "").trim();
  } catch (e: any) {
    console.warn(`[subtitle][ocr] tesseract failed for ${imagePath}: ${String(e?.stderr || e?.stdout || e?.message || e)}`);
    throw e;
  }
}

import { createProxyMiddleware } from "http-proxy-middleware";

// Prefer IPv4 on Windows to avoid slow IPv6 probe timeouts
dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBTITLE_CACHE_DIR = path.join(__dirname, "cache", "subtitles");

try {
  fs.mkdirSync(SUBTITLE_CACHE_DIR, { recursive: true });
} catch {}

// Feature flags: make disk writes opt-in to avoid creating test/persistent files
const ENABLE_PERSISTENT_SUBTITLES = String(process.env.ENABLE_PERSISTENT_SUBTITLES || "0") === "1";
const ENABLE_TEST_OUTPUT = String(process.env.ENABLE_TEST_OUTPUT || "0") === "1";

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
  // Accept 1-2 digit hours as well as fully-padded 2-digit HH:MM:SS timestamps.
  const body = cleaned.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}),(\d{3})/g,
    (_, s1, s2, e1, e2) => {
      const pad = (t: string) => t.length === 7 ? `0${t}` : t; // ensure HH:MM:SS
      return `${pad(s1)}.${s2} --> ${pad(e1)}.${e2}`;
    },
  );
  return `WEBVTT\n\n${body}\n`;
}

function vttToSrtText(vtt: string): string {
  const cleaned = (vtt || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!cleaned) return "";
  const withoutHeader = cleaned.replace(/^WEBVTT[^\n]*\n+/i, "");
  // Accept 1-2 digit hours.
  return withoutHeader.replace(
    /(\d{1,2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2})\.(\d{3})/g,
    (_, s1, s2, e1, e2) => {
      const pad = (t: string) => t.length === 7 ? `0${t}` : t;
      return `${pad(s1)},${s2} --> ${pad(e1)},${e2}`;
    },
  );
}

function getSubtitleCachePaths(rawUrl: string, subIdx: number) {
  const digest = crypto
    .createHash("sha1")
    .update(`${rawUrl}::${subIdx}`)
    .digest("hex");
  return {
    digest,
    vttPath: path.join(SUBTITLE_CACHE_DIR, `${digest}.vtt`),
    srtPath: path.join(SUBTITLE_CACHE_DIR, `${digest}.srt`),
  };
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
  const PORT: number = Number(process.env.PORT || 4000);

  // Register /api/stream endpoint immediately after app is declared
  app.get("/api/stream", (req, res) => {
    const rawUrl = req.query.url as string;
    const seekSec = Math.max(0, parseFloat((req.query.seek as string) || "0") || 0);
    const audioIdx = Math.max(0, parseInt((req.query.audio as string) || "0", 10) || 0);
    const videoIdx = Math.max(0, parseInt((req.query.video as string) || "0", 10) || 0);
    const format = String(req.query.format || "mkv").toLowerCase() === "mp4" ? "mp4" : "matroska";
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).send("No URL");
    const ownerFlag = String(req.query.owner || "") === "1" ? "1" : "0";
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}&owner=${ownerFlag}`;
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-fflags", "+genpts",
      ...(seekSec > 0 ? ["-ss", seekSec.toFixed(3)] : []),
      "-i", proxyUrl,
      "-map", `0:v:${videoIdx}?`,
      "-map", `0:a:${audioIdx}?`,
      "-c:v", "copy",
      "-c:a", "copy",
      "-avoid_negative_ts", "make_zero",
      "-f", format,
      "pipe:1",
    ];
    if (format === "mp4") {
      res.setHeader("Content-Type", "video/mp4");
    } else {
      res.setHeader("Content-Type", "video/x-matroska");
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    console.log(`[CMD] ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')}`);
    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    let _ff_stderr = "";
    ff.stderr.on("data", (d) => {
      const s = d.toString();
      _ff_stderr += s;
      process.stdout.write(`[stream] ${s}`);
    });
    ff.on("error", (e) => {
      if (!res.headersSent) {
        res.status(500).send(String(e.message || e));
      }
    });
    ff.on("close", (code) => {
      if (code && code !== 0) {
        console.error(`SUBTITLE_EXTRACTION_FAILURE -- ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')} exit=${code}\n${_ff_stderr}`);
      }
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

  app.use(express.json());
  app.use("/cache/subtitles", express.static(SUBTITLE_CACHE_DIR));

  const redactStreamUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      // Hide sensitive path tokens while preserving host + rough shape.
      const maskedPath = parsed.pathname
        .replace(/\/[A-Za-z0-9+/=]{16,}(?=\/|$)/g, "/<token>")
        .replace(/\/(\d{5,})(?=\/|$)/g, "/<id>");
      return `${parsed.protocol}//${parsed.host}${maskedPath}`;
    } catch {
      return value;
    }
  };

  app.post("/api/playback-debug", (req, res) => {
    try {
      const body = req.body || {};
      const event = typeof body.event === "string" ? body.event : "unknown";
      const level =
        body.level === "warn" || body.level === "error" ? body.level : "info";
      const payload =
        body.payload && typeof body.payload === "object"
          ? { ...(body.payload as Record<string, unknown>) }
          : {};

      if (typeof payload.url === "string") {
        payload.url = redactStreamUrl(payload.url);
      }
      if (typeof payload.streamUrl === "string") {
        payload.streamUrl = redactStreamUrl(payload.streamUrl);
      }

      const serialized = JSON.stringify(payload);
      const clipped = serialized.length > 2500
        ? `${serialized.slice(0, 2500)}...<truncated>`
        : serialized;

      const tag =
        level === "error" ? "[player-debug][error]" :
        level === "warn" ? "[player-debug][warn]" :
        "[player-debug][info]";

      console.log(`${tag} ${event} ${clipped}`);
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

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

    // Only treat requests explicitly marked with owner=1 as the dedup 'owner'.
    // This prevents background requests (like subtitle prefetch/extract) from
    // cancelling the active playback connection when upstream providers limit
    // to a single backend connection.
    const isOwnerFlag = String(req.query.owner || "") === "1";
    const dedupKey = !isApiCall && isOwnerFlag ? targetUrl : null;
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
      "IPTVSmartersPlayer",
      "VLC/3.0.18 LibVLC/3.0.18",
      "Lavf/58.76.100",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    ];
    let uaFallbackAttempt = 0;
    const isLivePath = /\/live\//i.test(targetUrl);
    const isVodOrSeriesRequest =
      /\/(movie|series)\//i.test(targetUrl) ||
      /\.(mkv|mp4|avi|mov|m4v|wmv|webm|flv)(\?|$)/i.test(targetUrl);
    // Keep live-TV anti-hammering behavior, but allow VOD/series URLs that
    // happen to redirect through /live/play token paths to rotate UA profiles.
    const disableUaFallbackRotationForLive =
      isLivePath && !isVodOrSeriesRequest;

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
          // Always use identity — IPTV servers send malformed chunked/gzip responses
          // that confuse Node.js's HTTP parser. identity avoids all decompression.
          "Accept-Encoding": "identity",
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
          else headers["Referer"] = `${parsedUrl.protocol}//${parsedUrl.host}/`;
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
        const incomingRange = req.get("range");
        if (incomingRange) {
          headers["Range"] = incomingRange;
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
          // Non-API stream requests use agent:false so every request gets a fresh
          // TCP connection. IPTV servers commonly send ECONNRESET when they receive
          // a keep-alive pooled socket — they expect each media request to be independent.
          agent: isApiCall
            ? (parsedUrl.protocol === "https:" ? httpsAgent : httpAgent)
            : false,
          timeout: requestTimeout,
        };

        // Force specific User-Agent for certain domains known to be picky with VOD
        if (!isApiCall && parsedUrl.hostname.includes("dndnscloud.ru")) {
          headers["User-Agent"] = "IPTVSmartersPlayer";
          headers["Accept"] = "*/*";
        }

        // For this provider's live endpoints, mimic Lavf exactly:
        // send only the headers a real player sends, nothing that signals a proxy.
        if (
          !isApiCall &&
          parsedUrl.hostname.includes("line.dndnscloud.ru") &&
          /\/live\//i.test(currentUrl)
        ) {
          headers["User-Agent"] = "Lavf/58.76.100";
          delete headers["Accept-Encoding"];
          delete headers["Referer"];
          delete headers["Origin"];
          delete headers["Accept-Language"];
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

            // Ensure byte-range semantics are explicit for media requests.
            if (incomingRange) {
              if (proxyRes.headers["content-range"]) {
                res.setHeader(
                  "content-range",
                  proxyRes.headers["content-range"] as string,
                );
              }
              if (!proxyRes.headers["accept-ranges"]) {
                res.setHeader("accept-ranges", "bytes");
              }
            }

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
      if (ENABLE_TEST_OUTPUT) {
        const outPath = path.join(
          __dirname,
          `test-output/probe-${Date.now()}.json`,
        );
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
      }
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
    
    const cacheKey = rawUrl.split("?")[0];
    if (trackCache.has(cacheKey)) {
      console.log(`[tracks] memory cache hit for ${redactStreamUrl(rawUrl)}`);
      return res.json(trackCache.get(cacheKey));
    }

    const { digest } = getSubtitleCachePaths(rawUrl, 0);
    const diskCachePath = path.join(SUBTITLE_CACHE_DIR, `tracks-${digest}.json`);
    if (fs.existsSync(diskCachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(diskCachePath, "utf8"));
        trackCache.set(cacheKey, data);
        console.log(`[tracks] disk cache hit for ${redactStreamUrl(rawUrl)}`);
        return res.json(data);
      } catch {}
    }

    const ownerFlag = String(req.query.owner || "") === "1" ? "1" : "0";
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}&owner=${ownerFlag}`;
    try {
      const probeRes = await runLoggedCommand("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", proxyUrl], { timeout: 30_000 });
      const data = JSON.parse(probeRes.stdout || "{}");
      const response = { streams: data.streams || [], available: true };
      trackCache.set(cacheKey, response);
      try {
        if (ENABLE_PERSISTENT_SUBTITLES) {
          fs.mkdirSync(path.dirname(diskCachePath), { recursive: true });
          fs.writeFileSync(diskCachePath, JSON.stringify(response), "utf8");
        }
      } catch {}
      res.json(response);
    } catch (e: any) {
      const errMsg = String((e && (e.stderr || e.stdout)) || e.message || e);
      const isEnoent = String(errMsg).includes("ENOENT");
      res.status(isEnoent ? 503 : 500).json({ error: errMsg, streams: [], available: false });
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

    const ownerFlag = String(req.query.owner || "") === "1" ? "1" : "0";
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}&owner=${ownerFlag}`;
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
      `0:${audioIdx}?`,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "192k",
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

    console.log(`[CMD] ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')}`);
    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    let _ff_ts_stderr = "";
    ff.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      _ff_ts_stderr += s;
      process.stdout.write(`[stream-ts] ${s}`);
    });
    ff.on("error", (e: Error) => {
      if (!res.headersSent) {
        res.status(500).send(String(e.message || e));
      }
    });
    ff.on("close", (code) => {
      if (code && code !== 0) {
        console.error(`SUBTITLE_EXTRACTION_FAILURE -- ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')} exit=${code}\n${_ff_ts_stderr}`);
      }
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
    const subtitleCodecHint = String(req.query.subCodec || "").toLowerCase().trim();
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
    // Mark remux as owner=1 so it can take over the single upstream connection
    // from previous playback streams on strict IPTV providers.
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}&owner=1`;
    let remuxSubtitleIdx = subtitleIdx;
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
    if (subtitleIdx >= 0) {
      if (subtitleCodecHint && safeSubtitleCodecs.has(subtitleCodecHint)) {
        // Frontend already knows this subtitle stream codec from /api/tracks.
        // Skip probe to avoid an extra upstream connection + startup delay.
      } else {
      try {
        const probe = await runLoggedCommand("ffprobe", [
          "-v", "quiet",
          "-print_format", "json",
          "-select_streams", "s",
          "-show_entries", "stream=index,codec_name,codec_type",
          "-show_streams",
          proxyUrl,
        ], { timeout: 20_000 });
        const data = JSON.parse(probe.stdout || "{}");
        const pickedSubtitle = Array.isArray(data?.streams)
          ? data.streams.find(
              (s: any) => s?.codec_type === "subtitle" && Number(s?.index) === subtitleIdx,
            )
          : null;
        const subtitleCodec = String(pickedSubtitle?.codec_name || "").toLowerCase();

        // Only allow subtitle codecs that are known to remux safely to mov_text.
        // Bitmap/teletext-like subtitle codecs are excluded to avoid ffmpeg crashes.
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
      `0:${audioIdx}?`,
      ...(remuxSubtitleIdx >= 0 ? ["-map", `0:${remuxSubtitleIdx}?`] : []),
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
    console.log(`[CMD] ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')}`);
    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    let _ff_remux_stderr = "";
    ff.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      _ff_remux_stderr += s;
      process.stdout.write(`[remux] ${s}`);
    });
    ff.on("error", (e: Error) => {
      if (!res.headersSent) res.status(500).send(String(e));
    });
    ff.on("close", (code) => {
      if (code && code !== 0) {
        console.error(`SUBTITLE_EXTRACTION_FAILURE -- ffmpeg ${args.map(a => JSON.stringify(a)).join(' ')} exit=${code}\n${_ff_remux_stderr}`);
      }
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
  const trackCache = new Map<string, any>();
  const subtitleInflight = new Map<string, Promise<string>>();
  const SUBTITLE_CACHE_TTL = 30 * 60 * 1000; // 30 min in-memory response cache

  // Global semaphore: only 1 FFmpeg subtitle extraction runs at a time.
  // Multiple parallel processes compete for bandwidth and cause video stuttering.
  let ffmpegActiveCount = 0;
  const MAX_FFMPEG_CONCURRENT = 1;
  const ffmpegWaitQueue: Array<() => void> = [];
  const acquireFFmpegSlot = (): Promise<void> => {
    if (ffmpegActiveCount < MAX_FFMPEG_CONCURRENT) {
      ffmpegActiveCount++;
      return Promise.resolve();
    }
    return new Promise(resolve => ffmpegWaitQueue.push(resolve));
  };
  const releaseFFmpegSlot = () => {
    const next = ffmpegWaitQueue.shift();
    if (next) {
      next();
    } else {
      ffmpegActiveCount--;
    }
  };
  app.get("/api/subtitle", async (req, res) => {
    const rawUrl = req.query.url as string;
    const contentTitle = req.query.title as string || "Unknown Content";
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
    const isPrefetchOnly =
      req.query.prefetch === "1" || req.query.background === "1";
    
    if (isPrefetchOnly) {
      console.log(
        `[subtitle] PREFETCH request: track ${subIdx} for "${contentTitle}" (${redactStreamUrl(rawUrl)})`,
      );
    }
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!rawUrl) return res.status(400).send("No URL");
    const extractionKey = `${rawUrl}::${subIdx}`;
    const responseCacheKey = `${extractionKey}::${format}::${delayMs}`;
    const proxyUrl = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(rawUrl)}`;

    const parseClockToSeconds = (value: string): number => {
      const normalized = String(value || "").trim().replace(",", ".");
      if (!normalized) return 0;
      const parts = normalized.split(":");
      if (parts.length === 3) {
        const [h, m, sec] = parts;
        const s = parseFloat(sec);
        if (!Number.isFinite(s)) return 0;
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + s;
      }
      if (parts.length === 2) {
        const [m, sec] = parts;
        const s = parseFloat(sec);
        if (!Number.isFinite(s)) return 0;
        return parseInt(m, 10) * 60 + s;
      }
      return 0;
    };

    const getSubtitleCoverageSeconds = (text: string): number => {
      const source = String(text || "");
      const tsRe = /((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{2,3})/g;
      let maxEnd = 0;
      let match: RegExpExecArray | null;
      while ((match = tsRe.exec(source)) !== null) {
        const end = parseClockToSeconds(match[2]);
        if (end > maxEnd) maxEnd = end;
      }
      return maxEnd;
    };

    const parseDurationTagToSeconds = (raw: unknown): number => {
      if (typeof raw !== "string") return 0;
      const value = raw.trim();
      if (!value) return 0;
      const parts = value.split(":");
      if (parts.length === 3) {
        const [h, m, sec] = parts;
        const s = parseFloat(sec);
        if (!Number.isFinite(s)) return 0;
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + s;
      }
      return 0;
    };

    const getEstimatedDurationSeconds = (): number => {
      const key = rawUrl.split("?")[0];
      const cachedTracks = trackCache.get(key);
      const streams = Array.isArray(cachedTracks?.streams) ? cachedTracks.streams : [];
      const videoStream = streams.find((s: any) => s?.codec_type === "video");
      const audioStream = streams.find((s: any) => s?.codec_type === "audio");
      const videoDuration = parseDurationTagToSeconds(videoStream?.tags?.DURATION);
      if (videoDuration > 0) return videoDuration;
      const audioDuration = parseDurationTagToSeconds(audioStream?.tags?.DURATION);
      if (audioDuration > 0) return audioDuration;
      return 0;
    };

    const isLikelyPartialSubtitleCache = (text: string): boolean => {
      const coverage = getSubtitleCoverageSeconds(text);
      const expected = getEstimatedDurationSeconds();
      if (!(coverage > 0 && expected > 0)) return false;
      return coverage < Math.max(120, expected * 0.8);
    };

    const clientSubtitleUa = String(
      (req.query.ua as string) ||
        (req.headers["user-agent"] as string) ||
        "VLC/3.0.18 LibVLC/3.0.18",
    )
      .replace(/[\r\n]+/g, " ")
      .trim();
    const clientSubtitleReferer = String(
      req.query.upstreamReferer || req.headers["referer"] || "",
    )
      .replace(/[\r\n]+/g, " ")
      .trim();
    const requestAbortController = new AbortController();
    const abortExtraction = () => {
      if (!requestAbortController.signal.aborted) {
        requestAbortController.abort();
      }
    };
    req.on("close", abortExtraction);

    const { digest, vttPath, srtPath } = getSubtitleCachePaths(rawUrl, subIdx);
    const vttUrl = `/cache/subtitles/${digest}.vtt`;
    const srtUrl = `/cache/subtitles/${digest}.srt`;

    // [New] Cache check mode: returns cached/extracting state without blocking.
    if (req.query.check === "1") {
      const fullExists = fs.existsSync(vttPath) || fs.existsSync(srtPath) || subtitleCache.has(responseCacheKey);
      const partialVttPath = path.join(SUBTITLE_CACHE_DIR, `${digest}.partial.vtt`);
      const partialSrtPath = path.join(SUBTITLE_CACHE_DIR, `${digest}.partial.srt`);
      const partialDiskPath = format === "srt" ? partialSrtPath : partialVttPath;
      const partialExists = !fullExists && fs.existsSync(partialDiskPath);
      const exists = fullExists || partialExists;
      const extracting = subtitleInflight.has(extractionKey);
      return res.json({ ok: true, cached: exists, extracting: extracting || partialExists, partial: partialExists && !fullExists });
    }

    const cached = subtitleCache.get(responseCacheKey);
    if (cached && Date.now() - cached.ts < SUBTITLE_CACHE_TTL) {
      console.log(`[subtitle] memory cache hit for "${contentTitle}"`);
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.send(cached.text);
    }

    // Increase MKV header probe size for subtitle extraction (10MB)
    const SUBTITLE_HEADER_READ_LIMIT_BYTES = 10 * 1024 * 1024;

    const downloadSubtitleHeaderToTemp = async (
      signal?: AbortSignal,
      probeSizeBytes: number = SUBTITLE_HEADER_READ_LIMIT_BYTES,
    ): Promise<string> => {
      const tmpDir = path.join(SUBTITLE_CACHE_DIR, "tmp");
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
      } catch {}

      const tempFilePath = path.join(
        tmpDir,
        `temp_header_${digest}_${process.pid}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}.mkv`,
      );
      const writer = fs.createWriteStream(tempFilePath);
      try {
        const response = await axios.get(proxyUrl, {
          responseType: "stream",
          timeout: 30_000,
          maxRedirects: 5,
          signal,
          httpAgent,
          httpsAgent,
          decompress: false,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: {
            "User-Agent": clientSubtitleUa,
            Accept: "*/*",
            Connection: "keep-alive",
            "Accept-Encoding": "identity",
            ...(clientSubtitleReferer ? { Referer: clientSubtitleReferer } : {}),
            Range: `bytes=0-${probeSizeBytes - 1}`,
          },
        });

        await pipeline(response.data, writer);

        const stat = fs.statSync(tempFilePath);
        if (!stat.size) {
          throw new Error("Empty MKV header download");
        }
        return tempFilePath;
      } catch (error) {
        try {
          writer.destroy();
        } catch {}
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
        throw error;
      }
    };
    try {
      // Allow clients to discover subtitle streams and absolute stream indices.
      // Example: GET /api/subtitle-streams?url=... will return [{ index, codec_name, codec_type, tags }]
      app.get("/api/subtitle-streams", async (r2, s2) => {
        const raw = String(r2.query.url || "");
        if (!raw) return s2.status(400).json({ ok: false, error: "No url" });
        try {
          const proxy = `http://127.0.0.1:${PORT}/api/proxy?url=${encodeURIComponent(raw)}`;
          const probe = await runFfprobeJson(proxy);
          const streams = Array.isArray(probe?.streams) ? probe.streams : [];
          const subs = streams.filter((x: any) => String(x?.codec_type).toLowerCase() === "subtitle");
          return s2.json({ ok: true, streams: subs.map((st: any) => ({ index: st.index, codec_name: st.codec_name, codec_type: st.codec_type, tags: st.tags || {} })) });
        } catch (e: any) {
          return s2.status(500).json({ ok: false, error: String(e?.message || e) });
        }
      });
      const usePersistentFile = ENABLE_PERSISTENT_SUBTITLES;
      if (usePersistentFile) {
        const diskPath = format === "srt" ? srtPath : vttPath;
        if (fs.existsSync(diskPath)) {
          const baseText = fs.readFileSync(diskPath, "utf8");
          if (!isLikelyPartialSubtitleCache(baseText)) {
            console.log(`[subtitle] disk cache hit for "${contentTitle}"`);
            const shiftedFromDisk =
              format === "srt"
                ? shiftSrt(baseText, delayMs)
                : shiftWebVtt(baseText, delayMs);
            const diskContentType =
              format === "srt"
                ? "application/x-subrip; charset=utf-8"
                : "text/vtt; charset=utf-8";
            subtitleCache.set(responseCacheKey, {
              text: shiftedFromDisk,
              contentType: diskContentType,
              ts: Date.now(),
            });
            res.setHeader("Content-Type", diskContentType);
            res.setHeader("Cache-Control", "public, max-age=1800");
            return res.send(shiftedFromDisk);
          }
          console.warn(`[subtitle] stale partial disk cache ignored for "${contentTitle}"`);
        }

        const otherPath = format === "srt" ? vttPath : srtPath;
        if (fs.existsSync(otherPath)) {
          const otherText = fs.readFileSync(otherPath, "utf8");
          const converted =
            format === "srt"
              ? vttToSrtText(otherText)
              : otherText.startsWith("WEBVTT")
                ? otherText
                : srtToVttText(otherText);
          if (!isLikelyPartialSubtitleCache(converted)) {
            console.log(`[subtitle] alternate disk cache hit for "${contentTitle}"`);
            const shiftedFromOther =
              format === "srt"
                ? shiftSrt(converted, delayMs)
                : shiftWebVtt(converted, delayMs);
            const otherContentType =
              format === "srt"
                ? "application/x-subrip; charset=utf-8"
                : "text/vtt; charset=utf-8";
            subtitleCache.set(responseCacheKey, {
              text: shiftedFromOther,
              contentType: otherContentType,
              ts: Date.now(),
            });
            res.setHeader("Content-Type", otherContentType);
            res.setHeader("Cache-Control", "public, max-age=1800");
            return res.send(shiftedFromOther);
          }
          console.warn(`[subtitle] stale partial alternate cache ignored for "${contentTitle}"`);
        }

        // Serve partial subtitle data saved during a previous background extraction
        // attempt. This gives the client something to display immediately while a
        // full-stream extraction is still running in the background.
        const partialVttPath = path.join(SUBTITLE_CACHE_DIR, `${digest}.partial.vtt`);
        const partialSrtPath = path.join(SUBTITLE_CACHE_DIR, `${digest}.partial.srt`);
        const partialDiskPath = format === "srt" ? partialSrtPath : partialVttPath;
        if (fs.existsSync(partialDiskPath)) {
          const partialText = fs.readFileSync(partialDiskPath, "utf8");
          if (partialText && (partialText.includes("-->") || partialText.includes("Dialogue:"))) {
            console.log(`[subtitle] serving partial cache for "${contentTitle}" (full extraction may be running)`);
            const shiftedPartial = format === "srt" ? shiftSrt(partialText, delayMs) : shiftWebVtt(partialText, delayMs);
            const partialContentType = format === "srt" ? "application/x-subrip; charset=utf-8" : "text/vtt; charset=utf-8";
            res.setHeader("Content-Type", partialContentType);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(shiftedPartial);
          }
        }
      }

      // Enhanced extraction pipeline that uses dynamic ffprobe mapping,
      // exhaustive fallback across subtitle streams and optional OCR for
      // image-based subtitle codecs (PGS/VobSub).
      const runExtract = async (
        plan: {
          name: string;
          inputUrl: string;
          mapExpr: string;
          codec: "webvtt" | "srt" | "subrip";
          format: "webvtt" | "srt";
          httpSeek?: boolean;
          seekSec?: number;
        },
        options?: { signal?: AbortSignal; lowBandwidth?: boolean },
      ) => {
        console.log(`[subtitle] extraction attempt: ${plan.name} for "${contentTitle}"`);
        const lowBandwidthMode = Boolean(options?.lowBandwidth);
        const lowDur = Math.max(3, Math.min(30, parseInt(String(req.query.duration || "9"), 10) || 9));
        const preInputArgs: string[] = [];
        if (lowBandwidthMode && typeof plan.seekSec === "number" && plan.seekSec > 0) {
          preInputArgs.push("-ss", plan.seekSec.toFixed(3));
        }
        // Main extraction args
        let ffmpegArgs = [
          "-hide_banner",
          "-loglevel", "error",
          "-probesize", lowBandwidthMode ? "8M" : "100M",
          "-analyzeduration", lowBandwidthMode ? "8M" : "100M",
          ...preInputArgs,
          "-i", plan.inputUrl,
          ...(lowBandwidthMode ? ["-t", String(lowDur)] : []),
          "-map", plan.mapExpr,
          "-vn", "-an",
          "-c:s", plan.codec,
          "-f", plan.format,
          "pipe:1",
        ];
        const timeoutMs = lowBandwidthMode ? Math.max(30_000, lowDur * 2000) : 600_000;
        await acquireFFmpegSlot();
        let stdout = "";
        let tempHeaderPath: string | null = null;
        let cleanupTemp = false;
        try {
          if (lowBandwidthMode || plan.httpSeek) {
            try {
              tempHeaderPath = await downloadSubtitleHeaderToTemp(options?.signal, 10 * 1024 * 1024);
              cleanupTemp = true;
            } catch (e) {
              tempHeaderPath = null;
              cleanupTemp = false;
            }
          }
          const inputForFfmpeg = tempHeaderPath || plan.inputUrl;
          const finalArgs = ffmpegArgs.map(a => a === plan.inputUrl ? inputForFfmpeg : a);
          try {
            const result = await runLoggedCommand("ffmpeg", finalArgs, { timeout: timeoutMs, signal: options?.signal });
            stdout = result.stdout;
          } catch (err: any) {
            const stderr = String(err?.stderr || err?.stdout || err?.message || err || "");
            console.error(`[subtitle] ffmpeg extraction failed (plan=${plan.name})\nArgs: ${finalArgs.join(" ")}\nStderr: ${stderr}`);
            // Fallback: try with -analyzeduration/probesize 50M if not already tried
            if (!lowBandwidthMode && (!ffmpegArgs.includes("50M") || !ffmpegArgs.includes("-analyzeduration"))) {
              const fallbackArgs = [
                "-hide_banner", "-loglevel", "error",
                "-probesize", "50M", "-analyzeduration", "50M",
                ...preInputArgs,
                "-i", inputForFfmpeg,
                "-map", plan.mapExpr,
                "-vn", "-an",
                "-c:s", "webvtt",
                "-f", "webvtt",
                "pipe:1",
              ];
              try {
                const fallbackResult = await runLoggedCommand("ffmpeg", fallbackArgs, { timeout: 600_000, signal: options?.signal });
                stdout = fallbackResult.stdout;
                console.log(`[subtitle] fallback extraction succeeded with -analyzeduration/probesize 50M`);
              } catch (fallbackErr: any) {
                const fallbackStderr = String(fallbackErr?.stderr || fallbackErr?.stdout || fallbackErr?.message || fallbackErr || "");
                console.error(`[subtitle] fallback ffmpeg extraction failed\nArgs: ${fallbackArgs.join(" ")}\nStderr: ${fallbackStderr}`);
                throw fallbackErr;
              }
            } else {
              throw err;
            }
          }
        } finally {
          releaseFFmpegSlot();
          if (cleanupTemp && tempHeaderPath) {
            try { fs.unlinkSync(tempHeaderPath); } catch {}
          }
        }
        const normalized = (stdout || "").trim();
        const hasTimelineData = normalized.includes("-->") || normalized.includes("Dialogue:") || normalized.includes("[Script Info]");
        if (!normalized || !hasTimelineData) {
          throw new Error(`Subtitle track is empty or not text-based (output length: ${(stdout || "").length})`);
        }
        // Always output WebVTT for Smart TV compatibility
        return normalized.startsWith("WEBVTT") ? normalized : srtToVttText(normalized);
      };

      const runExtractionPipeline = async (options?: { signal?: AbortSignal; lowBandwidth?: boolean }) => {
        // Probe the input to discover subtitle streams dynamically
        const probe = await runFfprobeJson(proxyUrl, options?.signal);
        const streams = Array.isArray(probe?.streams) ? probe.streams : [];
        const subtitleStreams = streams.filter((s: any) => String(s?.codec_type).toLowerCase() === "subtitle");

        // Determine candidate absolute indices. First try a direct mapping from the user-provided id,
        // then fall back to trying every available subtitle stream.
        const desiredAbs = await mapUserSubtitleIndexToAbsolute(proxyUrl, subIdx, options?.signal);
        const candidates = new Set<number>();
        if (desiredAbs >= 0) candidates.add(desiredAbs);
        for (const s of subtitleStreams) candidates.add(Number(s.index));

        // Determine codec plans (text extraction) ordered by client hint
        const codecHint = String((req.query.codec as string) || "").toLowerCase();
        type CodecPlan = { codec: "webvtt" | "srt" | "subrip"; format: "webvtt" | "srt"; tag: string };
        let codecPlans: CodecPlan[];
        if (codecHint === "subrip") codecPlans = [{ codec: "subrip", format: "srt", tag: "subrip->srt" }];
        else if (codecHint === "webvtt" || codecHint === "mov_text") codecPlans = [{ codec: "webvtt", format: "webvtt", tag: "webvtt->vtt" }];
        else if (codecHint === "srt") codecPlans = [{ codec: "srt", format: "srt", tag: "srt->srt" }];
        else codecPlans = [
          { codec: "subrip", format: "srt", tag: "subrip->srt" },
          { codec: "webvtt", format: "webvtt", tag: "webvtt->vtt" },
          { codec: "srt", format: "srt", tag: "srt->srt" },
        ];

        const imageCodecs = new Set(["pgs", "hdmv_pgs_subtitle", "vobsub", "dvd_subtitle", "dvb_subtitle"]);

        let lastErr: any = null;
        for (const absIndex of Array.from(candidates)) {
          // If absIndex is not a valid stream index, skip
          if (!Number.isFinite(absIndex) || absIndex < 0) continue;

          const streamMeta = subtitleStreams.find((s: any) => Number(s.index) === Number(absIndex)) || null;
          const codecName = String(streamMeta?.codec_name || "").toLowerCase();

          // If image-based codec, attempt OCR extraction first
          if (imageCodecs.has(codecName)) {
            try {
              console.log(`[subtitle] trying OCR extraction for image-based codec ${codecName} on stream ${absIndex}`);
              // OCR extraction helper (renders frames at subtitle packet pts and runs tesseract)
              const ocrVtt = await (async () => {
                const times = await getSubtitlePacketTimes(proxyUrl, absIndex, 300, options?.signal);
                if (!times || times.length === 0) throw new Error("No subtitle packets available for OCR");
                const tmpOcrDir = path.join(SUBTITLE_CACHE_DIR, `ocr_${digest}_${absIndex}_${Date.now()}`);
                try { fs.mkdirSync(tmpOcrDir, { recursive: true }); } catch {}
                const cues: Array<{ start: number; end: number; text: string }> = [];
                const maxFrames = Math.min(200, times.length);
                for (let i = 0; i < maxFrames; i++) {
                  const t = times[i];
                  const outPath = path.join(tmpOcrDir, `frame_${i}.png`);
                  const ffmpegArgs = [
                    "-hide_banner", "-loglevel", "error",
                    "-ss", String(Math.max(0, t - 0.25)),
                    "-i", proxyUrl,
                    "-frames:v", "1",
                    "-filter_complex", `subtitles='${proxyUrl}':si=${absIndex}`,
                    "-y", outPath,
                  ];
                  try {
                    await runLoggedCommand("ffmpeg", ffmpegArgs, { timeout: 30_000, signal: options?.signal });
                  } catch (e) {
                    console.warn(`[subtitle][ocr] frame render failed at ${t}s for s:${absIndex}: ${String(e?.stderr || e?.stdout || e)}`);
                    continue;
                  }
                  try {
                    const text = (await ocrImageToText(outPath)).replace(/\s+/g, " ").trim();
                    if (text) {
                      const end = (i + 1 < times.length) ? times[i + 1] : Math.min(t + 4, t + 30);
                      cues.push({ start: t, end, text });
                    }
                  } catch (e) {
                    console.warn(`[subtitle][ocr] OCR failed for ${outPath}: ${String(e?.message || e)}`);
                  } finally {
                    try { fs.unlinkSync(outPath); } catch {}
                  }
                }
                // Build WebVTT
                if (cues.length === 0) throw new Error("OCR produced no cues");
                const fmt = (s: number) => {
                  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = (s % 60).toFixed(3);
                  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(6, "0")}`;
                };
                let vtt = "WEBVTT\n\n";
                for (let i = 0; i < cues.length; i++) {
                  const c = cues[i];
                  vtt += `${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n\n`;
                }
                try { fs.rmSync(tmpOcrDir, { recursive: true, force: true }); } catch {}
                return vtt;
              })();
              const normalizedVtt = ocrVtt.startsWith("WEBVTT") ? ocrVtt : srtToVttText(ocrVtt);
              const normalizedSrt = vttToSrtText(normalizedVtt);
              try {
                if (ENABLE_PERSISTENT_SUBTITLES) {
                  fs.writeFileSync(vttPath, normalizedVtt, "utf8");
                  fs.writeFileSync(srtPath, normalizedSrt, "utf8");
                }
              } catch {}
              console.warn(`[subtitle] OCR extraction succeeded on fallback stream ${absIndex}`);
              return normalizedVtt;
            } catch (e) {
              lastErr = e;
              console.warn(`[subtitle] OCR extraction failed for stream ${absIndex}: ${String(e?.message || e)}`);
              continue;
            }
          }

          // Non-image subtitle: try textual extraction with codec plans
          for (const cp of codecPlans) {
            const plan = {
              name: `s:${absIndex}|${cp.tag}`,
              inputUrl: proxyUrl,
              mapExpr: `0:${absIndex}`,
              codec: cp.codec as any,
              format: cp.format as any,
            } as any;
            try {
              const extracted = await runExtract(plan, options);
              console.log(`[subtitle] extraction strategy succeeded for s:${absIndex}`);
              const normalizedVtt = extracted.startsWith("WEBVTT") ? extracted : srtToVttText(extracted);
              const normalizedSrt = vttToSrtText(normalizedVtt);
              try {
                if (ENABLE_PERSISTENT_SUBTITLES) {
                  fs.writeFileSync(vttPath, normalizedVtt, "utf8");
                  fs.writeFileSync(srtPath, normalizedSrt, "utf8");
                }
              } catch {}
              if (desiredAbs >= 0 && desiredAbs !== absIndex) {
                console.warn(`[subtitle] fallback used: requested ${desiredAbs} but succeeded on ${absIndex}`);
              }
              return normalizedVtt;
            } catch (e: any) {
              if (e?.name === "AbortError") throw e;
              lastErr = e;
              console.warn(`[subtitle] textual extraction failed for s:${absIndex} with codec ${cp.codec}: ${String(e?.message || e)}`);
              // try next codec plan for same absIndex
            }
          }
        }

        console.error(`[subtitle] ALL extraction strategies failed for stream ${subIdx} (${redactStreamUrl(rawUrl)})`);
        // If the caller explicitly requested to avoid full-file downloads, or
        // persistent disk writes are disabled via config, abort here to avoid
        // creating large temporary files.
        if ((req.query.noFullDownload || '').toString() === '1' || !ENABLE_PERSISTENT_SUBTITLES) {
          console.warn(`[subtitle] full-file download disabled by request/config for ${redactStreamUrl(rawUrl)}`);
          throw new Error('full-file-download-disabled');
        }
        // Final fallback: download the full file to disk and retry extraction locally.
        try {
          console.log(`[subtitle] attempting full-file download fallback for ${redactStreamUrl(rawUrl)}`);
          const tmpFullPath = path.join(SUBTITLE_CACHE_DIR, `full_${digest}_${Date.now()}.mkv`);
          const dlStart = Date.now();
          try {
            const resp = await axios.get(proxyUrl, {
              responseType: "stream",
              timeout: 0,
              maxRedirects: 5,
              httpAgent,
              httpsAgent,
              headers: {
                "User-Agent": clientSubtitleUa,
                Accept: "*/*",
                Connection: "keep-alive",
                ...(clientSubtitleReferer ? { Referer: clientSubtitleReferer } : {}),
              },
            });
            const writer = fs.createWriteStream(tmpFullPath);
            await pipeline(resp.data, writer);
          } catch (e) {
            console.warn(`[subtitle] full-file download failed: ${String((e as any)?.message || e)}`);
            try { fs.unlinkSync(tmpFullPath); } catch {}
            throw lastErr || e;
          }

          // Probe local file and retry the same candidate extraction list against local file.
          try {
            const localProbe = await runFfprobeJson(tmpFullPath);
            const localStreams = Array.isArray(localProbe?.streams) ? localProbe.streams : [];
            const localSubtitleStreams = localStreams.filter((s: any) => String(s?.codec_type).toLowerCase() === "subtitle");
            const localCandidates = new Set<number>();
            if (desiredAbs >= 0) localCandidates.add(desiredAbs);
            for (const s of localSubtitleStreams) localCandidates.add(Number(s.index));

            for (const absIndex of Array.from(localCandidates)) {
              if (!Number.isFinite(absIndex) || absIndex < 0) continue;
              for (const cp of codecPlans) {
                const plan = {
                  name: `local:s:${absIndex}|${cp.tag}`,
                  inputUrl: tmpFullPath,
                  mapExpr: `0:${absIndex}`,
                  codec: cp.codec as any,
                  format: cp.format as any,
                } as any;
                try {
                  const extracted = await runExtract(plan, { signal: options?.signal, lowBandwidth: false });
                  const normalizedVtt = extracted.startsWith("WEBVTT") ? extracted : srtToVttText(extracted);
                  const normalizedSrt = vttToSrtText(normalizedVtt);
                  try {
                    if (ENABLE_PERSISTENT_SUBTITLES) {
                      fs.writeFileSync(vttPath, normalizedVtt, "utf8");
                      fs.writeFileSync(srtPath, normalizedSrt, "utf8");
                    }
                  } catch {}
                  try { fs.unlinkSync(tmpFullPath); } catch {}
                  return normalizedVtt;
                } catch (e) {
                  lastErr = e;
                  continue;
                }
              }
            }
          } catch (e) {
            lastErr = e;
          } finally {
            try { if (fs.existsSync(tmpFullPath)) fs.unlinkSync(tmpFullPath); } catch {}
          }
        } catch (e) {
          // swallow — we'll throw below
        }

        throw lastErr || new Error("No subtitle codec extraction succeeded");
      };

      // Only allow one extraction at a time, abort all others
      let extractionAbortController: AbortController | null = null;
      const getOrStartExtraction = (options?: {
        signal?: AbortSignal;
        lowBandwidth?: boolean;
      }) => {
        // Abort any previous extraction for this stream
        if (extractionAbortController) extractionAbortController.abort();
        extractionAbortController = new AbortController();
        const mergedSignal = options?.signal
          ? new AbortController()
          : extractionAbortController;
        const created = runExtractionPipeline({ ...options, signal: extractionAbortController.signal }).finally(() => {
          subtitleInflight.delete(extractionKey);
        });
        subtitleInflight.set(extractionKey, created);
        return created;
      };

      if (isPrefetchOnly) {
        if (fs.existsSync(vttPath) || fs.existsSync(srtPath)) {
          return res.status(204).end();
        }
        // Skip prefetch if an active FFmpeg extraction is already running.
        // We don't want background work competing with either the video player
        // or a user-triggered subtitle request.
        if (ffmpegActiveCount >= MAX_FFMPEG_CONCURRENT) {
          return res.status(202).json({ queued: false, reason: "busy" });
        }
        // Also skip if ANY extraction for this stream URL is already inflight.
        const hasInflightForStream = [...subtitleInflight.keys()].some(k => k.startsWith(rawUrl + "::"));
        if (hasInflightForStream) {
          return res.status(202).json({ queued: false, reason: "inflight" });
        }
        // Keep background extraction running even after this HTTP request closes.
        void getOrStartExtraction({
          lowBandwidth: true,
        }).catch((e) => {
          console.warn(
            `[subtitle] prefetch failed for stream ${subIdx} on ${redactStreamUrl(rawUrl)}: ${String((e as any)?.message || e)}`,
          );
        });
        return res.status(202).json({ queued: true });
      }

      let extractedPair;
      try {
        const requestLowBandwidth = String(req.query.lowBandwidth || "").toLowerCase() === "1" || String(req.query.lowBandwidth || "").toLowerCase() === "true";
        // Allow caller to request a longer timeout via `timeoutMs` (bounded between 60s and 900s)
        const requestedTimeout = parseInt(String(req.query.timeoutMs || "")) || 300000;
        const clientTimeoutMs = Math.min(900000, Math.max(60000, requestedTimeout));
        extractedPair = await Promise.race([
          getOrStartExtraction({ signal: requestAbortController.signal, lowBandwidth: requestLowBandwidth }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Subtitle extraction timed out after ${Math.round(clientTimeoutMs/1000)}s`)), clientTimeoutMs)),
        ]);
      } catch (err) {
        if (!res.headersSent) {
          const msg = (typeof err === "object" && err && "message" in err) ? (err as any).message : String(err);
          res.status(504).json({ ok: false, error: msg });
        }
        return;
      }
      
      // extractedPair is always a string (WebVTT) after runExtract
      const normalized = format === "srt"
        ? vttToSrtText(extractedPair as string)
        : (extractedPair as string);
      const shifted =
        format === "srt"
          ? shiftSrt(normalized, delayMs)
          : shiftWebVtt(normalized, delayMs);
      const contentType =
        format === "srt"
          ? "application/x-subrip; charset=utf-8"
          : "text/vtt; charset=utf-8";
      subtitleCache.set(responseCacheKey, { text: shifted, contentType, ts: Date.now() });
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.send(shifted);
    } catch (e: any) {
      if (requestAbortController.signal.aborted || e?.name === "AbortError") {
        if (!res.headersSent) {
          return res.status(499).send("Client closed subtitle request");
        }
        return;
      }
      console.warn(
        `[subtitle] extraction failed for stream ${subIdx} (${format}) on ${redactStreamUrl(rawUrl)}: ${String(e?.message || e)}`,
      );
      res
        .status(500)
        .send("Subtitle extraction failed: " + String(e.message || e));
    } finally {
      req.off("close", abortExtraction);
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
