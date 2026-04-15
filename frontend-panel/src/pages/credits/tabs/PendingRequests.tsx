import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { ListOrdered, Check, X } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import { PinConfirmationModal } from "../../../components/credits/PinConfirmationModal";
import api from "../../../lib/api";

export function PendingRequests() {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const targetRequestId = Number(searchParams.get("requestId") || 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  const loadRequests = async () => {
    try {
      const res = await api.getCreditRequests();
      const items = (Array.isArray(res) ? res : []).filter(
        (req: any) => (req.status || "").toUpperCase() === "PENDING",
      );
      setPendingRequests(items);
    } catch (error) {
      console.error("Failed to load pending requests", error);
      setPendingRequests([]);
    }
  };

  useEffect(() => {
    loadRequests();
    window.addEventListener("credits:refresh", loadRequests);
    return () => {
      window.removeEventListener("credits:refresh", loadRequests);
    };
  }, []);

  const displayedRequests = useMemo(() => {
    if (!targetRequestId) return pendingRequests;

    return [...pendingRequests].sort((left, right) => {
      const leftMatch = Number(left.id) === targetRequestId ? 1 : 0;
      const rightMatch = Number(right.id) === targetRequestId ? 1 : 0;
      return rightMatch - leftMatch;
    });
  }, [pendingRequests, targetRequestId]);

  useEffect(() => {
    if (!targetRequestId || displayedRequests.length === 0) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(
        `credit-request-${targetRequestId}`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [targetRequestId, displayedRequests, viewMode]);

  const handleConfirm = async () => {
    if (!selectedRequest?.id) return;
    try {
      await api.approveCreditRequest(selectedRequest.id);
      setIsModalOpen(false);
      setSelectedRequest(null);
      window.dispatchEvent(new Event("credits:refresh"));
      window.dispatchEvent(new Event("notifications:refresh"));
      await loadRequests();
    } catch (error: any) {
      console.error(error);
      setFeedback({
        isOpen: true,
        title: t("Approval failed"),
        message: error?.message || t("Failed to approve request."),
        variant: "error",
      });
    }
  };

  const handleDecline = async (request: any) => {
    try {
      await api.rejectCreditRequest(request.id);
      window.dispatchEvent(new Event("credits:refresh"));
      window.dispatchEvent(new Event("notifications:refresh"));
      await loadRequests();
    } catch (error: any) {
      console.error(error);
      setFeedback({
        isOpen: true,
        title: t("Rejection failed"),
        message: error?.message || t("Failed to reject request."),
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
              <ListOrdered className="h-5 w-5 text-emerald-500" />
              {t("Pending Credit Requests")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Review real pending requests from the backend and check payment notes before approving or rejecting them.",
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
                    className="py-4 pl-4 pr-3 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t("Request ID")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Requester")}
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
                    {t("Reseller Note / Payment Ref")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {displayedRequests.map((req) => {
                  const requesterName =
                    req.type === "CREDIT_RETURN"
                      ? req.fromReseller?.name || `#${req.fromResellerId}`
                      : req.toReseller?.name || `#${req.toResellerId}`;
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
                        {requesterName}
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
                      <td
                        className="max-w-xs px-3 py-4 text-sm text-muted-foreground whitespace-normal"
                        title={
                          req.notes ||
                          t("No payment reference or notes provided.")
                        }
                      >
                        {req.notes || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setIsModalOpen(true);
                            }}
                            title={t("Approve request")}
                            aria-label={t("Approve request")}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDecline(req)}
                            title={t("Reject request")}
                            aria-label={t("Reject request")}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayedRequests.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t("No pending requests right now.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayedRequests.length > 0 ? (
              displayedRequests.map((req) => {
                const requesterName =
                  req.type === "CREDIT_RETURN"
                    ? req.fromReseller?.name || `#${req.fromResellerId}`
                    : req.toReseller?.name || `#${req.toResellerId}`;
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsModalOpen(true);
                          }}
                          title={t("Approve request")}
                          aria-label={t("Approve request")}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDecline(req)}
                          title={t("Reject request")}
                          aria-label={t("Reject request")}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          {t("Requester")}:
                        </span>{" "}
                        <span className="text-foreground">{requesterName}</span>
                      </div>
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
                          {t("Reseller Note / Payment Ref")}
                        </div>
                        <div className="text-foreground">
                          {req.notes || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-8 text-center text-sm text-muted-foreground">
                {t("No pending requests right now.")}
              </div>
            )}
          </div>
        )}
      </div>

      <PinConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirm}
        title={t("Confirm Credit Transfer")}
        message={t(
          "Please enter your 4-digit PIN to confirm processing {{amount}} credits.",
          {
            amount: selectedRequest?.amount || 0,
          },
        )}
      />

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
