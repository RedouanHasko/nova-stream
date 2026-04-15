import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Download, Search, Filter } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import api from "../../../lib/api";
import {
  formatTransactionNote,
  parseTransactionNoteObject,
} from "../../../lib/utils";

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

function buildTransactionDetails(
  trx: any,
  viewer?: any,
  t: TranslateFn = (key) => key,
) {
  const type = (trx.type || "").toString().toUpperCase();
  const fromName = getResellerName(trx.fromReseller, trx.fromResellerId);
  const toName = getResellerName(trx.toReseller, trx.toResellerId);
  const actorName = getActorName(trx.performedBy);
  const noteData = parseTransactionNoteObject(trx.notes);
  const actorRole = (trx.performedBy?.role || "").toString().toLowerCase();
  const viewerRole = (viewer?.role || "").toString().toLowerCase();
  const viewerResellerId = Number(
    viewer?.resellerId || viewer?.reseller?.id || 0,
  );
  const isViewerSender =
    viewerRole !== "superadmin" &&
    viewerResellerId > 0 &&
    Number(trx.fromResellerId || 0) === viewerResellerId;
  const isViewerRecipient =
    viewerRole !== "superadmin" &&
    viewerResellerId > 0 &&
    Number(trx.toResellerId || 0) === viewerResellerId;

  switch (type) {
    case "RECHARGE_REQUEST":
      return isViewerRecipient
        ? t("You requested credits from Administrator")
        : t("{{name}} requested credits from Administrator", {
            name: toName || t("Reseller"),
          });
    case "CREDIT_REQUEST":
      return isViewerRecipient
        ? t("You requested credits from {{name}}", {
            name: fromName || t("your parent reseller"),
          })
        : t("{{requester}} requested credits from {{parent}}", {
            requester: toName || t("Reseller"),
            parent: fromName || t("parent reseller"),
          });
    case "CREDIT_RETURN":
      return isViewerSender
        ? t("You requested to return credits to {{name}}", {
            name: toName || t("your parent reseller"),
          })
        : t("{{name}} requested to return credits to {{parent}}", {
            name: fromName || t("Reseller"),
            parent: toName || t("parent reseller"),
          });
    case "TOPUP":
      return isViewerRecipient
        ? t("Administrator transferred credits to you")
        : t("{{name}} transferred credits to {{target}}", {
            name: actorName,
            target: toName || t("reseller"),
          });
    case "PLAN_PURCHASE":
      return isViewerRecipient
        ? t("You completed a recharge plan purchase")
        : t("{{name}} completed a recharge plan purchase", {
            name: toName || t("Reseller"),
          });
    case "PUBLIC_PLAN_PURCHASE": {
      const clientLabel =
        noteData?.customerName || noteData?.customerEmail || t("Direct client");
      return t("{{name}} purchased a direct activation plan", {
        name: clientLabel,
      });
    }
    case "TRANSFER":
      if (isViewerSender) {
        return t("You transferred credits to {{name}}", {
          name: toName || t("the sub-reseller"),
        });
      }
      if (isViewerRecipient) {
        return actorRole === "superadmin" || actorRole === "admin"
          ? t("Administrator transferred credits to you")
          : t("{{name}} transferred credits to you", {
              name: fromName || actorName,
            });
      }
      return t("{{name}} transferred credits to {{target}}", {
        name: fromName || actorName,
        target: toName || t("reseller"),
      });
    case "REVOKE":
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
    default:
      return (
        [
          fromName ? t("From {{name}}", { name: fromName }) : null,
          toName ? t("To {{name}}", { name: toName }) : null,
        ]
          .filter(Boolean)
          .join(" • ") || "-"
      );
  }
}

export function CreditLogs() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get("search") || "";
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setSearchTerm(requestedSearch);
  }, [requestedSearch]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, typeFilter]);

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      try {
        const logs = await api.getCreditLogs({
          page,
          pageSize,
          search: searchQuery || undefined,
          type: typeFilter === "All" ? undefined : typeFilter,
        });
        if (!mounted) return;

        const items = Array.isArray(logs)
          ? logs
          : Array.isArray(logs?.items)
            ? logs.items
            : [];

        const mapped = items.map((trx: any) => ({
          id: `TRX-${trx.id}`,
          raw: trx,
          date: trx.createdAt
            ? new Date(trx.createdAt).toLocaleString(locale)
            : "-",
          type: (trx.type || "").toString().toUpperCase(),
          amount: Number(trx.amount || 0),
          details: buildTransactionDetails(trx, user, t),
          note: formatTransactionNote(trx.notes, trx.type),
          balance: trx.toAfterBalance ?? trx.fromAfterBalance ?? "-",
          status: (trx.status || "").toString().toUpperCase(),
        }));

        setTransactions(mapped);
        if (Array.isArray(logs)) {
          setTotal(logs.length);
          setHasMore(false);
        } else {
          setTotal(Number(logs?.total || 0));
          setHasMore(Boolean(logs?.hasMore));
        }
      } catch (e) {
        console.error("Failed to load credit logs", e);
        if (mounted) {
          setTransactions([]);
          setTotal(0);
          setHasMore(false);
        }
      }
    };

    loadLogs();
    window.addEventListener("credits:refresh", loadLogs);
    return () => {
      mounted = false;
      window.removeEventListener("credits:refresh", loadLogs);
    };
  }, [locale, t, user, page, pageSize, searchQuery, typeFilter]);

  const availableTypes = useMemo(
    () => [
      "TRANSFER",
      "TOPUP",
      "REVOKE",
      "CREDIT_REQUEST",
      "CREDIT_RETURN",
      "RECHARGE_REQUEST",
      "PLAN_PURCHASE",
      "PUBLIC_PLAN_PURCHASE",
    ],
    [],
  );

  const filteredTransactions = transactions;

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
            placeholder={t("Search transactions...")}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border">
            <Filter
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter credit logs by type"
              title="Filter credit logs by type"
              className="bg-transparent border-0 p-0 text-foreground focus:ring-0 sm:text-sm"
            >
              <option value="All">{t("All Types")}</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
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
                    {t("Transaction ID")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Date & Time")}
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
                    {t("Requester / Recipient")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Note")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-right text-sm font-semibold text-muted-foreground"
                  >
                    {t("Amount")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-right text-sm font-semibold text-muted-foreground"
                  >
                    {t("Balance")}
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
                {filteredTransactions.map((trx) => (
                  <tr
                    key={trx.id}
                    className="hover:bg-foreground/5 transition-colors"
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">
                      {trx.id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {trx.date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {trx.type}
                    </td>
                    <td className="max-w-sm px-3 py-4 text-sm text-muted-foreground whitespace-normal">
                      {trx.details}
                    </td>
                    <td
                      className="max-w-xs px-3 py-4 text-sm text-muted-foreground whitespace-normal"
                      title={
                        trx.note === "—" ? t("No note provided.") : trx.note
                      }
                    >
                      {trx.note}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-4 text-sm font-medium text-right ${trx.amount > 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {trx.amount > 0 ? "+" : ""}
                      {trx.amount}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-foreground font-medium text-right">
                      {trx.balance}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                        {trx.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t("No transactions found matching your filters.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((trx) => (
                <div
                  key={trx.id}
                  className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("Transaction")}
                      </div>
                      <div className="font-semibold text-foreground">
                        {trx.id}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                      {trx.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        {t("Date")}:
                      </span>{" "}
                      <span className="text-foreground">{trx.date}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Type")}:
                      </span>{" "}
                      <span className="text-foreground">{trx.type}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Amount")}:
                      </span>{" "}
                      <span
                        className={
                          trx.amount > 0
                            ? "text-emerald-500 font-medium"
                            : "text-rose-500 font-medium"
                        }
                      >
                        {trx.amount > 0 ? "+" : ""}
                        {trx.amount}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Balance")}:
                      </span>{" "}
                      <span className="text-foreground">{trx.balance}</span>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        {t("Requester / Recipient")}
                      </div>
                      <div className="text-foreground">{trx.details}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">{t("Note")}</div>
                      <div className="text-foreground">{trx.note}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-8 text-center text-sm text-muted-foreground">
                No transactions found matching your filters.
              </div>
            )}
          </div>
        )}

        <div className="border-t border-border bg-foreground/5 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t("Showing")} {filteredTransactions.length} {t("of")} {total}{" "}
              {t("results")}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Previous")}
              </button>
              <span className="text-sm text-muted-foreground">
                {t("Page")} {page}
              </span>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
