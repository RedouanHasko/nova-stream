import { useState } from "react";
import { Coins, ArrowLeftRight } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import { PinConfirmationModal } from "../../../components/credits/PinConfirmationModal";
import api from "../../../lib/api";

export function CreditReturn() {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  const handleConfirm = async () => {
    if (!amount || Number(amount) <= 0) {
      setFeedback({
        isOpen: true,
        title: t("Invalid amount"),
        message: t("Enter a valid amount."),
        variant: "info",
      });
      return;
    }

    setLoading(true);
    try {
      await api.createCreditRequest({
        type: "CREDIT_RETURN",
        amount: Number(amount),
      });
      setFeedback({
        isOpen: true,
        title: t("Return request submitted"),
        message: t("Your credit return request was submitted successfully."),
        variant: "success",
      });
      setAmount("");
      setIsModalOpen(false);
      window.dispatchEvent(new Event("credits:refresh"));
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (error: any) {
      console.error(error);
      setFeedback({
        isOpen: true,
        title: t("Return request failed"),
        message: error?.message || t("Failed to submit return request."),
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
            <ArrowLeftRight className="h-5 w-5 text-rose-500" />
            {t("Send Credits Back")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Return unused credits to your parent reseller using the backend workflow.",
            )}
          </p>
        </div>
        <div className="px-6 py-6 space-y-6">
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
                placeholder={t("e.g. 100")}
              />
            </div>
          </div>
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors gap-2 disabled:opacity-60"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {loading ? t("Submitting...") : t("Return Credits")}
          </button>
        </div>
      </div>

      <PinConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirm}
        title={t("Confirm Return")}
        message={t(
          "Please enter your 4-digit PIN to confirm returning these credits.",
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
