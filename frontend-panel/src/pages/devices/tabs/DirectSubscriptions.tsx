import { useState, useEffect, useMemo } from "react";
import { User, Search, Filter, CreditCard } from "lucide-react";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import { useI18n } from "../../../contexts/I18nContext";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";

// No hardcoded labels - use the appName from DB

export function DirectSubscriptions() {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  const availableTypes = useMemo(
    () =>
      Array.from(
        new Set(
          subscriptions.map((sub) => sub.appName || "Unknown Application"),
        ),
      ),
    [subscriptions],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getActivations();
        // Treat activations where device.ownerResellerId is null as direct purchases
        const direct = (res || []).filter(
          (a: any) => !a.device || !a.device.ownerResellerId,
        );
        if (mounted) setSubscriptions(direct);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredSubscriptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      const mac = (sub.device?.mac || String(sub.deviceId || "")).toLowerCase();
      const app = (sub.appName || "").toLowerCase();
      const key = `ACT-${sub.id}`.toLowerCase();

      const matchesSearch =
        !q || mac.includes(q) || app.includes(q) || key.includes(q);

      const matchesType =
        typeFilter === "All" ||
        (sub.appName || "Unknown Application") === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [searchTerm, typeFilter, subscriptions]);

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-blue-500" />
              {t("Direct Individual Subscriptions")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "View subscriptions purchased directly by individuals via the landing page.",
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(formatMAC(e.target.value))}
                className="block w-full rounded-xl border-0 bg-input py-2 pl-9 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("Search MAC or Key...")}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label={t("Filter direct subscriptions by application")}
                title={t("Filter direct subscriptions by application")}
                className="block rounded-xl border-0 bg-input py-2 pl-3 pr-8 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="All">{t("All Applications")}</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-foreground/5">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-6 pr-3 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("MAC Address")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    Subscription Key
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Price")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Application")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Expiry Date")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {filteredSubscriptions.map((sub) => (
                  <tr
                    key={sub.id}
                    className="hover:bg-foreground/5 transition-colors"
                  >
                    <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-mono font-medium text-foreground">
                      {sub.device?.mac || sub.deviceId}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-muted-foreground">{`ACT-${sub.id}`}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1 text-foreground font-medium">
                        <CreditCard className="h-3.5 w-3.5 text-blue-500" />—
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-emerald-500">
                      —
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {sub.appName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {new Date(sub.activatedAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset text-emerald-500 bg-emerald-500/10 ring-emerald-500/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                        {t("Active")}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredSubscriptions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      {t("No direct subscriptions found.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSubscriptions.length > 0 ? (
              filteredSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("MAC Address")}
                      </div>
                      <div className="font-mono text-sm font-medium text-foreground">
                        {sub.device?.mac || sub.deviceId}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset text-emerald-500 bg-emerald-500/10 ring-emerald-500/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      Active
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Subscription Key")}
                      </span>
                      <span className="font-mono text-foreground">
                        ACT-{sub.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Application")}
                      </span>
                      <span className="font-medium text-foreground">
                        {sub.appName || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Type")}</span>
                      <span className="inline-flex items-center gap-1 text-foreground font-medium">
                        <CreditCard className="h-3.5 w-3.5 text-blue-500" />—
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Price")}
                      </span>
                      <span className="font-medium text-emerald-500">—</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Expiry")}
                      </span>
                      <span className="text-foreground">
                        {new Date(sub.activatedAt).toLocaleDateString(locale)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 px-6 py-10 text-center text-sm text-muted-foreground">
                {t("No direct subscriptions found.")}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-border bg-foreground/5 px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {t("Showing all")}
            <span className="font-medium text-foreground">
              {filteredSubscriptions.length}
            </span>{" "}
            {t("results")}
          </p>
        </div>
      </div>
    </div>
  );
}
