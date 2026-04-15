import { LayoutGrid, Rows3 } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface DataViewToggleProps {
  viewMode: "table" | "cards";
  onChange: (mode: "table" | "cards") => void;
}

export function DataViewToggle({ viewMode, onChange }: DataViewToggleProps) {
  const { t } = useI18n();

  return (
    <div className="inline-flex items-center rounded-xl bg-foreground/5 p-1 shadow-sm ring-1 ring-inset ring-border">
      <button
        type="button"
        onClick={() => onChange("table")}
        aria-label={t("Show data as table")}
        title={t("Table view")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          viewMode === "table"
            ? "bg-foreground text-background"
            : "text-foreground hover:bg-foreground/10"
        }`}
      >
        <Rows3 className="h-4 w-4" />
        {t("Table")}
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        aria-label={t("Show data as cards")}
        title={t("Card view")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          viewMode === "cards"
            ? "bg-foreground text-background"
            : "text-foreground hover:bg-foreground/10"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
        {t("Cards")}
      </button>
    </div>
  );
}
