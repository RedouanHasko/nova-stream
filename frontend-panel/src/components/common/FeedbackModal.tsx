import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: "success" | "error" | "info";
}

export function FeedbackModal({
  isOpen,
  onClose,
  title,
  message,
  variant = "info",
}: FeedbackModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(
      onClose,
      variant === "error" ? 5000 : 3500,
    );
    return () => window.clearTimeout(timeout);
  }, [isOpen, onClose, variant, title, message]);

  if (!isOpen) return null;

  const iconMap = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    error: <AlertTriangle className="h-5 w-5 text-rose-500" />,
    info: <Info className="h-5 w-5 text-sky-500" />,
  };

  const toneClassMap = {
    success:
      "border-emerald-200 bg-white dark:border-emerald-900/70 dark:bg-slate-950",
    error: "border-rose-200 bg-white dark:border-rose-900/70 dark:bg-slate-950",
    info: "border-sky-200 bg-white dark:border-sky-900/70 dark:bg-slate-950",
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-full max-w-sm px-4 sm:px-0">
      <div
        role="status"
        aria-live={variant === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto rounded-2xl border shadow-2xl ${toneClassMap[variant]}`}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 shrink-0">{iconMap[variant]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
              {message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            aria-label={t("Dismiss notification")}
            title={t("Dismiss notification")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
