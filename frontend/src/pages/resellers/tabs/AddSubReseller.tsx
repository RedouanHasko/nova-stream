import { Users, User, Mail, Lock, Building2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { useState, useEffect } from "react";
import { ResellerFeedbackModal } from "../../../components/resellers/ResellerFeedbackModal";
import { PhoneNumberInput } from "../../../components/common/PhoneNumberInput";
import api from "../../../lib/api";

export function AddSubReseller() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [parentId, setParentId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [parents, setParents] = useState<any[]>([]);
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

  const resetForm = () => {
    setParentId("");
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (user?.role === "superadmin") {
          const res = await api.getResellers();
          if (mounted) setParents(Array.isArray(res) ? res : []);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.role]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!name || !email || !phone || !password) {
      showFeedback(
        t("Missing information"),
        t(
          "Please provide the sub-reseller name, email, phone number, and password before creating the account.",
        ),
        "info",
      );
      return;
    }
    setLoading(true);
    try {
      const payload: any = { name, email: email || null, phone };
      if (user?.role === "superadmin" && parentId)
        payload.parentId = Number(parentId);
      // if logged-in reseller, backend will force parentId to their resellerId
      if (password) payload.user = { email, password, name, phone };
      const res = await api.createReseller(payload);
      const created = res?.reseller || res;
      window.dispatchEvent(new Event("resellers:refresh"));
      showFeedback(
        t("Sub-reseller created"),
        t(
          "{{name}}{{email}} has been created successfully{{code}} and is now available in the reseller list.",
          {
            name,
            email: email ? ` (${email})` : "",
            code: created?.code ? ` ${t("with code")} ${created.code}` : "",
          },
        ),
        "success",
      );
    } catch (e: any) {
      console.error(e);
      showFeedback(
        t("Unable to create sub-reseller"),
        e?.response?.data?.error ||
          e?.message ||
          t("Something went wrong while creating the sub-reseller."),
        "error",
      );
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
              <Users className="h-5 w-5 text-emerald-500" />
              {t("Add Sub Reseller")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.role === "superadmin"
                ? t("Create a sub-reseller account under an existing reseller.")
                : t("Create a new sub-reseller account under your management.")}
            </p>
          </div>
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="parent-reseller"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("Parent Reseller")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Building2
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  {user?.role === "superadmin" ? (
                    <select
                      id="parent-reseller"
                      name="parent-reseller"
                      value={parentId}
                      onChange={(e) =>
                        setParentId(
                          e.target.value ? Number(e.target.value) : "",
                        )
                      }
                      className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6 appearance-none"
                    >
                      <option value="">
                        {t("Select a parent reseller...")}
                      </option>
                      {parents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code || p.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={`${user?.name} (${t("You")})`}
                      className="block w-full rounded-xl border-0 bg-foreground/5 py-2.5 pl-10 text-muted-foreground shadow-sm ring-1 ring-inset ring-border sm:text-sm sm:leading-6 cursor-not-allowed"
                    />
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("Sub Reseller Full Name")}
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
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                    placeholder={t("Jane Doe")}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-foreground"
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
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                    placeholder={t("jane@example.com")}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium leading-6 text-foreground"
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
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("Password")}
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
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm sm:leading-6"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 space-y-4">
                <label className="block text-sm font-medium leading-6 text-foreground">
                  {t("Sub-Reseller Permissions")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/5 border border-border">
                    <span className="text-sm text-foreground">
                      {t("Activate Devices (MAC)")}
                    </span>
                    <input
                      type="checkbox"
                      defaultChecked
                      aria-label={t("Activate devices permission")}
                      title={t("Activate devices permission")}
                      className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/5 border border-border">
                    <span className="text-sm text-foreground">
                      {t("View Credit Balance")}
                    </span>
                    <input
                      type="checkbox"
                      defaultChecked
                      aria-label={t("View credit balance permission")}
                      title={t("View credit balance permission")}
                      className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/5 border border-border">
                    <span className="text-sm text-foreground">
                      {t("View Credit Logs")}
                    </span>
                    <input
                      type="checkbox"
                      defaultChecked
                      aria-label={t("View credit logs permission")}
                      title={t("View credit logs permission")}
                      className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/5 border border-border">
                    <span className="text-sm text-foreground">
                      {t("Request Credits from Parent")}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={t("Request credits from parent permission")}
                      title={t("Request credits from parent permission")}
                      className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/5 border border-border">
                    <span className="text-sm text-foreground">
                      {t("Manage Playlists")}
                    </span>
                    <input
                      type="checkbox"
                      defaultChecked
                      aria-label={t("Manage playlists permission")}
                      title={t("Manage playlists permission")}
                      className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-input px-6 py-4 flex justify-end border-t border-border">
            <button
              disabled={loading}
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring gap-2 transition-all"
            >
              <Users className="h-4 w-4" />
              {loading ? t("Creating…") : t("Create Sub Reseller")}
            </button>
          </div>
        </div>
      </form>

      <ResellerFeedbackModal
        isOpen={feedback.isOpen}
        onClose={() => {
          const wasSuccess = feedback.variant === "success";
          setFeedback((current) => ({ ...current, isOpen: false }));
          if (wasSuccess) {
            resetForm();
            window.dispatchEvent(
              new CustomEvent("reseller-hub:navigate", {
                detail: { tab: "list" },
              }),
            );
          }
        }}
        title={feedback.title}
        message={feedback.message}
        variant={feedback.variant}
      />
    </div>
  );
}
