import { detectPlatform, isTV } from "./tv";

const APP_VERSION = "1.7.2.0";
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
