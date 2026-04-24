import React, { useState } from "react";
import { X, User, Coins, FileText } from "lucide-react";
import { FeedbackModal } from "../../components/common/FeedbackModal";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import api from "../../lib/api";

interface TransferCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipient?: string;
  onSuccess?: (payload: {
    recipient: string;
    amount: number;
    action: "add" | "revoke";
    notes: string;
    response: any;
  }) => void;
}

export function TransferCreditsModal({
  isOpen,
  onClose,
  initialRecipient = "",
  onSuccess,
}: TransferCreditsModalProps) {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const normalizedRole = (user?.role || "").toString().toLowerCase();
  const canInitiateTransfer =
    normalizedRole === "superadmin" || normalizedRole === "reseller";
  const availableCredits = Number(user?.reseller?.credits || 0);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [recipientOptions, setRecipientOptions] = useState<any[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"add" | "revoke">("add");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    variant: "info",
  });

  // Update recipient if initialRecipient changes
  React.useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  React.useEffect(() => {
    if (!isOpen || user?.role === "subreseller") return;

    let mounted = true;
    const loadRecipients = async () => {
      setLoadingRecipients(true);
      try {
        const res = await api.getResellers();
        if (!mounted) return;
        const list = Array.isArray(res) ? res : [];
        setRecipientOptions(list);
      } catch (error) {
        console.error("Failed to load transfer recipients", error);
        if (mounted) setRecipientOptions([]);
      } finally {
        if (mounted) setLoadingRecipients(false);
      }
    };

    loadRecipients();
    return () => {
      mounted = false;
    };
  }, [isOpen, user?.role]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInitiateTransfer) {
      setFeedback({
        isOpen: true,
        title: t("Permission denied"),
        message: t(
          "Your account is not allowed to initiate direct credit transfers.",
        ),
        variant: "error",
      });
      return;
    }

    if (!recipient || !amount) {
      setFeedback({
        isOpen: true,
        title: t("Missing information"),
        message: t("Recipient and amount are required before continuing."),
        variant: "info",
      });
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      setFeedback({
        isOpen: true,
        title: t("Invalid amount"),
        message: t("Credits must be a positive whole number."),
        variant: "info",
      });
      return;
    }

    if (normalizedRole === "reseller" && action === "add") {
      if (numericAmount > availableCredits) {
        setFeedback({
          isOpen: true,
          title: t("Insufficient credits"),
          message: t(
            "You cannot transfer more credits than your current available balance.",
          ),
          variant: "error",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const body = { recipient, amount: numericAmount, action, notes };
      const res = await api.transferCredits(body);
      console.log("Transfer result", res);

      if (user?.role !== "superadmin" && user?.reseller) {
        const nextCredits = Number(res?.fromAfterBalance);
        if (!Number.isNaN(nextCredits)) {
          updateUser({
            reseller: {
              ...user.reseller,
              credits: nextCredits,
            },
          });
        }
      }

      onSuccess?.({ ...body, response: res });
      window.dispatchEvent(new Event("credits:refresh"));
      window.dispatchEvent(new Event("resellers:refresh"));
      window.dispatchEvent(new Event("notifications:refresh"));
      setRecipient("");
      setAmount("");
      setAction("add");
      setNotes("");
      setFeedback({
        isOpen: true,
        title: t("Credits updated"),
        message: t("The credit operation completed successfully."),
        variant: "success",
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setFeedback({
        isOpen: true,
        title: t("Transfer failed"),
        message: err?.message || t("Transfer failed"),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl transition-colors duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {user?.role === "superadmin"
              ? t("System Credit Management")
              : t("Transfer Credits")}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("Close transfer modal")}
            title={t("Close transfer modal")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!canInitiateTransfer && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {t(
                "Only super admins and resellers can initiate direct credit transfers.",
              )}
            </div>
          )}

          {normalizedRole === "reseller" && action === "add" && (
            <div className="rounded-xl border border-border bg-foreground/5 px-4 py-3 text-sm text-muted-foreground">
              {t("Available balance")}: {availableCredits.toLocaleString()}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              {t("Action Type")}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="add"
                  checked={action === "add"}
                  onChange={() => setAction("add")}
                  disabled={!canInitiateTransfer}
                  className="text-foreground focus:ring-ring h-4 w-4 bg-input border-border"
                />
                <span className="text-sm text-foreground font-medium">
                  {t("Add Credits")}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="revoke"
                  checked={action === "revoke"}
                  onChange={() => setAction("revoke")}
                  disabled={!canInitiateTransfer}
                  className="text-rose-500 focus:ring-rose-500/20 h-4 w-4 bg-input border-border"
                />
                <span className="text-sm text-foreground font-medium">
                  {t("Revoke Credits")}
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("Recipient Account")}
            </label>
            <div className="relative mt-1 rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <select
                id="recipient-account"
                name="recipient-account"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={
                  !canInitiateTransfer ||
                  loadingRecipients ||
                  recipientOptions.length === 0
                }
                aria-label="Select recipient account"
                title="Select recipient account"
                className="block w-full appearance-none rounded-xl border-0 bg-input py-2.5 pl-10 pr-3 text-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {loadingRecipients
                    ? t("Loading existing accounts...")
                    : recipientOptions.length > 0
                      ? t("Select an existing reseller or sub-reseller")
                      : t("No reseller accounts available")}
                </option>
                {recipientOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.email || option.code || ""}
                  >
                    {option.name} {option.code ? `(${option.code})` : ""}
                    {option.parentId
                      ? ` — ${t("Sub-Reseller")}`
                      : ` — ${t("Reseller")}`}
                    {option.email ? ` • ${option.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Pick one of the existing accounts instead of typing a manual username or email.",
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("Amount")}
            </label>
            <div className="relative mt-1 rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Coins className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="number"
                required
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!canInitiateTransfer}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                placeholder={t("e.g., 100")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("Notes (Optional)")}
            </label>
            <div className="relative mt-1 rounded-xl shadow-sm">
              <div className="pointer-events-none absolute top-3 left-0 flex items-start pl-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canInitiateTransfer}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                placeholder={t("Reason for transfer...")}
                rows={3}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-input transition-colors"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !canInitiateTransfer ||
                (normalizedRole === "reseller" &&
                  action === "add" &&
                  Number(amount || 0) > availableCredits)
              }
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                action === "add"
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-rose-500 text-white hover:bg-rose-400"
              } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {loading
                ? t("Processing...")
                : action === "add"
                  ? user?.role === "superadmin"
                    ? t("Add Credits to Account")
                    : t("Transfer Credits")
                  : t("Revoke Credits")}
            </button>
          </div>
        </form>
      </div>

      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() => {
          setFeedback((current) => ({ ...current, isOpen: false }));
        }}
        title={feedback.title}
        message={feedback.message}
        variant={feedback.variant}
      />
    </div>
  );
}
