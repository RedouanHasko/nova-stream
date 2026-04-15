import { useState } from "react";
import { Coins, FileText, Send } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import api from "../../../lib/api";

export function CreditRequest() {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setFeedback({
        isOpen: true,
        title: t("Invalid amount"),
        message: t("Enter a valid credit amount."),
        variant: "info",
      });
      return;
    }

    setLoading(true);
    try {
      await api.createCreditRequest({
        type: "CREDIT_REQUEST",
        amount: Number(amount),
        notes,
      });
      setFeedback({
        isOpen: true,
        title: t("Request submitted"),
        message: t("Your credit request was submitted successfully."),
        variant: "success",
      });
      setAmount("");
      setNotes("");
      window.dispatchEvent(new Event("credits:refresh"));
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (error: any) {
      console.error(error);
      setFeedback({
        isOpen: true,
        title: t("Request failed"),
        message: error?.message || t("Failed to submit credit request."),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-500" />
            {t("Request Credits")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Submit a live request to your parent reseller using the backend.",
            )}
          </p>
        </div>
        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="amount"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Amount of Credits")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Coins
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  placeholder={t("e.g. 500")}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="notes"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Notes (Optional)")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute top-3 left-0 flex items-start pl-3">
                  <FileText
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  placeholder={t("Additional details...")}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 transition-colors gap-2 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {loading ? t("Submitting...") : t("Submit Request")}
          </button>
        </div>
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
