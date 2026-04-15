import { X, AlertTriangle } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface DeleteResellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resellerName: string;
}

export function DeleteResellerModal({
  isOpen,
  onClose,
  onConfirm,
  resellerName,
}: DeleteResellerModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            {t("Delete {{name}}?", { name: resellerName })}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {t(
            "Are you sure you want to delete {{name}}? This action cannot be undone.",
            {
              name: resellerName,
            },
          )}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700"
          >
            {t("Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
