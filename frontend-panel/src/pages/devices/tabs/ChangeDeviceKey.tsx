import { useState } from "react";
import { KeyRound, ShieldCheck, Loader2 } from "lucide-react";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

export function ChangeDeviceKey() {
  const { t } = useI18n();
  const [mac, setMac] = useState("");
  const [newKey, setNewKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);
    if (!mac) return setMessage({ type: "error", text: t("MAC address is required") });
    if (!newKey) return setMessage({ type: "error", text: t("New device key is required") });
    if (newKey.length < 4 || newKey.length > 20)
      return setMessage({ type: "error", text: t("Device key must be between 4 and 20 characters") });
    if (newKey !== confirmKey)
      return setMessage({ type: "error", text: t("Keys do not match") });

    setLoading(true);
    try {
      await api.adminChangeDeviceKey(mac, newKey);
      setMessage({ type: "success", text: t("Device key updated successfully") });
      setMac("");
      setNewKey("");
      setConfirmKey("");
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || t("Update failed") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-500" />
            {t("Change Device Key")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Override the security key for a specific device. No current key required.")}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* MAC Address */}
          <div>
            <label
              htmlFor="mac"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("MAC Address")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <input
                type="text"
                id="mac"
                value={mac}
                onChange={(e) => setMac(formatMAC(e.target.value))}
                disabled={loading}
                placeholder="XX:XX:XX:XX:XX:XX"
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 font-mono uppercase disabled:opacity-60"
              />
            </div>
          </div>

          {/* New Key */}
          <div>
            <label
              htmlFor="new-key"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("New Device Key")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <input
                type="text"
                id="new-key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.trim())}
                disabled={loading}
                placeholder={t("Enter new key (4–20 chars)")}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          {/* Confirm Key */}
          <div>
            <label
              htmlFor="confirm-key"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("Confirm New Key")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <input
                type="text"
                id="confirm-key"
                value={confirmKey}
                onChange={(e) => setConfirmKey(e.target.value.trim())}
                disabled={loading}
                placeholder={t("Re-enter new key")}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          {/* Feedback */}
          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                message.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex justify-center items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("Updating...")}
              </>
            ) : (
              t("Update Device Key")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
