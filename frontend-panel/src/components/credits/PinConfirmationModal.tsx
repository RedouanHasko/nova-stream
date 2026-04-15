import { useState } from "react";
import { Lock, X } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface PinConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title: string;
  message: string;
}

export function PinConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
}: PinConfirmationModalProps) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-500" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={t("Enter 4-digit PIN")}
          maxLength={4}
          className="w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm mb-6"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={() => onConfirm(pin)}
            className="px-4 py-2 text-sm font-semibold text-background bg-foreground rounded-xl hover:bg-foreground/90"
          >
            {t("Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
