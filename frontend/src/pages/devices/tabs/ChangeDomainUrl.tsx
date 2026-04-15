import { useEffect, useState } from "react";
import {
  Globe,
  ShieldCheck,
  Link as LinkIcon,
  Layers,
  Loader2,
} from "lucide-react";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

interface ApplicationItem {
  id: number;
  name: string;
}

export function ChangeDomainUrl() {
  const { t } = useI18n();
  const [selectedModule, setSelectedModule] = useState("");
  const [mac, setMac] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const catalog = await api.getApplications();
        if (mounted) {
          setApps(Array.isArray(catalog) ? catalog : []);
        }
      } catch (error) {
        console.error("Failed to load applications for domain change", error);
        if (mounted) {
          setApps([]);
        }
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdate = async () => {
    setMessage(null);
    if (!selectedModule || !mac || !newDomain) {
      return setMessage(
        t("Select the module, then provide the MAC address and new domain."),
      );
    }
    setLoading(true);
    try {
      await api.updateDeviceDomain(mac, newDomain);
      setMessage(t("Domain updated successfully"));
      setSelectedModule("");
      setMac("");
      setNewDomain("");
    } catch (e: any) {
      setMessage(e?.message || t("Update failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-500" />
            {t("Change Domain Url")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Update the portal or domain URL for specific devices.")}
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
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                disabled={catalogLoading || loading}
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-10 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 bg-input disabled:cursor-not-allowed disabled:opacity-70"
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
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "This list is loaded from the applications available in your system.",
              )}
            </p>
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
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 font-mono uppercase"
                placeholder="XX:XX:XX:XX:XX:XX"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Old Domain */}
            <div>
              <label
                htmlFor="old-domain"
                className="block text-sm font-medium leading-6 text-foreground"
              >
                {t("Old Domain URL")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <LinkIcon
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="url"
                  name="old-domain"
                  id="old-domain"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                  placeholder="http://old-portal.com:8080"
                />
              </div>
            </div>

            {/* New Domain */}
            <div>
              <label
                htmlFor="new-domain"
                className="block text-sm font-medium leading-6 text-foreground"
              >
                {t("New Domain URL")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <LinkIcon
                    className="h-5 w-5 text-emerald-500"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="url"
                  name="new-domain"
                  id="new-domain"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                  placeholder="http://new-portal.com:8080"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-input px-6 py-4 flex items-center justify-between border-t border-border">
          <div className="text-sm">
            {message && (
              <span
                className={
                  message.includes("successfully")
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
            onClick={handleUpdate}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring gap-2 transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            {loading ? t("Updating...") : t("Update Domain")}
          </button>
        </div>
      </div>
    </div>
  );
}
