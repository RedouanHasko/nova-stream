import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Search,
  X,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LogIn,
  Settings,
  Filter,
} from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";
import api from "../../lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  credits: "Credits",
  auth: "Auth",
  system: "System",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  credits:
    "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  auth: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  system: "bg-violet-500/10 text-violetald-500 ring-violet-500/20",
  other: "bg-foreground/10 text-muted-foreground ring-border",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  credits: CreditCard,
  auth: LogIn,
  system: Settings,
  other: ShieldCheck,
};

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category;
  const cls = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function EventBadge({ event }: { event: string }) {
  const label = (event || "").replace(/_/g, " ");
  return (
    <span className="inline-flex items-center rounded-md bg-foreground/5 px-2 py-0.5 text-xs font-mono text-muted-foreground ring-1 ring-inset ring-border">
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditLogs() {
  const { t } = useI18n();

  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [eventOptions, setEventOptions] = useState<string[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        page,
        pageSize,
        category: categoryFilter || undefined,
        search: searchQuery || undefined,
      });
      setEntries(data?.items ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, categoryFilter, searchQuery]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.getAuditLogEvents().then((events: string[]) => {
      setEventOptions(Array.isArray(events) ? events : []);
    }).catch(() => {});
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchTerm);
  }

  function handleCategoryChange(cat: string) {
    setCategoryFilter(cat);
    setPage(1);
  }

  function clearFilters() {
    setCategoryFilter("");
    setSearchTerm("");
    setSearchQuery("");
    setPage(1);
  }

  function exportCSV() {
    const headers = ["Timestamp", "Category", "Event", "IP", "Email", "User ID", "Method", "Path", "Details"];
    const rows = entries.map((e) => [
      e.timestamp ?? "",
      e.category ?? "",
      e.event ?? "",
      e.ip ?? "",
      e.email ?? "",
      e.userId ?? "",
      e.method ?? "",
      e.path ?? "",
      JSON.stringify(e.details ?? {}),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = categoryFilter || searchQuery;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t("Audit Logs")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("Security events, auth activity and credit transactions")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </button>
          <button
            onClick={exportCSV}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("Export CSV")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Category tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["", "credits", "auth", "system"] as const).map((cat) => {
            const Icon = cat ? CATEGORY_ICONS[cat] : Filter;
            const label = cat ? CATEGORY_LABELS[cat] : t("All");
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("Search IP, email, event…")}
              className="w-56 rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("Search")}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
              {t("Clear")}
            </button>
          )}
        </form>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {total.toLocaleString()} {t("entries")}
          {hasFilters ? ` (${t("filtered")})` : ""}
        </span>
        {eventOptions.length > 0 && (
          <span className="text-muted-foreground/50">
            · {eventOptions.length} {t("distinct event types")}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Timestamp")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Category")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Event")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("User / Email")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("IP Address")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Path")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Details")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    {t("Loading…")}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    {t("No audit log entries found.")}
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={entry.category} />
                    </td>
                    <td className="px-4 py-3">
                      <EventBadge event={entry.event} />
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground">
                      <div>{entry.email || "-"}</div>
                      {entry.userId && (
                        <div className="text-muted-foreground">#{entry.userId}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.ip || "-"}
                    </td>
                    <td className="max-w-45 truncate px-4 py-3 text-xs text-muted-foreground">
                      <span title={`${entry.method ?? ""} ${entry.path ?? ""}`}>
                        {entry.method} {entry.path}
                      </span>
                    </td>
                    <td className="max-w-50 px-4 py-3 text-xs text-muted-foreground">
                      {entry.details && Object.keys(entry.details).length > 0 ? (
                        <details className="cursor-pointer">
                          <summary className="select-none text-primary hover:underline">
                            {t("View")}
                          </summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {t("Page")} {page} {t("of")} {totalPages} · {total.toLocaleString()} {t("entries")}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                title="Previous page"
                aria-label="Previous page"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                title="Next page"
                aria-label="Next page"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
