import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router";
import { ListOrdered, Search, Filter } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import api from "../../../lib/api";

export function MyChargeRequests() {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const targetRequestId = Number(searchParams.get("requestId") || 0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadRequests = async () => {
      try {
        const res = await api.getCreditRequests();
        if (!mounted) return;
        setRequests(Array.isArray(res) ? res : []);
      } catch (error) {
        console.error("Failed to load charge requests", error);
        if (mounted) setRequests([]);
      }
    };

    loadRequests();
    window.addEventListener("credits:refresh", loadRequests);
    return () => {
      mounted = false;
      window.removeEventListener("credits:refresh", loadRequests);
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const matches = requests.filter((req) => {
      const matchesSearch =
        `REQ-${req.id}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.notes || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "All" ||
        (req.status || "").toUpperCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });

    if (!targetRequestId) return matches;

    return [...matches].sort((left, right) => {
      const leftMatch = Number(left.id) === targetRequestId ? 1 : 0;
      const rightMatch = Number(right.id) === targetRequestId ? 1 : 0;
      return rightMatch - leftMatch;
    });
  }, [requests, searchTerm, statusFilter, targetRequestId]);

  useEffect(() => {
    if (!targetRequestId || filteredRequests.length === 0) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(
        `credit-request-${targetRequestId}`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [targetRequestId, filteredRequests, viewMode]);

  return (
    <div className="space-y-6">
      <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-emerald-500" />
              {t("My Charge Requests")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Real request history loaded from the backend.")}
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
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2 pl-9 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("Search requests...")}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter charge requests by status"
                title="Filter charge requests by status"
                className="block rounded-xl border-0 bg-input py-2 pl-3 pr-8 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="All">{t("All Status")}</option>
                <option value="COMPLETED">{t("COMPLETED")}</option>
                <option value="PENDING">{t("PENDING")}</option>
                <option value="REJECTED">{t("REJECTED")}</option>
              </select>
            </div>
            <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>
        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-input">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-4 pr-3 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t("Request ID")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Type")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Amount")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Date")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Notes")}
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
                {filteredRequests.map((req) => {
                  const isTargeted = Number(req.id) === targetRequestId;
                  return (
                    <tr
                      id={`credit-request-${req.id}`}
                      key={req.id}
                      className={`transition-colors ${
                        isTargeted
                          ? "bg-amber-500/10 hover:bg-amber-500/15"
                          : "hover:bg-input"
                      }`}
                    >
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">
                        REQ-{req.id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                        {req.type}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-foreground">
                        {req.amount} {t("Credits")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                        {req.createdAt
                          ? new Date(req.createdAt).toLocaleString(locale)
                          : "-"}
                      </td>
                      <td className="px-3 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {req.notes || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                            req.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                              : req.status === "PENDING"
                                ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                                : "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t("No charge requests found matching your filters.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRequests.length > 0 ? (
              filteredRequests.map((req) => {
                const isTargeted = Number(req.id) === targetRequestId;
                return (
                  <div
                    id={`credit-request-${req.id}`}
                    key={req.id}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      isTargeted
                        ? "border-amber-500/30 bg-amber-500/10"
                        : "border-border bg-foreground/5"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {t("Request")}
                        </div>
                        <div className="font-semibold text-foreground">
                          REQ-{req.id}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                          req.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                            : req.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                              : "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          {t("Type")}:
                        </span>{" "}
                        <span className="text-foreground">{req.type}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {t("Amount")}:
                        </span>{" "}
                        <span className="font-medium text-foreground">
                          {req.amount} {t("Credits")}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {t("Date")}:
                        </span>{" "}
                        <span className="text-foreground">
                          {req.createdAt
                            ? new Date(req.createdAt).toLocaleString(locale)
                            : "-"}
                        </span>
                      </div>
                      <div>
                        <div className="text-muted-foreground">
                          {t("Notes")}
                        </div>
                        <div className="text-foreground">
                          {req.notes || "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-8 text-center text-sm text-muted-foreground">
                {t("No charge requests found matching your filters.")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
