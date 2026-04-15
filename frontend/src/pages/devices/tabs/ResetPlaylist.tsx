import { useState } from "react";
import { RotateCcw, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { ConfirmModal } from "../../../components/common/ConfirmModal";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

export function ResetPlaylist() {
  const { t } = useI18n();
  const [mac, setMac] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleReset = () => {
    setMessage(null);
    if (!mac) {
      setMessage(t("Enter a MAC address"));
      return;
    }
    setIsConfirmOpen(true);
  };

  const confirmReset = async () => {
    setIsConfirmOpen(false);
    setLoading(true);
    try {
      await api.resetPlaylists(mac);
      setMessage(t("Playlists reset successfully"));
      setMac("");
    } catch (e: any) {
      setMessage(e?.message || t("Reset failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-500" />
            {t("Reset Playlist")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Clear all playlists associated with a specific MAC address. This action cannot be undone.",
            )}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Warning Banner */}
          <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle
                  className="h-5 w-5 text-amber-500"
                  aria-hidden="true"
                />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-500">
                  {t("Attention")}
                </h3>
                <div className="mt-2 text-sm text-amber-500/80">
                  <p>
                    {t(
                      "Resetting the playlist will permanently delete all M3U links and Xtream Codes credentials associated with the provided MAC address. The user will need to re-enter their playlist information.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* MAC Address */}
          <div>
            <label
              htmlFor="mac"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("MAC Address to Reset")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ShieldCheck
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="mac"
                id="mac"
                value={mac}
                onChange={(e) => setMac(formatMAC(e.target.value))}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-rose-500 sm:text-sm sm:leading-6 font-mono uppercase"
                placeholder="XX:XX:XX:XX:XX:XX"
              />
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-foreground/5 px-6 py-4 flex items-center justify-between border-t border-border">
          <div className="text-sm">
            {message && (
              <span
                className={
                  message.includes("successfully")
                    ? "text-emerald-500"
                    : "text-rose-500"
                }
              >
                {message}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleReset}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 gap-2 transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {loading ? t("Resetting...") : t("Reset Playlists Now")}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmReset}
        title="Reset playlists?"
        message="This will delete all playlists for the selected MAC address. This action cannot be undone."
        confirmLabel="Reset now"
        variant="danger"
      />
    </div>
  );
}
