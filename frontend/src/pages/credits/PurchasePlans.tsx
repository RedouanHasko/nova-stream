import { useEffect, useState } from "react";
import { PaymentSimulationModal } from "../../components/credits/PaymentSimulationModal";
import { FeedbackModal } from "../../components/common/FeedbackModal";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import * as api from "../../lib/api";

interface Plan {
  id?: number;
  name: string;
  credits: number;
  price: number;
  currency?: string;
  features?: string;
  planType?: "DIRECT_ACTIVATION" | "CREDIT_RECHARGE";
  duration?: "1_year" | "lifetime" | string;
}

interface PurchasePlansProps {
  embedded?: boolean;
}

export function PurchasePlans({ embedded = false }: PurchasePlansProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const remote = await api.getPricingPlans("credit");
        if (Array.isArray(remote)) {
          setPlans(
            remote.filter(
              (plan) =>
                (plan?.planType || "CREDIT_RECHARGE") !== "DIRECT_ACTIVATION" &&
                Number(plan?.credits || 0) > 0,
            ),
          );
        }
      } catch (e) {
        console.error("Failed to load pricing plans", e);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handlePurchase(payment: {
    paymentMethod: string;
    paymentReference: string;
    payerName: string;
    payerEmail: string;
  }) {
    if (!selectedPlan?.id) return;

    setCheckoutLoading(true);
    try {
      const res = await api.purchasePlan(selectedPlan.id, payment);
      if (res?.success) {
        window.dispatchEvent(new Event("credits:refresh"));
        window.dispatchEvent(new Event("notifications:refresh"));
        setSelectedPlan(null);
        setFeedback({
          isOpen: true,
          title: t("Recharge completed"),
          message: t(
            "{{count}} credits were added automatically after simulated payment confirmation. New balance: {{balance}}.",
            {
              count: res.creditsAdded || selectedPlan.credits,
              balance: Number(res.balance || 0).toLocaleString(),
            },
          ),
          variant: "success",
        });
      } else {
        setFeedback({
          isOpen: true,
          title: t("Purchase not completed"),
          message: t(
            "The payment was not confirmed, so no credits were added.",
          ),
          variant: "info",
        });
      }
    } catch (e: any) {
      setFeedback({
        isOpen: true,
        title: t("Purchase failed"),
        message: e?.message || t("Failed to complete purchase."),
        variant: "error",
      });
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (user?.role !== "reseller") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        {t(
          "Only resellers can purchase recharge plans directly. Sub-resellers should request credits from their reseller.",
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className={`${embedded ? "text-lg" : "text-2xl"} font-bold text-foreground`}
        >
          {embedded ? t("Available Credit Plans") : t("Credit Recharge Plans")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Pick a plan and, once payment is confirmed, the credits are added to your balance automatically.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {!loading && plans.length === 0 && (
          <div className="rounded-2xl bg-card border border-border p-6 text-sm text-muted-foreground md:col-span-3">
            {t("No reseller credit plans were found in the backend.")}
          </div>
        )}
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl bg-card border border-border p-6 space-y-4 shadow-sm"
          >
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="bg-rose-600 text-white px-3 py-1 rounded-md text-sm">
                {plan.credits} {t("Points")}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {plan.features || t("Purchase credits to unlock features.")}
            </p>
            <div className="pt-4 border-t border-border">
              <p className="text-2xl font-bold text-foreground">
                {plan.currency === "EUR" ? "€" : "$"}
                {plan.price}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Automatic recharge after payment confirmation")}
              </p>
            </div>
            <div>
              <button
                onClick={() => setSelectedPlan(plan)}
                className="w-full rounded-xl bg-rose-600 text-white py-2 mt-4"
              >
                {t("Pay & Recharge")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <PaymentSimulationModal
        isOpen={!!selectedPlan}
        plan={selectedPlan}
        loading={checkoutLoading}
        onClose={() => {
          if (!checkoutLoading) setSelectedPlan(null);
        }}
        onConfirm={handlePurchase}
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

export default PurchasePlans;
