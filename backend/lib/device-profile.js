function normalizeText(value, maxLength = 120) {
  if (value === undefined || value === null) return null;
  const normalized = value.toString().trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return null;
}

function normalizeStringArray(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, 60))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeDeviceProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }

  const manufacturer = normalizeText(profile.manufacturer);
  const model = normalizeText(profile.model);
  const deviceName =
    normalizeText(profile.deviceName) ||
    [manufacturer, model].filter(Boolean).join(" ") ||
    null;
  const platform = normalizeText(profile.platform, 60);
  const osVersion = normalizeText(profile.osVersion, 80);
  const appVersion = normalizeText(profile.appVersion, 40);
  const browser = normalizeText(profile.browser, 80);
  const locale = normalizeText(profile.locale, 40);
  const timezone = normalizeText(profile.timezone, 80);
  const screen = normalizeText(profile.screen, 40);
  const identitySource = normalizeText(profile.source || profile.identitySource, 80);
  const stability = normalizeText(profile.stability, 40);
  const isTV = normalizeBoolean(profile.isTV);
  const stableAcrossReinstall = normalizeBoolean(profile.stableAcrossReinstall);
  const capabilities = normalizeStringArray(profile.capabilities);

  const deviceInfoPayload = {
    manufacturer,
    model,
    browser,
    locale,
    timezone,
    screen,
    appVersion,
    stability,
    isTV,
    stableAcrossReinstall,
    capabilities,
  };

  const compactInfo = Object.fromEntries(
    Object.entries(deviceInfoPayload).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined && value !== "";
    }),
  );

  return {
    platform,
    deviceName,
    osVersion,
    identitySource,
    deviceInfo:
      Object.keys(compactInfo).length > 0
        ? JSON.stringify(compactInfo)
        : null,
  };
}

function buildDeviceProfilePatch(existingDevice, rawProfile) {
  const sanitized = sanitizeDeviceProfile(rawProfile);
  if (!sanitized) return null;

  const patch = {};

  if (sanitized.platform && sanitized.platform !== existingDevice?.platform) {
    patch.platform = sanitized.platform;
  }

  if (
    sanitized.deviceName &&
    sanitized.deviceName !== existingDevice?.deviceName
  ) {
    patch.deviceName = sanitized.deviceName;
  }

  if (sanitized.osVersion && sanitized.osVersion !== existingDevice?.osVersion) {
    patch.osVersion = sanitized.osVersion;
  }

  if (
    sanitized.identitySource &&
    sanitized.identitySource !== existingDevice?.identitySource
  ) {
    patch.identitySource = sanitized.identitySource;
  }

  if (sanitized.deviceInfo && sanitized.deviceInfo !== existingDevice?.deviceInfo) {
    patch.deviceInfo = sanitized.deviceInfo;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

module.exports = {
  sanitizeDeviceProfile,
  buildDeviceProfilePatch,
};
