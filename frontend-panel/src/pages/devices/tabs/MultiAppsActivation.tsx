import { useState, useEffect } from "react";
import api from "../../../lib/api";
import {
  Layers,
  ShieldCheck,
  KeyRound,
  Clock,
  Loader2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatMAC, cn } from "../../../lib/utils";
import { useI18n } from "../../../contexts/I18nContext";

interface AppItem {
  id: number;
  name: string;
  logoUrl?: string;
  price?: number;
}

export function MultiAppsActivation() {
  const { t } = useI18n();
  const [mac, setMac] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [duration, setDuration] = useState<"1_year" | "lifetime">("1_year");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [apps, setApps] = useState<AppItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const catalog = await api.getApplications();
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

  const toggle = (id: number) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const selectedAppIds = Object.keys(selected).filter(
    (k) => selected[Number(k)],
  );

  const totalCost = selectedAppIds.reduce((sum, id) => {
    const a = apps.find((x) => x.id === Number(id));
    if (!a) return sum;
    const mult = duration === "lifetime" ? 2 : 1;
    return sum + (a.price || 1) * mult;
  }, 0);

  const handleActivate = async () => {
    setMessage(null);
    if (!mac) return setMessage(t("Enter a MAC address"));
    if (!deviceKey.trim()) return setMessage(t("Enter the player device key"));
    if (selectedAppIds.length === 0)
      return setMessage(t("Select at least one app"));
    setLoading(true);
    try {
      const appsPayload = selectedAppIds.map((id) => ({
        id: Number(id),
        duration,
      }));
      await api.activateDevice(
        mac,
        deviceKey.trim(),
        appsPayload,
        undefined,
        undefined,
        remarks.trim(),
      );
      setMessage(t("Activation successful"));
      setSelected({});
      setMac("");
      setDeviceKey("");
      setRemarks("");
    } catch (e: any) {
      setMessage(e?.message || t("Activation failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-foreground/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {t("Multi Apps Activation")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(
                  "Please note that each App should be installed before activating!",
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
            <p className="text-sm text-rose-500 font-medium">
              {t(
                "You can select up to 4 Apps Max, for 1 year 1-credit & for Lifetime 2-credits will be debited from your account",
              )}
            </p>
          </div>
        </div>

        <div className="p-8 space-y-10">
          {/* App Selection Grid - Visually matching user screenshot */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("Select Applications")}
            </h3>
            {catalogLoading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-foreground/5 rounded-2xl border-2 border-dashed border-border gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-foreground/20" />
                <p className="text-muted-foreground font-medium">
                  {t("Fetching App Catalog...")}
                </p>
              </div>
            ) : apps.length === 0 ? (
              <div className="p-10 text-center bg-foreground/5 rounded-2xl border-2 border-dashed border-border">
                <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                <p className="text-muted-foreground">
                  {t("No applications available in the catalog.")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => toggle(app.id)}
                    className={cn(
                      "flex flex-col items-center gap-3 group transition-all",
                      selected[app.id] ? "scale-105" : "hover:scale-102",
                    )}
                  >
                    <div
                      className={cn(
                        "relative h-24 w-24 rounded-2xl border-2 overflow-hidden bg-card shadow-sm flex items-center justify-center transition-all dark:bg-slate-900",
                        selected[app.id]
                          ? "border-emerald-500 ring-4 ring-emerald-500/10"
                          : "border-border group-hover:border-foreground/20",
                      )}
                    >
                      {app.logoUrl ? (
                        <img
                          src={api.resolveImageUrl(app.logoUrl)}
                          alt={app.name}
                          className="h-full w-full object-contain p-2"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                      )}
                      {selected[app.id] && (
                        <div className="absolute top-1 right-1">
                          <div className="h-5 w-5 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-bold uppercase tracking-tight text-center truncate w-full px-1",
                        selected[app.id]
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground/80 dark:text-slate-300",
                      )}
                    >
                      {app.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Duration Radios */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("Select Duration")}
              </h3>
              <div className="space-y-3">
                <label
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                    duration === "1_year"
                      ? "bg-emerald-500/5 border-emerald-500/20 ring-1 ring-emerald-500/50"
                      : "bg-foreground/5 border-border hover:border-foreground/10",
                  )}
                >
                  <input
                    type="radio"
                    name="duration"
                    checked={duration === "1_year"}
                    onChange={() => setDuration("1_year")}
                    className="h-5 w-5 text-emerald-500 border-border focus:ring-emerald-500 bg-input"
                  />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {t("1-Year Activation")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("Standard 1 Credit activation")}
                    </p>
                  </div>
                </label>
                <label
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                    duration === "lifetime"
                      ? "bg-emerald-500/5 border-emerald-500/20 ring-1 ring-emerald-500/50"
                      : "bg-foreground/5 border-border hover:border-foreground/10",
                  )}
                >
                  <input
                    type="radio"
                    name="duration"
                    checked={duration === "lifetime"}
                    onChange={() => setDuration("lifetime")}
                    className="h-5 w-5 text-emerald-500 border-border focus:ring-emerald-500 bg-input"
                  />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {t("Lifetime Activation")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("Unlimited access for 2 Credits")}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Target Details */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("Device Settings")}
                </h3>
                <div className="space-y-2">
                  <label
                    htmlFor="mac"
                    className="text-xs font-bold text-muted-foreground ml-1"
                  >
                    {t("MAC Address")}
                  </label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-foreground" />
                    <input
                      id="mac"
                      type="text"
                      value={mac}
                      onChange={(e) => setMac(formatMAC(e.target.value))}
                      placeholder="XX:XX:XX:XX:XX:XX"
                      className="w-full bg-input border-border rounded-xl py-3.5 pl-12 pr-4 text-sm font-mono uppercase focus:ring-2 focus:ring-foreground/10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="deviceKey"
                    className="text-xs font-bold text-muted-foreground ml-1"
                  >
                    {t("Device Key")}
                  </label>
                  <div className="relative group">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-foreground" />
                    <input
                      id="deviceKey"
                      type="text"
                      value={deviceKey}
                      onChange={(e) => setDeviceKey(e.target.value)}
                      placeholder={t("Enter the player-generated key")}
                      className="w-full bg-input border-border rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-foreground/10"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-1">
                    {t(
                      "Use the unique key shown inside the IPTV player app on this device.",
                    )}
                  </p>
                </div>
              </div>

              {/* Remarks/Notes */}
              <div className="space-y-2">
                <label
                  htmlFor="remarks"
                  className="text-xs font-bold text-muted-foreground ml-1"
                >
                  {t("Remarks (Optional)")}
                </label>
                <input
                  id="remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={t("Note about this activation...")}
                  className="w-full bg-input border-border rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-foreground/10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Total Cost & Action */}
        <div className="p-6 bg-foreground/5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {t("Total Cost")}
              </span>
              <span className="text-2xl font-black text-emerald-500">
                {totalCost} {t("Credits")}
              </span>
            </div>
            {selectedAppIds.length > 0 && (
              <div className="h-10 w-px bg-border hidden sm:block" />
            )}
            <div className="hidden sm:flex flex-wrap gap-2 max-w-xs">
              {selectedAppIds.map((id) => {
                const a = apps.find((x) => x.id === Number(id));
                return (
                  a && (
                    <span
                      key={id}
                      className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300"
                    >
                      {a.name}
                    </span>
                  )
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            {message && (
              <p
                className={cn(
                  "text-sm font-bold",
                  message.includes("successful")
                    ? "text-emerald-500"
                    : "text-rose-500",
                )}
              >
                {message}
              </p>
            )}
            <button
              onClick={handleActivate}
              disabled={
                loading ||
                catalogLoading ||
                selectedAppIds.length === 0 ||
                !mac ||
                !deviceKey.trim()
              }
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold rounded-xl shadow-lg shadow-rose-900/10 transition-all active:scale-95"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              {loading ? t("Activating...") : t("Activate Now")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
        <div className="p-3 bg-amber-500 text-white rounded-xl shadow-lg shadow-amber-500/10">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-600">
            {t("Check app details before activation")}
          </p>
          <p className="text-xs text-amber-500/80">
            {t(
              "Make sure you select the correct app and version before continuing.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
