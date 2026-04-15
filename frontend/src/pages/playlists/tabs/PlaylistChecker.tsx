import { CheckCircle, Link2, HelpCircle, Info } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";

export function PlaylistChecker() {
  const { t } = useI18n();

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Checker Form */}
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            {t("Free IPTV Status Checker")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Check your IPTV account status, expiration date, and connection limits in seconds. Secure, fast, and completely free IPTV verification tool.",
            )}
          </p>
        </div>
        <div className="px-6 py-6 space-y-6">
          <div>
            <label
              htmlFor="check-url"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("IPTV URL")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Link2
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="url"
                name="check-url"
                id="check-url"
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                placeholder="http://yourdns/get.php?username=username&password=password&type=m3u_plus&output=mpegts"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Enter your IPTV URL with username and password parameters")}
            </p>
          </div>
        </div>
        <div className="bg-input px-6 py-4 flex justify-end border-t border-border">
          <button className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-all gap-2">
            <CheckCircle className="h-4 w-4" />
            {t("Check Status")}
          </button>
        </div>
      </div>

      {/* About Section */}
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-input flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-500" />
          <h3 className="text-base font-semibold text-foreground">
            {t("About")}
          </h3>
        </div>
        <div className="px-6 py-4 text-sm text-muted-foreground">
          {t(
            "We've designed this tool to be simple, fast, and secure. Your IPTV URL is never stored or shared with third parties. This checker helps you verify your IPTV subscription status, expiration dates, and account details in real-time without compromising your privacy or security.",
          )}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-input flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-emerald-500" />
          <h3 className="text-base font-semibold text-foreground">
            {t("Frequently Asked Questions")}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-6 text-sm text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">
              {t("Is my IPTV URL safe?")}
            </p>
            <p className="mt-1">
              {t(
                "Yes, your IPTV URL is processed securely and is never stored on our servers or shared with third parties.",
              )}
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {t("What information can I check?")}
            </p>
            <p className="mt-1">
              {t(
                "You can check your account status, subscription expiration date, connection limits, and server information.",
              )}
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {t("Why is my check failing?")}
            </p>
            <p className="mt-1">
              {t(
                "Make sure your IPTV URL is correct and includes the username and password parameters. The server must also be online and accessible.",
              )}
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {t("How often can I check my status?")}
            </p>
            <p className="mt-1">
              {t(
                "You can check your IPTV status as often as needed. There are no limits on the number of checks you can perform.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
