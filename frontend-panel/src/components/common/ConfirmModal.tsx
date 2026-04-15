import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
}: ConfirmModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle
              className={`h-5 w-5 ${variant === "danger" ? "text-rose-500" : "text-amber-500"}`}
            />
            {t(title)}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("Close confirmation modal")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">{t(message)}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t(cancelLabel)}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              variant === "danger"
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-foreground text-background hover:bg-foreground/90"
            }`}
          >
            {t(confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}
