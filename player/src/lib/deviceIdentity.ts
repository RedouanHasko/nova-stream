// Generate a deterministic device identity (MAC-like) and activation key.
// Strategy (best-effort):
// 1. Try platform-specific IDs (webOS Luna/system APIs, Tizen webapis) where available.
// 2. If not available, look for a previously stored stable ID in localStorage.
// 3. If none, create a new random UUID and persist it in localStorage.
// 4. From the chosen raw identifier derive a MAC-like string and a base64 key using SHA-256.
// Note: On many TV platforms app storage is cleared on uninstall — surviving a full
// reinstall is not guaranteed. For truly reinstall-resistant identity, the server
// must bind server-side to platform-provided hardware identifiers (if allowed).

const STORAGE_KEY = 'player.device.identity.v1';
const APP_SALT = 'nova-stream-app-salt-v1'; // include app-specific salt (can be changed server-side)

const toHex = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
};

const toBase64 = (buf: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const sha256 = async (input: string): Promise<ArrayBuffer> => {
  if ((window as any).crypto && (window as any).crypto.subtle && typeof (window as any).crypto.subtle.digest === 'function') {
    const enc = new TextEncoder();
    return await (window as any).crypto.subtle.digest('SHA-256', enc.encode(input));
  }
  // Fallback simple hash (not cryptographic) — very unlikely to be used on modern TV webviews
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const buf = new ArrayBuffer(32);
  const dv = new DataView(buf);
  dv.setUint32(0, h);
  return buf;
};

const formatMacLike = (hex: string) => {
  // Take first 12 hex chars and format as MAC (uppercase)
  const v = (hex || '').replace(/[^a-f0-9]/gi, '').slice(0, 12).padEnd(12, '0').toUpperCase();
  return v.match(/.{1,2}/g)?.join(':') ?? v;
};

const genRandomUuid = (): string => {
  try {
    const buf = new Uint8Array(16);
    (window as any).crypto.getRandomValues(buf);
    // set version bits for v4
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const tryGetPlatformId = async (): Promise<{ id: string | null; source: string | null }> => {
  try {
    const w = window as any;
    // webOS: try multiple Luna endpoints that sometimes expose device identifiers
    if (w?.webOS && w.webOS.service) {
      const endpoints = [
        { ep: 'luna://com.webos.service.systemservice', method: 'getSystemInfo' },
        { ep: 'luna://com.webos.service.systemservice', method: 'getDeviceInfo' },
        { ep: 'luna://com.webos.service.sm', method: 'getDeviceInfo' },
        { ep: 'luna://com.webos.service.connectionmanager', method: 'getStatus' },
      ];
      for (const { ep, method } of endpoints) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await new Promise((resolve) => {
            try {
              w.webOS.service.request(ep, {
                method,
                parameters: {},
                onSuccess: (r: any) => resolve(r),
                onFailure: () => resolve(null),
              });
            } catch (e) { resolve(null); }
          });
          if (res) {
            // Try common fields
            const candidates = [res.macAddress, res.mac, res.serialNumber, res.deviceId, res.id, res.uuid, res.hardwareId, res.modelName, JSON.stringify(res)];
            for (const c of candidates) {
              if (c && typeof c === 'string' && c.trim().length > 6) return { id: c.trim(), source: `${ep}#${method}` };
            }
          }
        } catch {}
      }
    }

    // Tizen: try webapis or systeminfo
    const ua = navigator.userAgent || '';
    if (/Tizen/i.test(ua)) {
      try {
        const w = window as any;
        if (w?.webapis?.productinfo) {
          try {
            const info = w.webapis.productinfo.getDeviceCapability();
            const maybe = info?.serial || info?.model || JSON.stringify(info);
            if (maybe) return { id: String(maybe), source: 'tizen.webapis.productinfo' };
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return { id: null, source: null };
};

/* The lightweight identity helper above was replaced by a more complete
   identity implementation further down in this file. Keep this space
   reserved for legacy compatibility if needed. */
import { detectPlatform, isTV } from "./tv";

const APP_VERSION = "1.0.0";
const IDENTITY_NAMESPACE = "nova-player-device-identity-v1";
const DEVICE_IDENTITY_CACHE_KEY = "nova:device-identity:v1";

export type DeviceIdentityProfile = {
  platform: string;
  manufacturer: string | null;
  model: string | null;
  deviceName: string | null;
  osVersion: string | null;
  browser: string | null;
  locale: string | null;
  timezone: string | null;
  screen: string | null;
  appVersion: string;
  identitySource: string;
  stability: "high" | "best-effort";
  stableAcrossReinstall: boolean;
  isTV: boolean;
  capabilities: string[];
};

export type DeviceIdentity = {
  macAddress: string;
  deviceKey: string;
  profile: DeviceIdentityProfile;
};

export type DeviceProfilePayload = {
  platform: string;
  manufacturer?: string | null;
  model?: string | null;
  deviceName?: string | null;
  osVersion?: string | null;
  browser?: string | null;
  locale?: string | null;
  timezone?: string | null;
  screen?: string | null;
  appVersion?: string | null;
  source?: string | null;
  stability?: string | null;
  stableAcrossReinstall?: boolean;
  isTV?: boolean;
  capabilities?: string[];
};

type ResolvedIdentitySource = {
  sourceId: string;
  identitySource: string;
  stability: "high" | "best-effort";
  stableAcrossReinstall: boolean;
  manufacturer?: string | null;
  model?: string | null;
  deviceName?: string | null;
  osVersion?: string | null;
  capabilities?: string[];
};

declare global {
  interface Window {
    PalmSystem?: {
      deviceInfo?: {
        modelName?: string;
        modelNumber?: string;
        version?: string;
      };
    };
    webOS?: {
      deviceInfo?: {
        modelName?: string;
        modelNumber?: string;
        version?: string;
      };
      service?: {
        request?: (
          uri: string,
          options?: {
            method?: string;
            parameters?: Record<string, unknown>;
            onSuccess?: (result: Record<string, unknown>) => void;
            onFailure?: (error: unknown) => void;
          },
        ) => void;
      };
    };
    tizen?: {
      systeminfo?: {
        getCapability?: (name: string) => string;
      };
    };
    webapis?: {
      productinfo?: {
        getModel?: () => string;
        getRealModel?: () => string;
        getFirmware?: () => string;
      };
    };
    Android?: Record<string, unknown>;
    android?: Record<string, unknown>;
  }

  interface Navigator {
    deviceMemory?: number;
    userAgentData?: {
      platform?: string;
      brands?: Array<{ brand?: string; version?: string }>;
    };
  }
}

let identityPromise: Promise<DeviceIdentity> | null = null;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function callBridgeString(
  host: Record<string, unknown> | undefined,
  methodNames: string[],
): string | null {
  if (!host) return null;

  for (const methodName of methodNames) {
    const candidate = host[methodName];
    if (typeof candidate !== "function") continue;
    try {
      const result = candidate.call(host);
      const normalized = asTrimmedString(result);
      if (normalized) return normalized;
    } catch {
      // Ignore unsupported bridge calls and continue trying others.
    }
  }

  return null;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string) {
  const filtered = parts
    .map((item) => asTrimmedString(item) || null)
    .filter(Boolean) as string[];
  return filtered.length > 0 ? filtered.join(separator) : null;
}

function getBrowserLabel(): string | null {
  const userAgent = navigator.userAgent || "";

  if (/web0s|webos/i.test(userAgent)) return "webOS Web App";
  if (/tizen/i.test(userAgent)) return "Tizen Web App";
  if (/fire tv|aft/i.test(userAgent)) return "Fire TV WebView";
  if (/android/i.test(userAgent)) return "Android WebView";
  if (/chrome/i.test(userAgent)) return "Chromium";
  if (/safari/i.test(userAgent)) return "Safari";
  return null;
}

function getScreenLabel(): string | null {
  if (!window.screen) return null;
  const { width, height, colorDepth } = window.screen;
  if (!width || !height) return null;
  return `${width}x${height}@${colorDepth || 0}`;
}

function normalizeUserAgentForFingerprint(userAgent: string): string {
  if (!userAgent) return "";

  return userAgent
    .replace(/\([^)]*\)/g, "")
    .replace(/[A-Za-z]+\/[0-9][A-Za-z0-9._-]*/g, (token) => {
      const slashIdx = token.indexOf("/");
      return slashIdx > 0 ? token.slice(0, slashIdx) : token;
    })
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function derivePseudoMac(hashHex: string): string {
  const bytes = new Array(6).fill(0).map((_, index) =>
    Number.parseInt(hashHex.slice(index * 2, index * 2 + 2), 16),
  );

  bytes[0] = (bytes[0] | 0x02) & 0xfe;

  return bytes.map((value) => value.toString(16).padStart(2, "0")).join(":");
}

function deriveDeviceKey(hashHex: string): string {
  const numeric = BigInt(`0x${hashHex.slice(12, 28)}`) % 100000000n;
  return numeric.toString().padStart(8, "0");
}

function createFingerprintSource(platform: string): ResolvedIdentitySource {
  const userAgentDataBrands = navigator.userAgentData?.brands
    ?.map((item) => asTrimmedString(item.brand))
    .filter(Boolean)
    .join(",") || "";

  const normalizedUa = normalizeUserAgentForFingerprint(navigator.userAgent || "");
  const normalizedPlatform = asTrimmedString(navigator.platform)?.toLowerCase() || "";

  const fingerprintParts = [
    `platform:${platform}`,
    `ua:${normalizedUa}`,
    `uaPlatform:${(navigator.userAgentData?.platform || "").toLowerCase()}`,
    `brands:${userAgentDataBrands}`,
    `vendor:${(navigator.vendor || "").toLowerCase()}`,
    `navigatorPlatform:${normalizedPlatform}`,
    `browser:${getBrowserLabel() || ""}`,
    `screen:${getScreenLabel() || ""}`,
    `dpr:${window.devicePixelRatio || 1}`,
    `cores:${navigator.hardwareConcurrency || 0}`,
    `memory:${navigator.deviceMemory || 0}`,
    `touch:${navigator.maxTouchPoints || 0}`,
    `tv:${isTV ? "1" : "0"}`,
  ];

  return {
    sourceId: fingerprintParts.join("|"),
    identitySource: "fingerprint",
    stability: "best-effort",
    stableAcrossReinstall: false,
    capabilities: ["browser-fingerprint"],
  };
}

function callWebOsService(
  uri: string,
  parameters?: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const request = window.webOS?.service?.request;
    if (typeof request !== "function") {
      resolve(null);
      return;
    }

    try {
      request(uri, {
        parameters,
        onSuccess: (result) => resolve(result || null),
        onFailure: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

async function resolveWebOsIdentity(): Promise<ResolvedIdentitySource | null> {
  if (detectPlatform() !== "webos") return null;

  const result = await callWebOsService(
    "luna://com.webos.service.sm/deviceid/getIDs",
    { idType: ["LGUDID"] },
  );

  const stableId =
    asTrimmedString(result?.LGUDID) ||
    asTrimmedString(result?.idList && (result.idList as Record<string, unknown>).LGUDID);

  if (!stableId) return null;

  const model =
    asTrimmedString(window.PalmSystem?.deviceInfo?.modelName) ||
    asTrimmedString(window.webOS?.deviceInfo?.modelName) ||
    asTrimmedString(window.PalmSystem?.deviceInfo?.modelNumber) ||
    asTrimmedString(window.webOS?.deviceInfo?.modelNumber);

  const osVersion =
    asTrimmedString(window.PalmSystem?.deviceInfo?.version) ||
    asTrimmedString(window.webOS?.deviceInfo?.version);

  return {
    sourceId: stableId,
    identitySource: "webos-lgudid",
    stability: "high",
    stableAcrossReinstall: true,
    manufacturer: "LG",
    model,
    deviceName: joinNonEmpty(["LG", model], " "),
    osVersion,
    capabilities: ["webos-service", "lgudid"],
  };
}

async function resolveTizenIdentity(): Promise<ResolvedIdentitySource | null> {
  if (detectPlatform() !== "tizen") return null;

  const stableId = asTrimmedString(
    window.tizen?.systeminfo?.getCapability?.(
      "http://tizen.org/system/tizenid",
    ),
  );

  if (!stableId) return null;

  const model =
    asTrimmedString(window.webapis?.productinfo?.getRealModel?.()) ||
    asTrimmedString(window.webapis?.productinfo?.getModel?.());

  const osVersion = asTrimmedString(window.webapis?.productinfo?.getFirmware?.());

  return {
    sourceId: stableId,
    identitySource: "tizen-tizenid",
    stability: "high",
    stableAcrossReinstall: true,
    manufacturer: "Samsung",
    model,
    deviceName: joinNonEmpty(["Samsung", model], " "),
    osVersion,
    capabilities: ["tizen-systeminfo", "productinfo"],
  };
}

async function resolveNativeBridgeIdentity(): Promise<ResolvedIdentitySource | null> {
  const bridgeHosts = [window.Android, window.android];

  for (const bridgeHost of bridgeHosts) {
    const stableId = callBridgeString(bridgeHost, [
      "getDeviceId",
      "getAndroidId",
      "getSerialNumber",
      "deviceId",
    ]);

    const manufacturer = callBridgeString(bridgeHost, [
      "getManufacturer",
      "manufacturer",
      "getBrand",
      "brand",
    ]);
    const model = callBridgeString(bridgeHost, ["getModel", "model"]);
    const osVersion = callBridgeString(bridgeHost, [
      "getOsVersion",
      "osVersion",
      "getSystemVersion",
      "systemVersion",
    ]);

    if (stableId) {
      return {
        sourceId: stableId,
        identitySource: "native-bridge-device-id",
        stability: "high",
        stableAcrossReinstall: true,
        manufacturer,
        model,
        deviceName: joinNonEmpty([manufacturer, model], " "),
        osVersion,
        capabilities: ["native-js-bridge"],
      };
    }

    // Installation IDs can change after reinstall, so don't treat them as
    // the primary stable identity. Use a deterministic device-profile fallback.
    const installationId = callBridgeString(bridgeHost, [
      "getInstallationId",
      "installationId",
      "getAppInstanceId",
    ]);

    const bridgeProfileSeed = [
      detectPlatform(),
      normalizeUserAgentForFingerprint(navigator.userAgent || ""),
      manufacturer || "",
      model || "",
      osVersion || "",
      getScreenLabel() || "",
      String(navigator.hardwareConcurrency || 0),
      String(navigator.deviceMemory || 0),
      String(navigator.maxTouchPoints || 0),
      asTrimmedString(navigator.platform) || "",
    ].join("|");

    if (bridgeProfileSeed.replace(/\|/g, "").trim()) {
      return {
        sourceId: bridgeProfileSeed,
        identitySource: installationId
          ? "native-bridge-device-profile"
          : "native-bridge-profile",
        stability: "best-effort",
        stableAcrossReinstall: false,
        manufacturer,
        model,
        deviceName: joinNonEmpty([manufacturer, model], " "),
        osVersion,
        capabilities: installationId
          ? ["native-js-bridge", "installation-id-ignored"]
          : ["native-js-bridge"],
      };
    }
  }

  return null;
}

function readCachedIdentity(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(DEVICE_IDENTITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceIdentity;
    if (!parsed?.macAddress || !parsed?.deviceKey || !parsed?.profile?.platform) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedIdentity(identity: DeviceIdentity) {
  try {
    localStorage.setItem(DEVICE_IDENTITY_CACHE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage quota/privacy mode errors.
  }
}

async function resolveIdentitySource(): Promise<ResolvedIdentitySource> {
  return (
    (await resolveWebOsIdentity()) ||
    (await resolveTizenIdentity()) ||
    (await resolveNativeBridgeIdentity()) ||
    createFingerprintSource(detectPlatform())
  );
}

function buildProfile(
  platform: string,
  resolved: ResolvedIdentitySource,
): DeviceIdentityProfile {
  const locale = asTrimmedString(navigator.language);
  const timezone = asTrimmedString(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const browser = getBrowserLabel();
  const screen = getScreenLabel();

  return {
    platform,
    manufacturer: resolved.manufacturer || null,
    model: resolved.model || null,
    deviceName:
      resolved.deviceName ||
      joinNonEmpty([resolved.manufacturer || null, resolved.model || null], " "),
    osVersion: resolved.osVersion || null,
    browser,
    locale,
    timezone,
    screen,
    appVersion: APP_VERSION,
    identitySource: resolved.identitySource,
    stability: resolved.stability,
    stableAcrossReinstall: resolved.stableAcrossReinstall,
    isTV,
    capabilities: resolved.capabilities || [],
  };
}

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (identityPromise) return identityPromise;

  identityPromise = (async () => {
    const cached = readCachedIdentity();
    const platform = detectPlatform();
    const resolved = await resolveIdentitySource();
    const profile = buildProfile(platform, resolved);
    const sourceHash = await sha256Hex(
      `${IDENTITY_NAMESPACE}|${platform}|${resolved.sourceId}`,
    );

    const identity: DeviceIdentity = {
      macAddress: derivePseudoMac(sourceHash),
      deviceKey: deriveDeviceKey(sourceHash),
      profile,
    };

    if (cached && cached.macAddress === identity.macAddress && cached.deviceKey) {
      // Keep previously issued keys (including legacy 12-digit keys) for existing installs
      // to avoid breaking already activated devices after reducing new key length.
      if (/^\d{6,12}$/.test(cached.deviceKey)) {
        return {
          ...cached,
          profile,
        };
      }
    }

    writeCachedIdentity(identity);
    return identity;
  })().catch((error) => {
    identityPromise = null;
    throw error;
  });

  return identityPromise;
}

export function syncDeviceIdentityKeyFromServer(
  identity: DeviceIdentity,
  serverMacAddress: string | null | undefined,
  serverDeviceKey: string | null | undefined,
): DeviceIdentity {
  const normalizedServerMac = asTrimmedString(serverMacAddress)?.toLowerCase();
  const normalizedLocalMac = asTrimmedString(identity.macAddress)?.toLowerCase();
  const normalizedServerKey = asTrimmedString(serverDeviceKey);

  if (!normalizedServerMac || !normalizedLocalMac) {
    return identity;
  }

  if (normalizedServerMac !== normalizedLocalMac) {
    return identity;
  }

  if (!normalizedServerKey || normalizedServerKey === identity.deviceKey) {
    return identity;
  }

  const updatedIdentity: DeviceIdentity = {
    ...identity,
    deviceKey: normalizedServerKey,
  };

  writeCachedIdentity(updatedIdentity);
  identityPromise = Promise.resolve(updatedIdentity);
  return updatedIdentity;
}

export function getDeviceIdentitySummary(identity: DeviceIdentity | null): string {
  if (!identity) return "Resolving device identity";

  const parts = [
    identity.profile.deviceName,
    identity.profile.identitySource,
    identity.profile.stableAcrossReinstall ? "reinstall-stable" : "best-effort",
  ].filter(Boolean);

  return parts.join(" • ");
}

export function buildDeviceProfilePayload(
  identity: DeviceIdentity,
): DeviceProfilePayload {
  return {
    platform: identity.profile.platform,
    manufacturer: identity.profile.manufacturer,
    model: identity.profile.model,
    deviceName: identity.profile.deviceName,
    osVersion: identity.profile.osVersion,
    browser: identity.profile.browser,
    locale: identity.profile.locale,
    timezone: identity.profile.timezone,
    screen: identity.profile.screen,
    appVersion: identity.profile.appVersion,
    source: identity.profile.identitySource,
    stability: identity.profile.stability,
    stableAcrossReinstall: identity.profile.stableAcrossReinstall,
    isTV: identity.profile.isTV,
    capabilities: identity.profile.capabilities,
  };
}
