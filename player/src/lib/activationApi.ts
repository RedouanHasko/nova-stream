import {
  buildDeviceProfilePayload,
  getDeviceIdentity,
  type DeviceIdentity,
  type DeviceProfilePayload,
} from "./deviceIdentity";

// Treat common local and private LAN hostnames/IP ranges as "local" so
// development HTTP endpoints are not force-upgraded to HTTPS.
const LOCAL_HOSTNAME_RE = /^(localhost|127(?:\.\d{1,3}){3}|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2[0-9]|3[0-1])(?:\.\d{1,3}){2})$/i;

function isLocalHostname(hostname: string): boolean {
  const normalized = (hostname || "").trim().toLowerCase();
  return Boolean(
    normalized &&
      (LOCAL_HOSTNAME_RE.test(normalized) || normalized.endsWith(".local")),
  );
}

function toSecureUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://example.com";
    const nextUrl = new URL(rawUrl, base);

    if (nextUrl.protocol === "http:" && !isLocalHostname(nextUrl.hostname)) {
      nextUrl.protocol = "https:";
    }

    return nextUrl.toString();
  } catch {
    return rawUrl;
  }
}

const API_BASE_STORAGE_KEY = "nova_api_base";
const MEDIA_API_BASE_STORAGE_KEY = "nova_media_api_base";

function getDefaultPlayerMediaBase(): string {
  if (typeof window === "undefined") return "";
  const lanHost = getConfiguredLanHost();
  if (lanHost) {
    return `http://${lanHost}:5000`;
  }
  return "http://192.168.56.1:5000";
}

function getConfiguredLanHost(): string {
  if (typeof window === "undefined") return "";

  const fromEnv = ((import.meta as any).env?.VITE_LAN_HOST || "").toString().trim();
  if (fromEnv) return fromEnv;

  try {
    const fromStorage = (localStorage.getItem("nova_lan_host") || "").trim();
    if (fromStorage) return fromStorage;
  } catch {
    // Ignore storage failures
  }

  return "";
}

function normalizeBase(raw: string): string {
  return toSecureUrl(String(raw || "").trim()).replace(/\/$/, "");
}

function coerceMediaBase(base: string): string {
  const normalized = normalizeBase(base);
  if (!normalized) return "";
  return normalized;
}

function getStoredApiBase(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeBase(localStorage.getItem(API_BASE_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function persistApiBase(base: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeBase(base);
  if (!normalized) return;
  try {
    localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures
  }
}

function getStoredMediaApiBase(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(MEDIA_API_BASE_STORAGE_KEY) || "";
    const coerced = coerceMediaBase(stored);
    if (coerced && coerced !== normalizeBase(stored)) {
      localStorage.setItem(MEDIA_API_BASE_STORAGE_KEY, coerced);
    }
    return coerced;
  } catch {
    return "";
  }
}

function persistMediaApiBase(base: string): void {
  if (typeof window === "undefined") return;
  const normalized = coerceMediaBase(base);
  if (!normalized) return;
  try {
    localStorage.setItem(MEDIA_API_BASE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures
  }
}

function getMediaApiBase(): string {
  if (typeof window === "undefined") return "";

  const configuredBase = (
    ((import.meta as any).env?.VITE_MEDIA_API_URL ||
      (import.meta as any).env?.VITE_PLAYER_API_URL ||
      "")
  )
    .toString()
    .trim();
  if (configuredBase) {
    return normalizeBase(configuredBase);
  }

  const { protocol, hostname, origin, port } = window.location;
  if (protocol === "file:") {
    // Packaged app mode: media/proxy routes must use reachable backend base.
    const storedBase = getStoredMediaApiBase();
    if (storedBase) {
      return storedBase;
    }

    const lanHost = getConfiguredLanHost();
    if (lanHost) {
      const lanBase = `http://${lanHost}:5000`;
      persistMediaApiBase(lanBase);
      return lanBase;
    }

    // Fallback to player runtime API in packaged mode.
    const fallbackBase = getDefaultPlayerMediaBase();
    persistMediaApiBase(fallbackBase);
    return fallbackBase;
  }

  const storedBase = getStoredMediaApiBase();
  if (storedBase) return storedBase;

  if (isLocalHostname(hostname)) {
    if (port === "5000") {
      return origin;
    }
    return `${protocol}//${hostname}:5000`;
  }

  return origin;
}

function getApiBase() {
  if (typeof window === "undefined") return "";

  const configuredBase = ((import.meta as any).env?.VITE_API_URL || "").trim();
  if (configuredBase) {
    return normalizeBase(configuredBase);
  }

  const storedBase = getStoredApiBase();
  if (storedBase) return storedBase;

  const { protocol, hostname } = window.location;
  if (protocol === "file:") {
    // Packaged TV apps run from file:// and cannot use relative API URLs.
    const lanHost = getConfiguredLanHost();
    if (lanHost) {
      return `http://${lanHost}:5000`;
    }
    return "http://192.168.56.1:5000";
  }

  if (isLocalHostname(hostname)) {
    // Backend defaults to :5000 for local/dev setups.
    return `${protocol}//${hostname}:5000`;
  }

  return "";
}

function getApiBaseCandidates() {
  if (typeof window === "undefined") return [""];

  const candidates: string[] = [];

  const configuredBase = ((import.meta as any).env?.VITE_API_URL || "").trim();
  if (configuredBase) {
    candidates.push(normalizeBase(configuredBase));
  }

  const { protocol, hostname } = window.location;

  const storedBase = getStoredApiBase();
  if (storedBase) {
    candidates.push(storedBase);
  }

  if (protocol === "file:") {
    const lanHost = getConfiguredLanHost();
    if (lanHost) {
      candidates.push(`http://${lanHost}:5000`);
    }

    // Common host-access patterns for emulators/simulators and local development.
    candidates.push("http://192.168.56.1:5000");
    candidates.push("http://localhost:5000");
    candidates.push("http://127.0.0.1:5000");
  } else if (isLocalHostname(hostname)) {
    const originProtocol = protocol || "http:";
    const originPort = window.location.port || "";
    if (originPort) {
      candidates.push(`${originProtocol}//${hostname}:${originPort}`);
    }
    candidates.push(`${originProtocol}//${hostname}:5000`);
  }

  if (candidates.length === 0) {
    candidates.push("");
  }

  return Array.from(new Set(candidates.map((v) => normalizeBase(v)).filter(Boolean)));
}

let _apiBase: string = getApiBase();
let _mediaApiBase: string = getMediaApiBase();
const API_BASE_CANDIDATES = getApiBaseCandidates();

// Export helpers so other modules can build absolute API URLs when needed
export function getApiBaseUrl(): string {
  // Always prefer the most-recently stored (probed) base so that runtime
  // discovery updates are reflected without a page reload.
  const stored = getStoredApiBase();
  if (stored && stored !== _apiBase) {
    _apiBase = stored;
  }
  return _apiBase || "";
}

export function getMediaApiBaseUrl(): string {
  const stored = getStoredMediaApiBase();
  if (stored && stored !== _mediaApiBase) {
    _mediaApiBase = stored;
  }
  _mediaApiBase = coerceMediaBase(_mediaApiBase);
  if (_mediaApiBase) {
    return _mediaApiBase;
  }
  return getDefaultPlayerMediaBase();
}

export function getApiBaseCandidatesExport(): string[] {
  return API_BASE_CANDIDATES || [];
}

/**
 * Probes all backend candidates in parallel via /api/ping and selects the
 * first one that responds. The winning base is persisted to localStorage so
 * all subsequent getApiBaseUrl() calls return it immediately.
 * Call this once at app startup before any playback begins.
 */
export async function probeAndSelectApiBase(): Promise<string> {
  const candidates = Array.from(
    new Set([...API_BASE_CANDIDATES, "http://localhost:5000", "http://127.0.0.1:5000"].filter(Boolean)),
  );

  const probeOne = (base: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error("timeout"));
      }, 3500);
      fetch(`${base}/api/ping`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => {
          clearTimeout(timer);
          if (r.status < 500) resolve(base);
          else reject(new Error(`status ${r.status}`));
        })
        .catch(() => {
          clearTimeout(timer);
          reject(new Error("fetch failed"));
        });
    });

  try {
    const winner = await Promise.any(candidates.map(probeOne));
    if (winner) {
      _apiBase = winner;
      persistApiBase(winner);
    }
    return winner;
  } catch {
    return _apiBase;
  }
}
const APPLICATION_ID = ((import.meta as any).env?.VITE_APPLICATION_ID || "")
  .toString()
  .trim();
const APPLICATION_NAME = (
  (import.meta as any).env?.VITE_APPLICATION_NAME || "NOVA PLAYER"
)
  .toString()
  .trim();

export const ACTIVATION_PORTAL_URL = (
  (import.meta as any).env?.VITE_ACTIVATION_URL || ""
)
  .toString()
  .trim();

export type DeviceActivationResponse = {
  activated: boolean;
  reason?: string;
  device?: {
    id?: number;
    mac?: string;
    deviceKey?: string;
    platform?: string | null;
    deviceName?: string | null;
    osVersion?: string | null;
    identitySource?: string | null;
    deviceInfo?: Record<string, unknown> | null;
    status?: string;
  } | null;
  activations?: Array<{
    id?: number;
    applicationId?: number;
    appName?: string;
    activationKind?: string;
    duration?: string;
    activatedAt?: string;
    expiresAt?: string | null;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    trialConsumedAt?: string | null;
    status?: string;
  }>;
  trial?: {
    enabled?: boolean;
    durationDays?: number;
    consumed?: boolean;
    available?: boolean;
    eligible?: boolean;
    active?: boolean;
    status?: string;
    startedAt?: string | null;
    expiresAt?: string | null;
    remainingDays?: number;
  };
  playlists?: Array<{
    id?: number;
    assignmentId?: number;
    name?: string;
    type?: string;
    url?: string | null;
    rawContent?: string | null;
    credentials?: {
      host?: string;
      username?: string;
      password?: string;
    } | null;
    targetApplicationId?: number | null;
    targetAppName?: string | null;
    updatedAt?: string;
    addedAt?: string;
  }>;
};

type DeviceRequestBody = {
  mac: string;
  deviceKey: string;
  deviceProfile: DeviceProfilePayload;
  applicationId?: number | string;
  appName?: string;
};

async function request<T>(path: string, body: unknown): Promise<T> {
  const bases = API_BASE_CANDIDATES.length > 0 ? API_BASE_CANDIDATES : [_apiBase];
  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!response.ok) {
        const err = new Error(
          json?.error || json?.message || text || response.statusText || "Request failed",
        );
        // Local dev may run player on :4000 while backend APIs live on :5000.
        // If route is missing, try next base before failing.
        if (response.status === 404 && bases.length > 1) {
          lastError = err;
          continue;
        }
        throw err;
      }

      if (base) {
        _apiBase = base;
        persistApiBase(base);
      }

      return json as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Request failed"));
    }
  }

  throw lastError || new Error("Request failed");
}

export async function buildDeviceRequestBody(
  identity?: DeviceIdentity,
): Promise<DeviceRequestBody> {
  const resolvedIdentity = identity || (await getDeviceIdentity());
  const body: DeviceRequestBody = {
    mac: resolvedIdentity.macAddress,
    deviceKey: resolvedIdentity.deviceKey,
    deviceProfile: buildDeviceProfilePayload(resolvedIdentity),
  };

  if (APPLICATION_ID) {
    body.applicationId = APPLICATION_ID;
  }

  if (APPLICATION_NAME) {
    body.appName = APPLICATION_NAME;
  }

  return body;
}

export async function verifyDeviceActivation(
  identity?: DeviceIdentity,
): Promise<DeviceActivationResponse> {
  return request<DeviceActivationResponse>(
    "/api/devices/verify-activation",
    await buildDeviceRequestBody(identity),
  );
}

export async function startDeviceTrial(
  identity?: DeviceIdentity,
): Promise<DeviceActivationResponse> {
  return request<DeviceActivationResponse>(
    "/api/devices/start-trial",
    await buildDeviceRequestBody(identity),
  );
}
