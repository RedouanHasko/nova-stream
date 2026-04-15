import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  MonitorPlay,
  Shield,
  ShieldCheck,
  UserPlus,
  Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { PhoneNumberInput } from "../../components/common/PhoneNumberInput";
import RecaptchaBox, {
  requestInvisibleRecaptchaToken,
} from "../../components/common/RecaptchaBox";
import { formatMAC } from "../../lib/utils";
import * as api from "../../lib/api";

interface Plan {
  id: number;
  name: string;
  price: number;
  credits: number;
  currency?: string;
  features?: string;
  planType?: "DIRECT_ACTIVATION" | "CREDIT_RECHARGE";
  duration?: "1_year" | "lifetime" | string;
}

interface AppItem {
  id: number;
  name: string;
  description?: string;
}

interface PaymentConfig {
  provider: string;
  configured: boolean;
  mode: "gateway" | "simulation";
}

function formatMoney(plan?: Plan | null) {
  const symbol = (plan?.currency || "USD") === "EUR" ? "€" : "$";
  return `${symbol}${Number(plan?.price || 0).toFixed(2)}`;
}

function getDurationLabel(plan?: Plan | null) {
  return (plan?.duration || "").toString().toLowerCase() === "lifetime"
    ? "Lifetime"
    : "One Year";
}

function parseFeatures(plan: Plan) {
  const entries = (plan.features || "")
    .split(/\r?\n|,|•/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (entries.length > 0) return entries;

  return [
    "Instant activation after payment confirmation",
    "Secure MAC + device key linking",
    "Managed directly by the NOVA Panel backend",
  ];
}

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(
    null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resellerName, setResellerName] = useState("");
  const [resellerEmail, setResellerEmail] = useState("");
  const [resellerPhone, setResellerPhone] = useState("");
  const [resellerPassword, setResellerPassword] = useState("");
  const [resellerConfirmPassword, setResellerConfirmPassword] = useState("");
  const [signupKey, setSignupKey] = useState("");
  const [resellerError, setResellerError] = useState("");
  const [resellerMessage, setResellerMessage] = useState("");
  const [creatingReseller, setCreatingReseller] = useState(false);
  const [resellerCaptchaToken, setResellerCaptchaToken] = useState<
    string | null
  >(null);
  const [resellerCaptchaResetSignal, setResellerCaptchaResetSignal] =
    useState(0);
  const [showResellerPassword, setShowResellerPassword] = useState(false);
  const [showResellerConfirmPassword, setShowResellerConfirmPassword] =
    useState(false);
  const [success, setSuccess] = useState<{
    planName: string;
    appName: string;
    mac: string;
    expiresAt?: string | null;
  } | null>(null);
  const isRecaptchaEnabled =
    import.meta.env.VITE_RECAPTCHA_ENABLED === "true" &&
    Boolean(import.meta.env.VITE_RECAPTCHA_SITE_KEY);
  const recaptchaMode =
    import.meta.env.VITE_RECAPTCHA_MODE === "invisible"
      ? "invisible"
      : "widget";

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [planResponse, appResponse, paymentResponse] = await Promise.all([
          api.getPublicPricingPlans(),
          api.getPublicApplications(),
          api.getPublicPaymentConfig(),
        ]);

        if (!mounted) return;

        const nextPlans = Array.isArray(planResponse) ? planResponse : [];
        const nextApps = Array.isArray(appResponse) ? appResponse : [];

        setPlans(nextPlans);
        setApps(nextApps);
        setPaymentConfig(paymentResponse || null);

        if (nextPlans.length > 0) {
          setSelectedPlanId(Number(nextPlans[0].id));
        }
        if (nextApps.length > 0) {
          setApplicationId(String(nextApps[0].id));
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to load plans from the backend.");
        }
      } finally {
        if (mounted) setLoadingData(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutState === "cancelled") {
      setError("Payment was cancelled before confirmation.");
      setSearchParams({}, { replace: true });
      return;
    }

    if (checkoutState !== "success" || !sessionId) return;

    let mounted = true;
    (async () => {
      setIsSubmitting(true);
      setError("");
      try {
        const result = await api.confirmPublicPlanCheckout(sessionId);
        if (!mounted) return;

        setSuccess({
          planName: result?.plan?.name || "Selected plan",
          appName: result?.application?.name || "Selected app",
          mac: result?.device?.mac || macAddress,
          expiresAt: result?.activation?.expiresAt || null,
        });
        setSearchParams({}, { replace: true });
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Payment verification failed.");
        }
      } finally {
        if (mounted) setIsSubmitting(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [macAddress, searchParams, setSearchParams]);

  const selectedPlan = useMemo(
    () =>
      plans.find((plan) => Number(plan.id) === Number(selectedPlanId)) || null,
    [plans, selectedPlanId],
  );

  const selectedApp = useMemo(
    () => apps.find((app) => String(app.id) === applicationId) || null,
    [apps, applicationId],
  );

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (
      !selectedPlan?.id ||
      !applicationId ||
      !macAddress ||
      !deviceKey.trim()
    ) {
      setError(
        "Choose a plan and app, then enter the MAC address and device key.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.purchasePublicPlan(selectedPlan.id, {
        applicationId: Number(applicationId),
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        mac: macAddress,
        deviceKey: deviceKey.trim(),
        paymentMethod: "CARD",
      });

      if (result?.mode === "redirect" && result?.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setSuccess({
        planName: result?.plan?.name || selectedPlan.name,
        appName:
          result?.application?.name || selectedApp?.name || "Selected app",
        mac: result?.device?.mac || macAddress,
        expiresAt: result?.activation?.expiresAt || null,
      });
      setMacAddress("");
      setDeviceKey("");
    } catch (err: any) {
      setError(
        err?.message || "Failed to complete the purchase and activation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResellerCaptchaVerify = useCallback((token: string | null) => {
    setResellerCaptchaToken(token);
  }, []);

  const handleCreateResellerAccount = async (e: FormEvent) => {
    e.preventDefault();
    setResellerError("");
    setResellerMessage("");

    if (
      !resellerName.trim() ||
      !resellerEmail.trim() ||
      !resellerPhone.trim()
    ) {
      setResellerError(
        "Please complete the reseller name, email, and phone number.",
      );
      return;
    }
    if (resellerPassword.length < 8) {
      setResellerError("Password must be at least 8 characters long.");
      return;
    }
    if (resellerPassword !== resellerConfirmPassword) {
      setResellerError("The reseller passwords do not match.");
      return;
    }

    let captchaToken = resellerCaptchaToken;
    if (isRecaptchaEnabled && recaptchaMode === "invisible") {
      try {
        captchaToken = await requestInvisibleRecaptchaToken({
          action: "public_register",
          mode: recaptchaMode,
        });
        setResellerCaptchaToken(captchaToken);
      } catch (err: any) {
        setResellerError(
          err?.message || "reCAPTCHA could not be completed right now.",
        );
        return;
      }
    }

    if (isRecaptchaEnabled && !captchaToken) {
      setResellerError("Please complete the reCAPTCHA challenge.");
      return;
    }

    setCreatingReseller(true);
    try {
      await api.registerPublicReseller({
        name: resellerName.trim(),
        email: resellerEmail.trim(),
        phone: resellerPhone.trim(),
        password: resellerPassword,
        signupKey: signupKey.trim() || undefined,
        captchaToken,
      });
      setResellerMessage(
        "Reseller account created successfully. You can now sign in to the panel.",
      );
      setResellerName("");
      setResellerEmail("");
      setResellerPhone("");
      setResellerPassword("");
      setResellerConfirmPassword("");
      setSignupKey("");
      window.setTimeout(() => navigate("/login"), 800);
    } catch (err: any) {
      setResellerError(
        err?.message || "Unable to create the reseller account right now.",
      );
    } finally {
      if (isRecaptchaEnabled) {
        setResellerCaptchaResetSignal((current) => current + 1);
      }
      setCreatingReseller(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-10 w-10 text-emerald-500" />
          </div>
          <h2 className="mb-4 text-3xl font-bold text-foreground">
            Activation Completed
          </h2>
          <p className="mb-3 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {success.appName}
            </span>{" "}
            has been activated on MAC{" "}
            <span className="font-mono text-foreground">{success.mac}</span>{" "}
            using the{" "}
            <span className="font-semibold text-foreground">
              {success.planName}
            </span>{" "}
            plan.
          </p>
          <p className="mb-8 text-sm text-muted-foreground">
            {success.expiresAt
              ? `Access is active until ${new Date(success.expiresAt).toLocaleDateString()}.`
              : "Access is now active. Restart the app if needed to refresh the device."}
          </p>
          <button
            onClick={() => setSuccess(null)}
            className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <nav className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-foreground p-1.5">
              <MonitorPlay className="h-6 w-6 text-background" />
            </div>
            <span className="text-xl font-bold tracking-tight">NOVA Panel</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
              >
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="text-sm font-medium transition-colors hover:text-foreground/70"
                >
                  Reseller Login
                </button>
                <button
                  onClick={() =>
                    document
                      .getElementById("pricing")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-foreground/5 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight md:text-7xl">
            Buy Your Plan and <br />
            <span className="bg-linear-to-r from-emerald-500 to-blue-500 bg-clip-text text-transparent">
              Activate Your App Instantly
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-muted-foreground">
            This landing page is linked directly to the backend so normal
            clients only see the direct activation plans here, while reseller
            credit plans remain inside the reseller panel.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="#pricing"
              className="flex items-center gap-2 rounded-2xl bg-foreground px-8 py-4 text-lg font-bold text-background transition-all hover:bg-foreground/90"
            >
              View Plans <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#reseller-signup"
              className="flex items-center gap-2 rounded-2xl border border-border bg-card px-8 py-4 text-lg font-bold text-foreground transition-all hover:bg-accent"
            >
              Become Reseller Now <UserPlus className="h-5 w-5" />
            </a>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4 text-emerald-500" />
              <span>Backend-linked checkout</span>
              <span className="mx-2">•</span>
              <Zap className="h-4 w-4 text-yellow-500" />
              <span>Instant activation</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-card/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Globe className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Direct Client Sales</h3>
              <p className="text-muted-foreground">
                Sell plans to normal clients from a clean public page while
                still keeping everything linked to your admin backend.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
                <ShieldCheck className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="mb-3 text-xl font-bold">MAC + Key Linking</h3>
              <p className="text-muted-foreground">
                Every purchase is tied to the device MAC address and app key so
                the backend can verify and serve the correct activation data.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
                <MonitorPlay className="h-8 w-8 text-purple-500" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Admin Visibility</h3>
              <p className="text-muted-foreground">
                Activations created from this page are stored in the same system
                so the admin can track direct-client devices too.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold">Direct Activation Plans</h2>
            <p className="text-muted-foreground">
              Choose a One Year or Lifetime activation plan and the supported
              app you want to activate.
            </p>
          </div>

          {paymentConfig && (
            <div
              className={`mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
                paymentConfig.configured
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border border-amber-500/20 bg-amber-500/10 text-amber-600"
              }`}
            >
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {paymentConfig.configured
                  ? `Live ${paymentConfig.provider} checkout is enabled for this landing page.`
                  : "Gateway keys are not configured yet, so checkout currently falls back to the built-in simulated payment mode."}
              </span>
            </div>
          )}

          {error && (
            <div className="mx-auto mb-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {loadingData ? (
              <div className="md:col-span-3 flex items-center justify-center rounded-3xl border border-border bg-card p-10 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading plans...
              </div>
            ) : plans.length === 0 ? (
              <div className="md:col-span-3 rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">
                No public plans are active yet. Add them from the admin pricing
                settings.
              </div>
            ) : (
              plans.map((plan, index) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(Number(plan.id))}
                  className={`relative flex cursor-pointer flex-col rounded-3xl border-2 p-8 transition-all duration-300 ${
                    Number(selectedPlanId) === Number(plan.id)
                      ? "scale-[1.02] border-emerald-500 bg-emerald-500/5 shadow-2xl"
                      : "border-border bg-card hover:border-foreground/20"
                  }`}
                >
                  {index === 1 && plans.length > 1 && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      Popular
                    </div>
                  )}
                  <div className="mb-8">
                    <h3 className="mb-2 text-xl font-bold">{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold">
                        {formatMoney(plan)}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      {getDurationLabel(plan)} access managed in the backend and
                      ready for direct client checkout.
                    </p>
                  </div>
                  <ul className="mb-8 flex-1 space-y-4">
                    {parseFeatures(plan).map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-3 text-sm"
                      >
                        <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div
                    className={`mt-auto w-full rounded-xl py-3 text-center font-bold transition-colors ${
                      Number(selectedPlanId) === Number(plan.id)
                        ? "bg-emerald-500 text-white"
                        : "bg-foreground/5 text-foreground"
                    }`}
                  >
                    {Number(selectedPlanId) === Number(plan.id)
                      ? "Selected"
                      : "Select Plan"}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-8 shadow-xl">
            <h3 className="mb-6 flex items-center gap-2 text-2xl font-bold">
              <CreditCard className="h-6 w-6 text-emerald-500" />
              Complete Your Activation
            </h3>
            <form onSubmit={handleSubscribe} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="customer-name"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    Name (optional)
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your full name"
                    className="block w-full rounded-xl border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="customer-email"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    Email (optional)
                  </label>
                  <input
                    id="customer-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="block w-full rounded-xl border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="application"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  App to Activate
                </label>
                <div className="relative">
                  <Layers className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <select
                    id="application"
                    required
                    value={applicationId}
                    onChange={(e) => setApplicationId(e.target.value)}
                    className="block w-full rounded-xl border-border bg-input py-3 pr-4 pl-10 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select an app</option>
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="mac"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Device MAC Address
                </label>
                <input
                  id="mac"
                  type="text"
                  required
                  placeholder="00:1A:79:XX:XX:XX"
                  value={macAddress}
                  onChange={(e) => setMacAddress(formatMAC(e.target.value))}
                  className="block w-full rounded-xl border-border bg-input px-4 py-3 font-mono text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter the MAC address shown inside the IPTV app on the client
                  device.
                </p>
              </div>

              <div>
                <label
                  htmlFor="device-key"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Device Key
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="device-key"
                    type="text"
                    required
                    placeholder="Enter the key shown by the app"
                    value={deviceKey}
                    onChange={(e) => setDeviceKey(e.target.value)}
                    className="block w-full rounded-xl border-border bg-input py-3 pr-4 pl-10 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-foreground/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Selected Plan:
                  </span>
                  <span className="font-bold text-foreground">
                    {selectedPlan?.name || "None"}
                  </span>
                </div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Selected App:</span>
                  <span className="font-medium text-foreground">
                    {selectedApp?.name || "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-lg">
                  <span className="font-medium">Total Amount:</span>
                  <span className="font-extrabold text-emerald-500">
                    {formatMoney(selectedPlan)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  !selectedPlan ||
                  !applicationId ||
                  !macAddress ||
                  !deviceKey.trim() ||
                  isSubmitting ||
                  loadingData
                }
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-lg font-bold text-background transition-all hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    {paymentConfig?.configured
                      ? "Continue to Secure Payment"
                      : "Pay & Activate Now"}
                  </>
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                This public checkout is linked to the backend and stores the
                activation in the admin system.
                {paymentConfig?.configured
                  ? ` Payments are routed through ${paymentConfig.provider}.`
                  : " Until you add gateway keys, the flow remains in simulated mode."}
              </p>
            </form>
          </div>
        </div>
      </section>

      <section
        id="reseller-signup"
        className="border-t border-border bg-card/30 py-24"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-4xl font-bold">Become Reseller Now</h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Use this test page to simulate reseller self-signup from another
              website. The phone number is required for recovery and
              notifications, but no phone verification step is needed here.
            </p>
          </div>

          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-xl">
            <form onSubmit={handleCreateResellerAccount} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Business / reseller name
                  </label>
                  <input
                    type="text"
                    required
                    value={resellerName}
                    onChange={(e) => setResellerName(e.target.value)}
                    placeholder="Your brand or company name"
                    className="block w-full rounded-xl border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Contact email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={resellerEmail}
                      onChange={(e) => setResellerEmail(e.target.value)}
                      placeholder="reseller@example.com"
                      className="block w-full rounded-xl border-border bg-input py-3 pr-4 pl-10 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Phone number
                  </label>
                  <PhoneNumberInput
                    id="reseller-phone"
                    name="reseller-phone"
                    required
                    value={resellerPhone}
                    onChange={setResellerPhone}
                    placeholder="600000000"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    A valid phone number is required for account recovery and
                    notifications.
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Signup key (optional)
                  </label>
                  <input
                    type="text"
                    value={signupKey}
                    onChange={(e) => setSignupKey(e.target.value)}
                    placeholder="Use this only if public registration requires a shared key"
                    className="block w-full rounded-xl border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-sm text-muted-foreground">
                The phone number is required, but this reseller signup form no
                longer asks for a verification code.
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showResellerPassword ? "text" : "password"}
                      required
                      value={resellerPassword}
                      onChange={(e) => setResellerPassword(e.target.value)}
                      placeholder="Choose a strong password"
                      className="block w-full rounded-xl border-border bg-input py-3 pr-11 pl-10 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowResellerPassword((current) => !current)
                      }
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showResellerPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showResellerPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showResellerConfirmPassword ? "text" : "password"}
                      required
                      value={resellerConfirmPassword}
                      onChange={(e) =>
                        setResellerConfirmPassword(e.target.value)
                      }
                      placeholder="Repeat the password"
                      className="block w-full rounded-xl border-border bg-input py-3 pr-11 pl-10 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowResellerConfirmPassword((current) => !current)
                      }
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showResellerConfirmPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showResellerConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {resellerError && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                  {resellerError}
                </div>
              )}

              {resellerMessage && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
                  {resellerMessage}
                </div>
              )}

              {isRecaptchaEnabled && (
                <RecaptchaBox
                  resetSignal={resellerCaptchaResetSignal}
                  onVerify={handleResellerCaptchaVerify}
                />
              )}

              <button
                type="submit"
                disabled={creatingReseller}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingReseller ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating reseller account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-5 w-5" />
                    Become Reseller Now
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-foreground p-1.5">
                <MonitorPlay className="h-6 w-6 text-background" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                NOVA Panel
              </span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <a
                href="#pricing"
                className="transition-colors hover:text-foreground"
              >
                Plans
              </a>
              <a
                href="/login"
                className="transition-colors hover:text-foreground"
              >
                Reseller Login
              </a>
              <span>Support</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 NOVA Panel. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
