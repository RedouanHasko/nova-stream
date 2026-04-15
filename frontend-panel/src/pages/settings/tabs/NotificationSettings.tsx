import { Mail, Smartphone } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";

export function NotificationSettings() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="border-b border-border px-6 py-5 bg-foreground/5">
        <h2 className="text-base font-semibold leading-6 text-foreground">
          {t("Notification Preferences")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Choose how you want to be notified about important events.")}
        </p>
      </div>
      <div className="px-6 py-6 space-y-8">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            {t("Email Notifications")}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Account Activity")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Get notified about logins and security changes.")}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Low Credit Alert")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Get notified when your credit balance is low.")}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            {t("Push Notifications")}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("New Device Activation")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Get notified when a new device is activated.")}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
        >
          {t("Save Preferences")}
        </button>
      </div>
    </div>
  );
}
