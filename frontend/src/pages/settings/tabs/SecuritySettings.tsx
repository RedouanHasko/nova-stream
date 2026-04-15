import { useState } from "react";
import { Lock, Shield, Key, Eye, EyeOff } from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";

export function SecuritySettings() {
  const { t } = useI18n();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">
            {t("Change Password")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Ensure your account is using a long, random password to stay secure.",
            )}
          </p>
        </div>
        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Current Password")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Key
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  name="current-password"
                  id="current-password"
                  placeholder="••••••••"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((current) => !current)}
                  aria-label={
                    showCurrentPassword
                      ? t("Hide password")
                      : t("Show password")
                  }
                  title={
                    showCurrentPassword
                      ? t("Hide password")
                      : t("Show password")
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("New Password")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="new-password"
                  id="new-password"
                  placeholder="••••••••"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  aria-label={
                    showNewPassword ? t("Hide password") : t("Show password")
                  }
                  title={
                    showNewPassword ? t("Hide password") : t("Show password")
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Confirm New Password")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Shield
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirm-password"
                  id="confirm-password"
                  placeholder="••••••••"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={
                    showConfirmPassword
                      ? t("Hide password")
                      : t("Show password")
                  }
                  title={
                    showConfirmPassword
                      ? t("Hide password")
                      : t("Show password")
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            {t("Update Password")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">
            {t("Two-Factor Authentication")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Add an extra layer of security to your account by enabling 2FA.",
            )}
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center">
                <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("Authenticator App")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("Use an app like Google Authenticator or Authy.")}
                </p>
              </div>
            </div>
            <button className="rounded-xl bg-foreground/5 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors">
              {t("Enable")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
