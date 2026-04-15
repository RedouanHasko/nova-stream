import { useState, useEffect, type ChangeEvent } from "react";
import { useI18n } from "../../contexts/I18nContext";
import { ConfirmModal } from "../common/ConfirmModal";
import { FeedbackModal } from "../common/FeedbackModal";

type PlanType = "DIRECT_ACTIVATION" | "CREDIT_RECHARGE";

interface Plan {
  id?: number;
  name: string;
  credits: number;
  price: number;
  currency?: string;
  features?: string;
  active?: boolean;
  planType?: PlanType;
  duration?: "1_year" | "lifetime" | string;
}

type PlanFormState = Omit<Plan, "credits" | "price"> & {
  credits: string;
  price: string;
};

const DEFAULT_PLAN_TYPE: PlanType = "CREDIT_RECHARGE";

export function PlanForm({
  isOpen,
  onClose,
  onSave,
  initial,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (p: Plan) => void | Promise<void>;
  initial?: Partial<Plan>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<PlanFormState>({
    name: "",
    credits: "",
    price: "",
    currency: "EUR",
    features: "",
    active: true,
    planType: DEFAULT_PLAN_TYPE,
    duration: "1_year",
  });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
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
    if (initial) {
      const inferredPlanType =
        initial.planType ??
        ((initial.credits || 0) > 0 ? "CREDIT_RECHARGE" : "DIRECT_ACTIVATION");

      setForm({
        id: initial.id,
        name: initial.name ?? "",
        credits:
          initial.credits === undefined || initial.credits === null
            ? ""
            : String(initial.credits),
        price:
          initial.price === undefined || initial.price === null
            ? ""
            : String(initial.price),
        currency: initial.currency ?? "EUR",
        features: initial.features ?? "",
        active: initial.active ?? true,
        planType: inferredPlanType,
        duration: initial.duration ?? "1_year",
      });
    } else {
      setForm({
        name: "",
        credits: "",
        price: "",
        currency: "EUR",
        features: "",
        active: true,
        planType: DEFAULT_PLAN_TYPE,
        duration: "1_year",
      });
    }
  }, [initial, isOpen]);

  const handleRequestSave = () => {
    const trimmedName = form.name.trim();
    const normalizedPlanType = form.planType || DEFAULT_PLAN_TYPE;
    const creditsValue =
      normalizedPlanType === "CREDIT_RECHARGE" ? Number(form.credits) : 0;
    const priceValue = form.price === "" ? 0 : Number(form.price);

    if (!trimmedName) {
      setFeedback({
        isOpen: true,
        title: t("Missing plan name"),
        message: t("Please enter a plan name before saving."),
        variant: "info",
      });
      return;
    }
    if (
      normalizedPlanType === "CREDIT_RECHARGE" &&
      (form.credits === "" || Number.isNaN(creditsValue) || creditsValue <= 0)
    ) {
      setFeedback({
        isOpen: true,
        title: t("Invalid credits"),
        message: t(
          "Reseller credit plans must include credits greater than zero.",
        ),
        variant: "error",
      });
      return;
    }
    if (form.price !== "" && (Number.isNaN(priceValue) || priceValue < 0)) {
      setFeedback({
        isOpen: true,
        title: t("Invalid price"),
        message: t("Price cannot be negative."),
        variant: "error",
      });
      return;
    }
    if (
      normalizedPlanType === "DIRECT_ACTIVATION" &&
      !["1_year", "lifetime"].includes((form.duration || "").toString())
    ) {
      setFeedback({
        isOpen: true,
        title: t("Missing activation duration"),
        message: t(
          "Direct activation plans must be either One Year or Lifetime.",
        ),
        variant: "error",
      });
      return;
    }

    setForm((current: PlanFormState) => ({ ...current, name: trimmedName }));
    setIsConfirmOpen(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-xl rounded-2xl bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold">
          {initial?.id ? t("Edit Pricing Plan") : t("Add Pricing Plan")}
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm text-muted-foreground">
            {t("Plan Name")}
          </label>
          <input
            className="rounded-md bg-input p-2"
            value={form.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder={t("Example: Lifetime Activation")}
          />

          <label className="text-sm text-muted-foreground">
            {t("Plan Type")}
          </label>
          <select
            className="rounded-md bg-input p-2"
            value={form.planType || DEFAULT_PLAN_TYPE}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const nextPlanType = e.target.value as PlanType;
              setForm({
                ...form,
                planType: nextPlanType,
                credits:
                  nextPlanType === "DIRECT_ACTIVATION" ? "0" : form.credits,
                duration:
                  nextPlanType === "DIRECT_ACTIVATION"
                    ? form.duration || "1_year"
                    : undefined,
              });
            }}
          >
            <option value="CREDIT_RECHARGE">{t("Reseller Credit Plan")}</option>
            <option value="DIRECT_ACTIVATION">
              {t("Direct Client Activation")}
            </option>
          </select>
          <p className="text-xs text-muted-foreground">
            {t(
              "Direct plans appear on the external client website. Credit plans stay inside the reseller panel for buying coins/credits.",
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {form.planType === "DIRECT_ACTIVATION" ? (
              <div>
                <label className="text-sm text-muted-foreground">
                  {t("Activation Length")}
                </label>
                <select
                  className="w-full rounded-md bg-input p-2"
                  value={form.duration || "1_year"}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setForm({
                      ...form,
                      duration: e.target.value as "1_year" | "lifetime",
                    })
                  }
                >
                  <option value="1_year">{t("One Year")}</option>
                  <option value="lifetime">{t("Lifetime")}</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="text-sm text-muted-foreground">
                  {t("Credits")}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-md bg-input p-2"
                  value={form.credits}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, credits: e.target.value })
                  }
                  placeholder={t("Enter credits")}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">
                {t("Price")}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="w-full rounded-md bg-input p-2"
                value={form.price}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, price: e.target.value })
                }
                placeholder={t("Enter price")}
              />
            </div>
          </div>

          <label className="text-sm text-muted-foreground">
            {t("Currency")}
          </label>
          <input
            className="rounded-md bg-input p-2"
            value={form.currency}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, currency: e.target.value })
            }
          />

          <label className="text-sm text-muted-foreground">
            {t("Features (optional)")}
          </label>
          <textarea
            className="rounded-md bg-input p-2"
            value={form.features}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setForm({ ...form, features: e.target.value })
            }
          />

          <div className="mt-2 flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, active: e.target.checked })
              }
            />
            <span className="text-sm text-muted-foreground">{t("Active")}</span>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-xl bg-muted-foreground px-4 py-2 text-foreground"
              onClick={onClose}
              type="button"
            >
              {t("Cancel")}
            </button>
            <button
              className="rounded-xl bg-foreground px-4 py-2 text-background"
              onClick={handleRequestSave}
              type="button"
            >
              {t("Save")}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          onSave({
            ...form,
            name: form.name.trim(),
            planType: form.planType || DEFAULT_PLAN_TYPE,
            duration:
              (form.planType || DEFAULT_PLAN_TYPE) === "DIRECT_ACTIVATION"
                ? form.duration || "1_year"
                : undefined,
            credits:
              (form.planType || DEFAULT_PLAN_TYPE) === "CREDIT_RECHARGE"
                ? Number(form.credits)
                : 0,
            price: form.price === "" ? 0 : Number(form.price),
          });
        }}
        title={
          initial?.id ? t("Update pricing plan?") : t("Create pricing plan?")
        }
        message={
          initial?.id
            ? t("Are you sure you want to save these pricing plan changes?")
            : t("Are you sure you want to create this pricing plan?")
        }
        confirmLabel={initial?.id ? t("Save changes") : t("Create plan")}
      />

      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() =>
          setFeedback((current: typeof feedback) => ({
            ...current,
            isOpen: false,
          }))
        }
        title={feedback.title}
        message={feedback.message}
        variant={feedback.variant}
      />
    </div>
  );
}

export default PlanForm;
