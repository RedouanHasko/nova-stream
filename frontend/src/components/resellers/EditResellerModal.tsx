import { useState, useEffect } from "react";
import { X, User } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";
import { ConfirmModal } from "../common/ConfirmModal";

interface EditResellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  reseller: any;
}

export function EditResellerModal({
  isOpen,
  onClose,
  onConfirm,
  reseller,
}: EditResellerModalProps) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    status: "active",
  });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const canSave = formData.name.trim().length > 0;

  useEffect(() => {
    if (reseller) {
      setFormData({
        name: reseller.name || "",
        email: reseller.email || "",
        status: reseller.status || "active",
      });
    }
  }, [reseller]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-500" />
            {t("Edit reseller")}
            {reseller?.name ? `: ${reseller.name}` : ""}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-foreground">
              {t("Name")}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              {t("Email")}
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              {t("Status")}
            </label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
              className="w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
            >
              <option value="active">{t("Active")}</option>
              <option value="warning">{t("Warning")}</option>
              <option value="suspended">{t("Suspended")}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={() => canSave && setIsConfirmOpen(true)}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-semibold text-background bg-foreground rounded-xl hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("Save Changes")}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          onConfirm({
            ...formData,
            name: formData.name.trim(),
            email: formData.email.trim(),
          });
        }}
        title={t("Save reseller changes?")}
        message={t("Are you sure you want to update {{name}}?", {
          name: reseller?.name || t("this reseller"),
        })}
        confirmLabel={t("Save changes")}
      />
    </div>
  );
}
