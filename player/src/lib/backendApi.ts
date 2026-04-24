import {
  buildDeviceProfilePayload,
  getDeviceIdentity,
  type DeviceIdentity,
  type DeviceProfilePayload,
} from "./deviceIdentity";

const LOCAL_HOSTNAME_RE = /^(localhost|127(?:\.\d{1,3}){3}|::1)$/i;

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

function getApiBase() {
  if (typeof window === "undefined") return "";

  const configuredBase = ((import.meta as any).env?.VITE_API_URL || "").trim();
  if (configuredBase) {
    return toSecureUrl(configuredBase).replace(/\/$/, "");
  }

  const { protocol, hostname } = window.location;
  if (isLocalHostname(hostname)) {
    return `${protocol}//${hostname}:5000`;
  }

  return "";
}

const API_BASE = getApiBase();
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
  playlists?: BackendAssignedPlaylist[];
};

export type BackendAssignedPlaylist = {
  assignmentId?: number;
  id?: number;
  name?: string;
  type?: string;
  url?: string | null;
  targetAppName?: string | null;
  targetApplicationId?: number | null;
  credentials?: {
    host?: string;
    username?: string;
    password?: string;
  } | null;
  rawContent?: string | null;
  updatedAt?: string;
  addedAt?: string;
};

type DeviceRequestBody = {
  mac: string;
  deviceKey: string;
  deviceProfile: DeviceProfilePayload;
  applicationId?: number | string;
  appName?: string;
};

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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
    throw new Error(
      json?.error || json?.message || text || response.statusText || "Request failed",
    );
  }

  return json as T;
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

export async function getDeviceFeed(
  identity?: DeviceIdentity,
): Promise<DeviceActivationResponse> {
  return request<DeviceActivationResponse>(
    "/api/playlists/device-feed",
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
