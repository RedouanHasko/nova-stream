import { useState } from "react";
import { User, Mail, Building2, Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import api from "../../../lib/api";
import { PhoneNumberInput } from "../../../components/common/PhoneNumberInput";

export function ProfileSettings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSuperAdmin = user?.role === "superadmin";
  const roleLabel = isSuperAdmin
    ? t("Administrator")
    : user?.role === "reseller"
      ? t("Reseller")
      : t("Sub Reseller");

  const [firstName, setFirstName] = useState(user?.name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(
    user?.name?.split(" ").slice(1).join(" ") || "",
  );
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(
    user?.phone || user?.reseller?.phone || "",
  );
  const [company] = useState(user?.reseller?.name || "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    const fullName = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ");
    if (!fullName) {
      setError(t("Name is required"));
      return;
    }
    if (!email.trim()) {
      setError(t("Email is required"));
      return;
    }
    if (!phone.trim()) {
      setError(
        t("Phone number is required for password recovery and notifications."),
      );
      return;
    }

    setLoading(true);
    try {
      const data: any = { name: fullName };
      if (email.trim() !== user?.email) {
        data.email = email.trim();
      }
      if (phone.trim() !== (user?.phone || user?.reseller?.phone || "")) {
        data.phone = phone.trim();
      }
      await api.updateProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.error || e?.message || t("Failed to save profile"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="border-b border-border px-6 py-5 bg-foreground/5">
        <h2 className="text-base font-semibold leading-6 text-foreground">
          {t("Profile Information")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSuperAdmin
            ? t("Update your administrator account details.")
            : t("Update your account details and public profile.")}
        </p>
      </div>
      <div className="px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label
              htmlFor="first-name"
              className="block text-sm font-medium leading-6 text-muted-foreground"
            >
              {t("First name")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="first-name"
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="last-name"
              className="block text-sm font-medium leading-6 text-muted-foreground"
            >
              {t("Last name")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="last-name"
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium leading-6 text-muted-foreground"
            >
              {t("Email address")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="phone"
              className="block text-sm font-medium leading-6 text-muted-foreground"
            >
              {t("Phone Number")}
            </label>
            <div className="mt-2">
              <PhoneNumberInput
                id="phone"
                name="phone"
                value={phone}
                onChange={setPhone}
                placeholder="600000000"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Make sure this phone number is correct. It may be needed to recover the account if the user loses their credentials.",
              )}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="account-role"
              className="block text-sm font-medium leading-6 text-muted-foreground"
            >
              {t("Account role")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Building2
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="account-role"
                id="account-role"
                value={roleLabel}
                readOnly
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground opacity-80 sm:text-sm sm:leading-6"
              />
            </div>
            {isSuperAdmin && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("This is your administrator account profile.")}
              </p>
            )}
          </div>

          {!isSuperAdmin && (
            <div className="sm:col-span-2">
              <label
                htmlFor="company"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Company / Reseller Name")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Building2
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <input
                  type="text"
                  name="company"
                  id="company"
                  value={company}
                  readOnly
                  placeholder={t("Enter your company name")}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground opacity-80 sm:text-sm sm:leading-6"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("This reseller name is managed from the reseller records.")}
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-500 font-medium">
            {error}
          </div>
        )}

        {saved && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-500 font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {t("Profile updated successfully!")}
          </div>
        )}
      </div>
      <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors gap-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? t("Saving...") : t("Save Changes")}
        </button>
      </div>
    </div>
  );
}
