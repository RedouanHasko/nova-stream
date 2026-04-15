import { useState, useEffect } from "react";
import {
  Search,
  Monitor,
  ShieldCheck,
  KeyRound,
  Layers,
  Loader2,
  CheckCircle,
  XCircle,
  Wifi,
} from "lucide-react";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

interface AppItem {
  id: string;
  name: string;
  price: number;
}

export function CheckMac() {
  const { t, locale } = useI18n();
  const [mac, setMac] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [module, setModule] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const catalog = await api.getAppCatalog();
        if (mounted && Array.isArray(catalog)) {
          setApps(catalog);
        }
      } catch (e) {
        console.error("Failed to load app catalog", e);
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCheck = async () => {
    setError(null);
    setResult(null);
    if (!mac || mac.replace(/[^a-fA-F0-9]/g, "").length < 12) {
      setError(t("Enter a valid MAC address (12 hex digits)"));
      return;
    }
    if (!deviceKey.trim()) {
      setError(t("Enter the player device key"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.checkMac(
        mac,
        deviceKey.trim(),
        module || undefined,
      );
      setResult(res);
    } catch (e: any) {
      setError(e?.message || t("Failed to check device"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <Monitor className="h-5 w-5 text-emerald-500" />
            {t("Check Device Activation")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Verify activation using the device MAC address and player-generated key.",
            )}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Select Module */}
          <div>
            <label
              htmlFor="module"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("Select Module")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Layers
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <select
                id="module"
                name="module"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-10 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 bg-input"
              >
                <option value="">{t("All Modules")}</option>
                {catalogLoading ? (
                  <option disabled>{t("Loading...")}</option>
                ) : (
                  apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* MAC Address */}
          <div>
            <label
              htmlFor="mac"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("MAC Address")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ShieldCheck
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="mac"
                id="mac"
                value={mac}
                onChange={(e) => setMac(formatMAC(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 font-mono uppercase"
                placeholder="XX:XX:XX:XX:XX:XX"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Format: 12 hexadecimal digits separated by colons.")}
            </p>
          </div>

          <div>
            <label
              htmlFor="deviceKey"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("Device Key")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="deviceKey"
                id="deviceKey"
                value={deviceKey}
                onChange={(e) => setDeviceKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("Enter the player-generated key")}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Use the same key shown inside the IPTV player application on the device.",
              )}
            </p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            type="button"
            disabled={loading}
            onClick={handleCheck}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground gap-2 transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? t("Checking...") : t("Check Device")}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 px-6 py-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
          <p className="text-sm text-rose-500 font-medium">{error}</p>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
          <div className="border-b border-border px-6 py-4 bg-foreground/5 flex items-center gap-3">
            {result.exists ? (
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-500" />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {result.exists ? t("Device Found") : t("Device Not Found")}
            </h3>
          </div>

          {result.exists && result.device && (
            <div className="px-6 py-5 space-y-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("MAC Address")}
                  </dt>
                  <dd className="mt-1 text-sm font-mono text-foreground">
                    {result.device.mac}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Verification")}
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        result.keyMatches === false
                          ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                          : result.activated
                            ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                            : result.reason === "expired"
                              ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                              : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                      }`}
                    >
                      <Wifi className="h-3 w-3" />
                      {result.keyMatches === false
                        ? t("Key mismatch")
                        : result.activated
                          ? t("Verified")
                          : result.reason === "expired"
                            ? t("Expired")
                            : t("No active apps")}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Device Key")}
                  </dt>
                  <dd className="mt-1 text-sm font-mono text-foreground break-all">
                    {result.device.deviceKey || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Status")}
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        (result.device.status || "").toLowerCase() === "active"
                          ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                          : (result.device.status || "").toLowerCase() ===
                              "expired"
                            ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                            : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                      }`}
                    >
                      <Wifi className="h-3 w-3" />
                      {t(result.device.status || "Unknown")}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Owner Reseller ID")}
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {result.device.ownerResellerId || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Registered")}
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {result.device.createdAt
                      ? new Date(result.device.createdAt).toLocaleString(locale)
                      : "—"}
                  </dd>
                </div>
                {result.device.domainUrl && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t("Domain URL")}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {result.device.domainUrl}
                    </dd>
                  </div>
                )}
              </dl>

              {result.keyMatches === false && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                  <p className="text-sm font-medium text-rose-500">
                    {t(
                      "The provided device key does not match the key saved for this MAC address.",
                    )}
                  </p>
                </div>
              )}

              {result.reason === "expired" && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                  <p className="text-sm font-medium text-rose-500">
                    {t(
                      "This device has expired activations. Renew the app activation or reactivate it from the panel to restore access.",
                    )}
                  </p>
                </div>
              )}

              {Array.isArray(result.activations) &&
                result.activations.length > 0 && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-foreground">
                      {t("Applications Found")}
                    </h4>
                    <div className="space-y-2">
                      {result.activations.map((activation: any) => (
                        <div
                          key={activation.id}
                          className="rounded-xl border border-border bg-foreground/5 px-4 py-3"
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {activation.appName ||
                                  `App #${activation.applicationId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("Activated")}{" "}
                                {new Date(
                                  activation.activatedAt,
                                ).toLocaleString(locale)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                                  (activation.status || "")
                                    .toString()
                                    .toUpperCase() === "ACTIVE"
                                    ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                                }`}
                              >
                                {t(
                                  (activation.status || "ACTIVE")
                                    .toString()
                                    .toUpperCase(),
                                )}
                              </span>
                              <span>
                                {activation.duration === "lifetime"
                                  ? t("Lifetime")
                                  : activation.expiresAt
                                    ? `${t("Expires")} ${new Date(activation.expiresAt).toLocaleDateString(locale)}`
                                    : t("No expiry set")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {Array.isArray(result.playlists) &&
                result.playlists.length > 0 && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-foreground">
                      {t("Linked Playlists")}
                    </h4>
                    <div className="space-y-2">
                      {result.playlists.map((playlist: any) => (
                        <div
                          key={playlist.assignmentId || playlist.id}
                          className="rounded-xl border border-border bg-foreground/5 px-4 py-3"
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {playlist.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {playlist.targetAppName
                                  ? t("Target app: {{app}}", {
                                      app: playlist.targetAppName,
                                    })
                                  : playlist.targetApplicationId
                                    ? t("Target app ID: {{id}}", {
                                        id: playlist.targetApplicationId,
                                      })
                                    : t("Available to this device")}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {playlist.type?.toUpperCase() || "PLAYLIST"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {!result.exists && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("No device with MAC address")}{" "}
                <span className="font-mono font-semibold text-foreground">
                  {mac}
                </span>{" "}
                {t("was found in the system.")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
