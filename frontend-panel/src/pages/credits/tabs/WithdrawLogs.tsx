import { useState, useMemo, useEffect } from "react";
import { Download, Search, Filter } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import api from "../../../lib/api";
import { formatTransactionNote } from "../../../lib/utils";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function getResellerName(reseller: any, fallbackId?: number | string | null) {
  if (reseller?.name) return reseller.name;
  if (reseller?.code) return reseller.code;
  if (fallbackId) return `Reseller #${fallbackId}`;
  return null;
}

function getActorName(user: any) {
  const role = (user?.role || "").toString().toLowerCase();
  if (role === "superadmin" || role === "admin") return "Administrator";
  return user?.name || user?.email || "Administrator";
}

function buildWithdrawDetails(
  log: any,
  viewer?: any,
  t: TranslateFn = (key) => key,
) {
  const type = (log.type || "").toString().toUpperCase();
  const fromName = getResellerName(log.fromReseller, log.fromResellerId);
  const toName = getResellerName(log.toReseller, log.toResellerId);
  const actorName = getActorName(log.performedBy);
  const actorRole = (log.performedBy?.role || "").toString().toLowerCase();
  const viewerRole = (viewer?.role || "").toString().toLowerCase();
  const viewerResellerId = Number(
    viewer?.resellerId || viewer?.reseller?.id || 0,
  );
  const isViewerSender =
    viewerRole !== "superadmin" &&
    viewerResellerId > 0 &&
    Number(log.fromResellerId || 0) === viewerResellerId;
  const isViewerRecipient =
    viewerRole !== "superadmin" &&
    viewerResellerId > 0 &&
    Number(log.toResellerId || 0) === viewerResellerId;

  if (type === "REVOKE") {
    if (isViewerSender) {
      return t("You revoked credits from {{name}}", {
        name: toName || t("the sub-reseller"),
      });
    }
    if (isViewerRecipient) {
      return actorRole === "superadmin" || actorRole === "admin"
        ? t("Administrator revoked credits from you")
        : t("{{name}} revoked credits from you", { name: actorName });
    }
    return t("{{name}} revoked credits from {{target}}", {
      name: actorName,
      target: toName || t("reseller"),
    });
  }

  if (type === "CREDIT_RETURN") {
    return isViewerSender
      ? t("You requested to return credits to {{name}}", {
          name: toName || t("your parent reseller"),
        })
      : t("{{name}} requested to return credits to {{parent}}", {
          name: fromName || t("Reseller"),
          parent: toName || t("parent reseller"),
        });
  }

  return (
    [
      fromName ? t("From {{name}}", { name: fromName }) : null,
      toName ? t("To {{name}}", { name: toName }) : null,
    ]
      .filter(Boolean)
      .join(" • ") ||
    log.type ||
    "-"
  );
}

export function WithdrawLogs() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [withdrawLogs, setWithdrawLogs] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      try {
        const logs = await api.getCreditLogs();
        if (!mounted) return;
        const items = (Array.isArray(logs) ? logs : [])
          .filter((l: any) => {
            const t = (l.type || "").toString().toLowerCase();
            return (
              t.includes("withdraw") ||
              t.includes("revoke") ||
              t.includes("return") ||
              Number(l.amount) < 0
            );
          })
          .map((l: any) => ({
            id: `WD-${l.id}`,
            date: l.createdAt
              ? new Date(l.createdAt).toLocaleString(locale)
              : "-",
            amount: Math.abs(Number(l.amount || 0)),
            status: (l.status || "").toString().toUpperCase(),
            details: buildWithdrawDetails(l, user, t),
            note: formatTransactionNote(l.notes, l.type),
          }));
        setWithdrawLogs(items);
      } catch (e) {
        console.error("Failed to load withdraw logs", e);
        if (mounted) setWithdrawLogs([]);
      }
    };

    loadLogs();
    window.addEventListener("credits:refresh", loadLogs);
    return () => {
      mounted = false;
      window.removeEventListener("credits:refresh", loadLogs);
    };
  }, [locale, t, user]);

  const filteredLogs = useMemo(() => {
    return withdrawLogs.filter((log) => {
      const matchesSearch =
        log.id.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details || "")
          .toString()
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || log.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [withdrawLogs, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
            placeholder={t("Search withdraw logs...")}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border">
            <Filter
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter withdraw logs by status"
              title="Filter withdraw logs by status"
              className="bg-transparent border-0 p-0 text-foreground focus:ring-0 sm:text-sm"
            >
              <option value="All">{t("All Status")}</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="PENDING">PENDING</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
          <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
          <button className="inline-flex items-center gap-x-2 rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors">
            <Download
              className="-ml-0.5 h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            {t("Export")}
          </button>
        </div>
      </div>

      <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-foreground/5">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-4 pr-3 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t("Log ID")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Date & Time")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-right text-sm font-semibold text-muted-foreground"
                  >
                    {t("Amount Withdrawn")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Details")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Note")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-center text-sm font-semibold text-muted-foreground"
                  >
                    {t("Status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-foreground/5 transition-colors"
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">
                      {log.id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {log.date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-right text-rose-500">
                      -{log.amount}
                    </td>
                    <td className="max-w-sm px-3 py-4 text-sm text-muted-foreground whitespace-normal">
                      {log.details}
                    </td>
                    <td
                      className="max-w-xs px-3 py-4 text-sm text-muted-foreground whitespace-normal"
                      title={
                        log.note === "—" ? t("No note provided.") : log.note
                      }
                    >
                      {log.note}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t("No withdraw logs found matching your filters.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("Log")}
                      </div>
                      <div className="font-semibold text-foreground">
                        {log.id}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                      {log.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        {t("Date")}:
                      </span>{" "}
                      <span className="text-foreground">{log.date}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Amount")}:
                      </span>{" "}
                      <span className="font-medium text-rose-500">
                        -{log.amount}
                      </span>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        {t("Details")}
                      </div>
                      <div className="text-foreground">{log.details}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">{t("Note")}</div>
                      <div className="text-foreground">{log.note}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-8 text-center text-sm text-muted-foreground">
                {t("No withdraw logs found matching your filters.")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
