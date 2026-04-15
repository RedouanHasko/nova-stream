import { Tag, Plus, Edit2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { ConfirmModal } from "../../../components/common/ConfirmModal";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import PlanForm from "../../../components/settings/PlanForm";
import * as api from "../../../lib/api";

type PlanType = "DIRECT_ACTIVATION" | "CREDIT_RECHARGE";

interface Plan {
  id?: number;
  name: string;
  credits: number;
  price: number;
  status?: string;
  currency?: string;
  features?: string;
  active?: boolean;
  planType?: PlanType;
  duration?: "1_year" | "lifetime" | string;
}

const LOCAL_KEY = "local_pricing_plans";

const getPlanType = (plan: Plan): PlanType =>
  plan.planType ??
  (Number(plan.credits || 0) > 0 ? "CREDIT_RECHARGE" : "DIRECT_ACTIVATION");

const getDirectDurationLabel = (plan: Plan) =>
  (plan.duration || "").toString().toLowerCase() === "lifetime"
    ? "Lifetime"
    : "One Year";

export function PricingPlans() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState<Plan[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | undefined>(undefined);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const remote = await api.getPricingPlans();
        if (Array.isArray(remote)) {
          setPlans(remote);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(remote));
        }
      } catch (e) {
        // ignore, keep local plans
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(plans));
    } catch (e) {}
  }, [plans]);

  async function handleSave(plan: Plan) {
    if (plan.id) {
      try {
        const updated = await api.updatePricingPlan(plan.id, plan);
        setPlans((s) => s.map((p) => (p.id === updated.id ? updated : p)));
        setFeedback({
          isOpen: true,
          title: t("Plan updated"),
          message:
            getPlanType(updated) === "DIRECT_ACTIVATION"
              ? t("{{name}} was updated for direct client activations.", {
                  name: updated.name,
                })
              : t("{{name}} was updated for reseller credit purchases.", {
                  name: updated.name,
                }),
          variant: "success",
        });
      } catch (e: any) {
        setPlans((s) =>
          s.map((p) => (p.id === plan.id ? { ...(p as any), ...plan } : p)),
        );
        setFeedback({
          isOpen: true,
          title: t("Update issue"),
          message:
            e?.message ||
            t(
              "The server update failed, so the plan was only updated locally.",
            ),
          variant: "error",
        });
      }
    } else {
      try {
        const created = await api.createPricingPlan(plan);
        setPlans((s) => [created, ...s]);
        setFeedback({
          isOpen: true,
          title: t("Plan created"),
          message:
            getPlanType(created) === "DIRECT_ACTIVATION"
              ? t(
                  "{{name}} is now available on the direct activation website.",
                  {
                    name: created.name,
                  },
                )
              : t("{{name}} is now available for reseller credit purchases.", {
                  name: created.name,
                }),
          variant: "success",
        });
      } catch (e: any) {
        const tmp = { ...plan, id: Date.now() };
        setPlans((s) => [tmp, ...s]);
        setFeedback({
          isOpen: true,
          title: t("Create issue"),
          message:
            e?.message ||
            t("The server create failed, so the plan was only saved locally."),
          variant: "error",
        });
      }
    }
    setIsFormOpen(false);
    setEditing(undefined);
  }

  async function confirmDelete() {
    if (!planToDelete?.id) return;
    try {
      await api.deletePricingPlan(planToDelete.id);
      setPlans((s) => s.filter((p) => p.id !== planToDelete.id));
      setFeedback({
        isOpen: true,
        title: t("Plan deleted"),
        message: t("{{name}} was deleted successfully.", {
          name: planToDelete.name,
        }),
        variant: "success",
      });
    } catch (e: any) {
      setPlans((s) => s.filter((p) => p.id !== planToDelete.id));
      setFeedback({
        isOpen: true,
        title: t("Delete issue"),
        message:
          e?.message ||
          t("The server delete failed, so the plan was only removed locally."),
        variant: "error",
      });
    } finally {
      setPlanToDelete(null);
    }
  }

  const directPlans = (plans || []).filter(
    (plan) => getPlanType(plan) === "DIRECT_ACTIVATION",
  );
  const creditPlans = (plans || []).filter(
    (plan) => getPlanType(plan) === "CREDIT_RECHARGE",
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("Pricing Plans")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Keep direct client activation plans separate from reseller credit recharge plans.",
            )}
          </p>
        </div>
        {user?.role === "superadmin" && (
          <button
            onClick={() => {
              setEditing(undefined);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-x-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-5 w-5" />
            {t("Add Plan")}
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("Loading pricing plans...")}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("Direct Activation Plans")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "These appear on the external website for normal clients and should be used only for One Year or Lifetime activations.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {directPlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              {t(
                "No direct activation plans yet. Add One Year and Lifetime plans here for the public website.",
              )}
            </div>
          ) : (
            directPlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-card border border-border rounded-2xl p-6 space-y-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Tag className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                      {getDirectDurationLabel(plan)}
                    </span>
                    {user?.role === "superadmin" && (
                      <>
                        <button
                          onClick={() => {
                            setEditing(plan);
                            setIsFormOpen(true);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPlanToDelete(plan)}
                          className="p-1.5 text-muted-foreground hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Visible on the normal-client activation website.")}
                  </p>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-2xl font-bold text-foreground">
                    {plan.currency === "EUR" ? "€" : "$"}
                    {(plan.price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("One-time activation payment")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("Reseller Credit Plans")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "These are only for reseller coin/credit purchases inside the panel.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {creditPlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              {t("No reseller credit plans yet.")}
            </div>
          ) : (
            creditPlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-card border border-border rounded-2xl p-6 space-y-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center">
                    <Tag className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600">
                      {plan.credits} {t("Credits")}
                    </span>
                    {user?.role === "superadmin" && (
                      <>
                        <button
                          onClick={() => {
                            setEditing(plan);
                            setIsFormOpen(true);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPlanToDelete(plan)}
                          className="p-1.5 text-muted-foreground hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Used only for reseller wallet/coin recharge.")}
                  </p>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-2xl font-bold text-foreground">
                    {plan.currency === "EUR" ? "€" : "$"}
                    {(plan.price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("One-time payment")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <PlanForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(undefined);
        }}
        onSave={handleSave}
        initial={editing}
      />

      <ConfirmModal
        isOpen={!!planToDelete}
        onClose={() => setPlanToDelete(null)}
        onConfirm={confirmDelete}
        title={t("Delete pricing plan?")}
        message={t(
          "Are you sure you want to delete {{name}}? This action cannot be undone.",
          {
            name: planToDelete?.name || t("this plan"),
          },
        )}
        confirmLabel={t("Delete plan")}
        variant="danger"
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
