import { useEffect, useMemo, useState } from "react";
import { CreditCard, Landmark, Loader2, Wallet, X } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface Plan {
  id?: number;
  name: string;
  credits: number;
  price: number;
  currency?: string;
  features?: string;
}

interface PaymentSimulationModalProps {
  isOpen: boolean;
  plan: Plan | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    paymentMethod: string;
    paymentReference: string;
    payerName: string;
    payerEmail: string;
  }) => void | Promise<void>;
}

const paymentOptions = [
  { value: "CARD", label: "Bank Card", icon: CreditCard },
  { value: "PAYPAL", label: "PayPal", icon: Wallet },
  { value: "BANK_TRANSFER", label: "Bank Transfer", icon: Landmark },
];

export function PaymentSimulationModal({
  isOpen,
  plan,
  loading = false,
  onClose,
  onConfirm,
}: PaymentSimulationModalProps) {
  const { t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    if (!isOpen || !plan) return;
    setPaymentMethod("CARD");
    setPayerName("");
    setPayerEmail("");
    setPaymentReference(`DEV-${Date.now().toString().slice(-6)}`);
  }, [isOpen, plan]);

  const formattedPrice = useMemo(() => {
    const symbol = (plan?.currency || "USD") === "EUR" ? "€" : "$";
    return `${symbol}${Number(plan?.price || 0).toFixed(2)}`;
  }, [plan]);

  if (!isOpen || !plan) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("Development Payment Gateway")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Simulate a successful payment to auto-recharge credits during development.",
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("Close payment modal")}
            title={t("Close payment modal")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                {plan.name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {plan.credits} {t("credits")} • {formattedPrice}
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
              {t("Simulated payment")}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {t("Payment method")}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const selected = paymentMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      selected
                        ? "bg-foreground text-background"
                        : "bg-input text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(option.label)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {t("Payer name")}
              </label>
              <input
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder={t("John Doe")}
                className="block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {t("Payer email")}
              </label>
              <input
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder={t("john@example.com")}
                className="block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {t("Payment reference")}
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              onConfirm({
                paymentMethod,
                paymentReference,
                payerName,
                payerEmail,
              })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {loading ? t("Confirming…") : t("Simulate successful payment")}
          </button>
        </div>
      </div>
    </div>
  );
}
