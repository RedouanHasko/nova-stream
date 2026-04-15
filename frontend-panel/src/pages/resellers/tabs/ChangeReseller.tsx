import { ArrowRightLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useI18n } from "../../../contexts/I18nContext";
import { FeedbackModal } from "../../../components/common/FeedbackModal";
import api from "../../../lib/api";

export function ChangeReseller() {
  const { t } = useI18n();
  const [allResellers, setAllResellers] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | "">("");
  const [selectedParent, setSelectedParent] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getResellers();
        if (!mounted) return;
        const list = Array.isArray(res) ? res : [];
        setAllResellers(list);
        setSubs(list.filter((r: any) => r.parentId));
        setParents(list.filter((r: any) => !r.parentId));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!selectedSub || !selectedParent) {
      setFeedback({
        isOpen: true,
        title: t("Missing selection"),
        message: t("Select both the sub-reseller and the new parent reseller."),
        variant: "info",
      });
      return;
    }
    setLoading(true);
    try {
      await api.updateReseller(Number(selectedSub), {
        parentId: Number(selectedParent),
      });
      window.dispatchEvent(new Event("resellers:refresh"));
      setFeedback({
        isOpen: true,
        title: t("Parent updated"),
        message: t("The reseller parent was updated successfully."),
        variant: "success",
      });
      setSelectedSub("");
      setSelectedParent("");
    } catch (e: any) {
      console.error(e);
      setFeedback({
        isOpen: true,
        title: t("Move failed"),
        message: e?.message || t("Failed to move reseller."),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden transition-colors duration-300">
          <div className="border-b border-border px-6 py-5 bg-input">
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-emerald-500" />
              {t("Change Reseller Parent")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Move a sub-reseller to a different parent reseller.")}
            </p>
          </div>
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="sub-reseller"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("Select Sub Reseller")}
                </label>
                <div className="mt-2">
                  <select
                    id="sub-reseller"
                    name="sub-reseller"
                    value={selectedSub}
                    onChange={(e) =>
                      setSelectedSub(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                    className="block w-full rounded-xl border-0 bg-input py-2.5 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                  >
                    <option value="">{t("Select a sub reseller...")}</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code || s.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="new-parent"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("New Parent Reseller")}
                </label>
                <div className="mt-2">
                  <select
                    id="new-parent"
                    name="new-parent"
                    value={selectedParent}
                    onChange={(e) =>
                      setSelectedParent(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                    className="block w-full rounded-xl border-0 bg-input py-2.5 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                  >
                    <option value="">{t("Select a new parent...")}</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code || p.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-input px-6 py-4 flex justify-end border-t border-border">
            <button
              disabled={loading}
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring gap-2 transition-all"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {loading ? t("Moving…") : t("Move Reseller")}
            </button>
          </div>
        </div>
      </form>

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
