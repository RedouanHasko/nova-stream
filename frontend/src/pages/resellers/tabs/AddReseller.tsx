import { UserPlus, User, Mail, Lock, Coins } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../../contexts/I18nContext";
import { ResellerFeedbackModal } from "../../../components/resellers/ResellerFeedbackModal";
import { PhoneNumberInput } from "../../../components/common/PhoneNumberInput";
import api from "../../../lib/api";

export function AddReseller() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [credits, setCredits] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    variant: "info",
  });

  const showFeedback = (
    title: string,
    message: string,
    variant: "success" | "error" | "info",
  ) => setFeedback({ isOpen: true, title, message, variant });

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!name) {
      showFeedback(
        t("Missing information"),
        t("Please provide the reseller full name before creating the account."),
        "info",
      );
      return;
    }
    if (!phone.trim()) {
      showFeedback(
        t("Missing information"),
        t("Phone number is required for password recovery and notifications."),
        "info",
      );
      return;
    }
    if (!email.trim() || !password.trim()) {
      showFeedback(
        t("Missing information"),
        t(
          "Email and password are required so the reseller can access their profile.",
        ),
        "info",
      );
      return;
    }
    if (password.trim().length < 8) {
      showFeedback(
        t("Missing information"),
        t("Password must be at least 8 characters long."),
        "info",
      );
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const payload: any = {
        name,
        email: normalizedEmail,
        phone,
        user: {
          email: normalizedEmail,
          password,
          name,
          phone,
        },
      };
      const res = await api.createReseller(payload);
      const created = res?.reseller || res;
      if (created && created.id && Number(credits) > 0) {
        try {
          await api.updateReseller(created.id, { credits: Number(credits) });
        } catch (e) {
          console.warn("Failed to set initial credits", e);
        }
      }
      // notify other components to refresh
      window.dispatchEvent(new Event("resellers:refresh"));
      showFeedback(
        t("Reseller created"),
        t(
          "{{name}} has been created successfully{{code}} and is now available in reseller management.",
          {
            name,
            code: created?.code ? ` ${t("with code")} ${created.code}` : "",
          },
        ),
        "success",
      );
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setCredits("");
    } catch (err: any) {
      console.error(err);
      showFeedback(
        t("Unable to create reseller"),
        err?.response?.data?.error ||
          err?.message ||
          t("Something went wrong while creating the reseller."),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
          <div className="border-b border-border px-6 py-5 bg-foreground/5">
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-500" />
              {t("Add New Reseller")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Create a new reseller account and allocate initial credits.")}
            </p>
          </div>
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Full Name")}
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
                    name="name"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    placeholder={t("John Doe")}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Email Address")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    placeholder={t("john@example.com")}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Phone Number")} <span className="text-rose-500">*</span>
                </label>
                <div className="mt-2">
                  <PhoneNumberInput
                    id="phone"
                    name="phone"
                    required
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

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Password")} <span className="text-rose-500">*</span>
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    type="password"
                    name="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="credits"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Initial Credits")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Coins
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    name="credits"
                    id="credits"
                    value={credits}
                    onChange={(e) => setCredits(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    placeholder={t("e.g. 100")}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
            <button
              disabled={loading}
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground gap-2 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? t("Creating…") : t("Create Reseller")}
            </button>
          </div>
        </div>
      </form>

      <ResellerFeedbackModal
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
