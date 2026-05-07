import type { DeviceActivationResponse } from "./activationApi";
import type { DeviceIdentity } from "./deviceIdentity";

const ACTIVATION_CACHE_STORAGE_KEY = "nova_activation_cache";
const DEFAULT_REFRESH_INTERVAL_HOURS = 24;
const DEFAULT_GRACE_PERIOD_DAYS = 30;

export type ActivationCacheRecord = {
  version: 1;
  device: {
    mac: string;
    deviceKey: string;
  };
  response: DeviceActivationResponse;
  cachedAt: string;
  refreshAfter: string;
  graceUntil: string;
};

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function getActivationRefreshIntervalMs() {
  const hours = toPositiveInt(
    (import.meta as any).env?.VITE_ACTIVATION_REFRESH_INTERVAL_HOURS,
    DEFAULT_REFRESH_INTERVAL_HOURS,
  );
  return hours * 60 * 60 * 1000;
}

function getActivationGracePeriodMs() {
  const days = toPositiveInt(
    (import.meta as any).env?.VITE_ACTIVATION_GRACE_DAYS,
    DEFAULT_GRACE_PERIOD_DAYS,
  );
  return days * 24 * 60 * 60 * 1000;
}

function readRawActivationCache(): ActivationCacheRecord | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ACTIVATION_CACHE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ActivationCacheRecord;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.device?.mac ||
      !parsed.device?.deviceKey ||
      !parsed.cachedAt ||
      !parsed.refreshAfter ||
      !parsed.graceUntil
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isMatchingDevice(record: ActivationCacheRecord, identity: DeviceIdentity) {
  return (
    record.device.mac === identity.macAddress &&
    record.device.deviceKey === identity.deviceKey
  );
}

function isUsableActivationResponse(response: DeviceActivationResponse) {
  return response?.activated === true;
}

export function clearActivationCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVATION_CACHE_STORAGE_KEY);
}

export function writeActivationCache(
  identity: DeviceIdentity,
  response: DeviceActivationResponse,
) {
  if (typeof window === "undefined") return;

  if (!isUsableActivationResponse(response)) {
    clearActivationCache();
    return;
  }

  const now = Date.now();
  const record: ActivationCacheRecord = {
    version: 1,
    device: {
      mac: identity.macAddress,
      deviceKey: identity.deviceKey,
    },
    response,
    cachedAt: new Date(now).toISOString(),
    refreshAfter: new Date(now + getActivationRefreshIntervalMs()).toISOString(),
    graceUntil: new Date(now + getActivationGracePeriodMs()).toISOString(),
  };

  window.localStorage.setItem(
    ACTIVATION_CACHE_STORAGE_KEY,
    JSON.stringify(record),
  );
}

export function readActivationCache(identity: DeviceIdentity) {
  const record = readRawActivationCache();
  if (!record) return null;

  if (!isMatchingDevice(record, identity) || !isUsableActivationResponse(record.response)) {
    clearActivationCache();
    return null;
  }

  const now = Date.now();
  const graceUntil = new Date(record.graceUntil).getTime();
  const refreshAfter = new Date(record.refreshAfter).getTime();

  if (!Number.isFinite(graceUntil) || now > graceUntil) {
    clearActivationCache();
    return null;
  }

  return {
    record,
    shouldRefresh: !Number.isFinite(refreshAfter) || now >= refreshAfter,
  };
}

export function buildCachedActivationResponse(
  record: ActivationCacheRecord,
  reason: string,
): DeviceActivationResponse {
  return {
    ...record.response,
    activated: true,
    reason,
  };
}