import { Search, Filter, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useSearchParams } from "react-router";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import api from "../../../lib/api";
import { TransferCreditsModal } from "../../credits/TransferCreditsModal";
import { EditResellerModal } from "../../../components/resellers/EditResellerModal";
import { DeleteResellerModal } from "../../../components/resellers/DeleteResellerModal";
import { ActionMenu } from "../../../components/resellers/ActionMenu";

export function ResellerList() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get("search") || "";
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<any | null>(null);
  const [resellers, setResellers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [accountFilter, setAccountFilter] = useState("All");
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

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
  }, [searchQuery, statusFilter, accountFilter]);

  useEffect(() => {
    let mounted = true;

    const fetchResellers = async () => {
      try {
        const statusParam =
          statusFilter === "All" ? undefined : statusFilter.toUpperCase();
        const accountTypeParam =
          accountFilter === "Main Resellers"
            ? "main"
            : accountFilter === "Sub-Resellers"
              ? "sub"
              : "all";

        const data = await api.getResellers({
          page,
          pageSize,
          search: searchQuery || undefined,
          status: statusParam,
          accountType: accountTypeParam,
        });

        if (!mounted) return;

        if (Array.isArray(data)) {
          setResellers(data);
          setTotal(data.length);
          setHasMore(false);
          return;
        }

        setResellers(Array.isArray(data?.items) ? data.items : []);
        setTotal(Number(data?.total || 0));
        setHasMore(Boolean(data?.hasMore));
      } catch (e) {
        console.error("Failed to fetch resellers", e);
        if (mounted) {
          setResellers([]);
          setTotal(0);
          setHasMore(false);
        }
      }
    };

    fetchResellers();

    const onRefresh = () => fetchResellers();
    window.addEventListener("resellers:refresh", onRefresh);
    window.addEventListener("credits:refresh", onRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("resellers:refresh", onRefresh);
      window.removeEventListener("credits:refresh", onRefresh);
    };
  }, [page, pageSize, searchQuery, statusFilter, accountFilter]);

  const handleEditConfirm = async (data: any) => {
    if (!selectedReseller) return;
    try {
      const updated = await api.updateReseller(selectedReseller.id, data);
      setResellers((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      setIsEditModalOpen(false);
      setSelectedReseller(null);
      setFeedback({
        isOpen: true,
        title: t("Reseller updated"),
        message: t("{{name}} was updated successfully.", {
          name: updated?.name || data?.name || t("The reseller"),
        }),
        variant: "success",
      });
    } catch (e: any) {
      console.error("Failed to update reseller", e);
      setFeedback({
        isOpen: true,
        title: t("Update failed"),
        message: e?.message || t("Failed to update reseller."),
        variant: "error",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedReseller) return;
    try {
      const deletedName = selectedReseller?.name || "The reseller";
      await api.deleteReseller(selectedReseller.id);
      setResellers((prev) => prev.filter((r) => r.id !== selectedReseller.id));
      setIsDeleteModalOpen(false);
      setSelectedReseller(null);
      setFeedback({
        isOpen: true,
        title: t("Reseller deleted"),
        message: t("{{name}} was deleted successfully.", {
          name: deletedName,
        }),
        variant: "success",
      });
    } catch (e: any) {
      console.error("Failed to delete reseller", e);
      setFeedback({
        isOpen: true,
        title: t("Delete failed"),
        message: e?.message || t("Failed to delete reseller."),
        variant: "error",
      });
    }
  };

  const displayed = resellers;

  const handleTransferClick = (reseller: any) => {
    setSelectedReseller(reseller);
    setIsTransferModalOpen(true);
  };

  const handleEditClick = (reseller: any) => {
    setSelectedReseller(reseller);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (reseller: any) => {
    setSelectedReseller(reseller);
    setIsDeleteModalOpen(true);
  };

  const getSubCount = (id: number) => {
    return resellers.filter((r) => Number(r.parentId) === Number(id)).length;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Filters and Search */}
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
            placeholder={
              user?.role === "superadmin"
                ? t("Search resellers...")
                : t("Search sub-resellers...")
            }
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="inline-flex items-center gap-x-2 rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors"
          >
            <Filter
              className="-ml-0.5 h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            {showFilters ? t("Hide Filters") : t("Filter")}
          </button>
          <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div
            className={`grid gap-3 ${user?.role === "superadmin" ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {t("Status")}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label={t("Filter resellers by status")}
                title={t("Filter resellers by status")}
                className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
              >
                <option value="All">{t("All Statuses")}</option>
                <option value="Active">{t("Active")}</option>
                <option value="Warning">{t("Warning")}</option>
                <option value="Suspended">{t("Suspended")}</option>
              </select>
            </div>

            {user?.role === "superadmin" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  {t("Account Type")}
                </label>
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  aria-label={t("Filter resellers by account type")}
                  title={t("Filter resellers by account type")}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
                >
                  <option value="All">{t("All Accounts")}</option>
                  <option value="Main Resellers">{t("Main Resellers")}</option>
                  <option value="Sub-Resellers">{t("Sub-Resellers")}</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resellers Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-visible">
        {viewMode === "table" ? (
          <div className="overflow-x-auto overflow-y-visible rounded-t-2xl">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-foreground/5">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-4 pr-3 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {user?.role === "superadmin"
                      ? t("Reseller")
                      : t("Sub-Reseller")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Credits")}
                  </th>
                  {user?.role === "superadmin" && (
                    <th
                      scope="col"
                      className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                    >
                      {t("Sub-Resellers")}
                    </th>
                  )}
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Status")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Join Date")}
                  </th>
                  <th scope="col" className="relative py-4 pl-3 pr-4 sm:pr-6">
                    <span className="sr-only">{t("Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {displayed.length > 0 ? (
                  displayed.map((reseller) => (
                    <tr
                      key={reseller.id}
                      className="hover:bg-foreground/5 transition-colors"
                    >
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                        <div className="flex items-center">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-foreground/10 flex items-center justify-center">
                            <span className="text-foreground font-semibold text-sm">
                              {(reseller.name || "").charAt(0)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="font-medium text-foreground">
                              {reseller.name}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {reseller.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <div className="font-medium text-foreground">
                          {Number(reseller.credits || 0).toLocaleString()}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {t("Available")}
                        </div>
                      </td>
                      {user?.role === "superadmin" && (
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            {getSubCount(reseller.id)}
                          </div>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        {(() => {
                          const st = (reseller.status || "")
                            .toString()
                            .toLowerCase();
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                                st === "active"
                                  ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                                  : st === "warning"
                                    ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                                    : "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                              }`}
                            >
                              {st === "active" && (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                              {st === "warning" && (
                                <ShieldAlert className="h-3.5 w-3.5" />
                              )}
                              {st === "suspended" && (
                                <Shield className="h-3.5 w-3.5" />
                              )}
                              {t(
                                (reseller.status || "")
                                  .toString()
                                  .charAt(0)
                                  .toUpperCase() +
                                  (reseller.status || "").toString().slice(1),
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                        {reseller.createdAt
                          ? new Date(reseller.createdAt).toLocaleDateString(
                              locale,
                            )
                          : "—"}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex items-center justify-end">
                          <ActionMenu
                            onTransfer={() => handleTransferClick(reseller)}
                            onEdit={() => handleEditClick(reseller)}
                            onDelete={() => handleDeleteClick(reseller)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={user?.role === "superadmin" ? 6 : 5}
                      className="py-12 text-center text-muted-foreground"
                    >
                      {t("No {{type}} found.", {
                        type:
                          user?.role === "superadmin"
                            ? t("resellers")
                            : t("sub-resellers"),
                      })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayed.length > 0 ? (
              displayed.map((reseller) => {
                const st = (reseller.status || "").toString().toLowerCase();
                return (
                  <div
                    key={reseller.id}
                    className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-foreground/10 flex items-center justify-center">
                          <span className="text-foreground font-semibold text-sm">
                            {(reseller.name || "").charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {reseller.name}
                          </div>
                          <div className="text-sm text-muted-foreground break-all">
                            {reseller.email || "—"}
                          </div>
                        </div>
                      </div>
                      <ActionMenu
                        onTransfer={() => handleTransferClick(reseller)}
                        onEdit={() => handleEditClick(reseller)}
                        onDelete={() => handleDeleteClick(reseller)}
                      />
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {t("Credits")}
                        </span>
                        <span className="font-medium text-foreground">
                          {Number(reseller.credits || 0).toLocaleString()}
                        </span>
                      </div>
                      {user?.role === "superadmin" && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t("Sub-Resellers")}
                          </span>
                          <span className="font-medium text-foreground">
                            {getSubCount(reseller.id)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {t("Status")}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                            st === "active"
                              ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                              : st === "warning"
                                ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                                : "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                          }`}
                        >
                          {st === "active" && (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          {st === "warning" && (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          {st === "suspended" && (
                            <Shield className="h-3.5 w-3.5" />
                          )}
                          {t(
                            (reseller.status || "")
                              .toString()
                              .charAt(0)
                              .toUpperCase() +
                              (reseller.status || "").toString().slice(1),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {t("Join Date")}
                        </span>
                        <span className="text-foreground">
                          {reseller.createdAt
                            ? new Date(reseller.createdAt).toLocaleDateString(
                                locale,
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-12 text-center text-muted-foreground">
                {t("No {{type}} found.", {
                  type:
                    user?.role === "superadmin"
                      ? t("resellers")
                      : t("sub-resellers"),
                })}
              </div>
            )}
          </div>
        )}
        <div className="border-t border-border bg-foreground/5 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t("Showing")}{" "}
              <span className="font-medium text-foreground">
                {displayed.length}
              </span>{" "}
              {t("of")}{" "}
              <span className="font-medium text-foreground">{total}</span>{" "}
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
        <TransferCreditsModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setSelectedReseller(null);
          }}
          initialRecipient={selectedReseller?.email || ""}
          onSuccess={({ recipient, amount, action }) => {
            setResellers((prev) =>
              prev.map((reseller) => {
                const matchesRecipient =
                  (reseller.email || "") === recipient ||
                  (reseller.code || "") === recipient;

                if (!matchesRecipient) return reseller;

                const currentCredits = Number(reseller.credits || 0);
                const nextCredits =
                  action === "revoke"
                    ? Math.max(0, currentCredits - Number(amount || 0))
                    : currentCredits + Number(amount || 0);

                return { ...reseller, credits: nextCredits };
              }),
            );
          }}
        />
        <EditResellerModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedReseller(null);
          }}
          onConfirm={handleEditConfirm}
          reseller={selectedReseller}
        />
        <DeleteResellerModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedReseller(null);
          }}
          onConfirm={handleDeleteConfirm}
          resellerName={selectedReseller?.name || ""}
        />
        <FeedbackModal
          isOpen={feedback.isOpen}
          onClose={() =>
            setFeedback((current) => ({ ...current, isOpen: false }))
          }
          title={feedback.title}
          message={feedback.message}
          variant={feedback.variant}
        />{" "}
      </div>
    </motion.div>
  );
}
