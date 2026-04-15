import { ClipboardList, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../../contexts/I18nContext";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import api from "../../../lib/api";

export function ParentChangeRequests() {
  const { t } = useI18n();
  const [requests, setRequests] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getParentChangeRequests();
        if (!mounted) return;
        if (Array.isArray(res)) {
          setRequests(
            res.map((r: any) => ({
              id: `REQ-${r.id}`,
              rawId: r.id,
              subReseller: r.reseller?.name || r.resellerId,
              currentParent: r.reseller?.parent?.name || r.currentParent || "-",
              requestedParent: r.newParent?.name || "-",
              status: r.status,
              date: r.createdAt,
            })),
          );
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refresh = async () => {
    try {
      const res = await api.getParentChangeRequests();
      if (Array.isArray(res)) {
        setRequests(
          res.map((r: any) => ({
            id: `REQ-${r.id}`,
            rawId: r.id,
            subReseller: r.reseller?.name || r.resellerId,
            currentParent: r.reseller?.parent?.name || r.currentParent || "-",
            requestedParent: r.newParent?.name || "-",
            status: r.status,
            date: r.createdAt,
          })),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const approve = async (reqItem: any) => {
    if (!reqItem?.rawId) return;
    try {
      await api.approveParentChangeRequest(reqItem.rawId);
      await refresh();
    } catch (e: any) {
      console.error(e);
      setFeedback({
        isOpen: true,
        title: t("Approval failed"),
        message: e?.message || t("Failed to approve request."),
        variant: "error",
      });
    }
  };

  const reject = async (reqItem: any) => {
    if (!reqItem?.rawId) return;
    try {
      await api.rejectParentChangeRequest(reqItem.rawId);
      await refresh();
    } catch (e: any) {
      console.error(e);
      setFeedback({
        isOpen: true,
        title: t("Rejection failed"),
        message: e?.message || t("Failed to reject request."),
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-500" />
              {t("Parent Change Requests")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Review and approve requests from sub-resellers to change their parent reseller.",
              )}
            </p>
          </div>
          <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-input">
                <tr>
                  <th
                    scope="col"
                    className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t("Sub Reseller")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Current Parent")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Requested Parent")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Date")}
                  </th>
                  <th
                    scope="col"
                    className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right text-sm font-semibold text-muted-foreground"
                  >
                    {t("Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-input transition-colors">
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">
                      {req.subReseller}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {req.currentParent}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-emerald-500">
                      {req.requestedParent}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {req.date}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approve(req)}
                          className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Check className="mr-1 h-3 w-3" /> {t("Approve")}
                        </button>
                        <button
                          onClick={() => reject(req)}
                          className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-500 ring-1 ring-inset ring-rose-500/20 hover:bg-rose-500/20 transition-colors"
                        >
                          <X className="mr-1 h-3 w-3" /> {t("Reject")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t("No pending requests.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {requests.length > 0 ? (
              requests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("Request")}
                      </div>
                      <div className="font-semibold text-foreground">
                        {req.id}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approve(req)}
                        className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <Check className="mr-1 h-3 w-3" /> {t("Approve")}
                      </button>
                      <button
                        onClick={() => reject(req)}
                        className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-500 ring-1 ring-inset ring-rose-500/20 hover:bg-rose-500/20 transition-colors"
                      >
                        <X className="mr-1 h-3 w-3" /> {t("Reject")}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        {t("Sub Reseller")}:
                      </span>{" "}
                      <span className="text-foreground">{req.subReseller}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Current Parent")}:
                      </span>{" "}
                      <span className="text-foreground">
                        {req.currentParent}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Requested Parent")}:
                      </span>{" "}
                      <span className="font-medium text-emerald-500">
                        {req.requestedParent}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("Date")}:
                      </span>{" "}
                      <span className="text-foreground">{req.date}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-8 text-center text-sm text-muted-foreground">
                {t("No pending requests.")}
              </div>
            )}
          </div>
        )}
      </div>

      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() =>
          setFeedback((current) => ({ ...current, isOpen: false }))
        }
        title={feedback.title}
        message={feedback.message}
        variant={feedback.variant}
      />
    </div>
  );
}
