import { useEffect, useState } from "react";
import { ArrowRightLeft, Monitor, ShieldCheck, Layers } from "lucide-react";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

interface ApplicationItem {
  id: number;
  name: string;
}

export function SwitchMac() {
  const { t } = useI18n();
  const [oldMac, setOldMac] = useState("");
  const [newMac, setNewMac] = useState("");
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const catalog = await api.getApplications();
        if (mounted) setApps(Array.isArray(catalog) ? catalog : []);
      } catch {
        if (mounted) setApps([]);
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSwitch = async () => {
    setMessage(null);
    if (!oldMac || !newMac) return setMessage(t("Enter both MAC addresses"));
    setLoading(true);
    try {
      await api.switchMac(oldMac, newMac);
      setMessage(t("Transfer successful"));
      setOldMac("");
      setNewMac("");
    } catch (e: any) {
      setMessage(e?.message || t("Transfer failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-emerald-500" />
            {t("Switch MAC Address")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Transfer an active subscription from an old device to a new one.",
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
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-10 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 bg-input disabled:opacity-70 disabled:cursor-not-allowed"
                defaultValue=""
                disabled={catalogLoading || loading}
              >
                <option value="" disabled>
                  {catalogLoading
                    ? t("Loading modules...")
                    : apps.length > 0
                      ? t("Select a module")
                      : t("No applications found")}
                </option>
                {apps.map((app) => (
                  <option key={app.id} value={String(app.id)}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Old MAC Address */}
            <div>
              <label
                htmlFor="old-mac"
                className="block text-sm font-medium leading-6 text-foreground"
              >
                {t("Old MAC Address")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Monitor
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="text"
                  name="old-mac"
                  id="old-mac"
                  value={oldMac}
                  onChange={(e) => setOldMac(formatMAC(e.target.value))}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 font-mono uppercase"
                  placeholder="XX:XX:XX:XX:XX:XX"
                />
              </div>
            </div>

            {/* New MAC Address */}
            <div>
              <label
                htmlFor="new-mac"
                className="block text-sm font-medium leading-6 text-foreground"
              >
                {t("New MAC Address")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <ShieldCheck
                    className="h-5 w-5 text-emerald-500"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="text"
                  name="new-mac"
                  id="new-mac"
                  value={newMac}
                  onChange={(e) => setNewMac(formatMAC(e.target.value))}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 font-mono uppercase"
                  placeholder="YY:YY:YY:YY:YY:YY"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-foreground/5 px-6 py-4 flex items-center justify-between border-t border-border">
          <div className="text-sm">
            {message && (
              <span
                className={
                  message.includes("successful")
                    ? "text-emerald-500"
                    : "text-rose-500"
                }
              >
                {message}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleSwitch}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground gap-2 transition-all disabled:opacity-60"
          >
            {loading ? (
              <span className="animate-spin text-sm">🌀</span>
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )}
            {loading ? t("Transferring...") : t("Transfer Subscription")}
          </button>
        </div>
      </div>
    </div>
  );
}
