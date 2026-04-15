import { motion } from "motion/react";
import {
  Check,
  Star,
  Zap,
  ShieldCheck,
  HelpCircle,
  Info,
  Smartphone,
  Tv,
  Monitor,
  Lock,
  ArrowRight,
  CreditCard,
  ChevronLeft,
  Mail,
  MessageCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import {
  checkoutPublicPlan,
  confirmPublicCheckout,
  getPublicApplications,
  getPublicPaymentConfig,
  getPublicPricingPlans,
  type CheckoutResponse,
  type PublicApp,
  type PublicPricingPlan,
  verifyActivation,
} from "../lib/api";

const fallbackPlans = [
  {
    id: "fallback-yearly",
    name: "Yearly Activation",
    price: "€1.99",
    period: "per year",
    description: "Perfect for testing our premium service.",
    features: [
      "1 Year Full Access",
      "All Features Included",
      "4K UHD Support",
      "Multi-playlist support",
      "24/7 Support",
      "Fast Activation",
    ],
    buttonText: "Activate Now",
    popular: false,
  },
  {
    id: "fallback-lifetime",
    name: "Lifetime Activation",
    price: "€4.99",
    period: "one-time payment",
    description: "The best value for long-term users.",
    features: [
      "Lifetime Full Access",
      "All Features Included",
      "4K UHD Support",
      "Multi-playlist support",
      "Priority Support",
      "Instant Activation",
      "Free Future Updates",
    ],
    buttonText: "Get Lifetime",
    popular: true,
  },
];

type DisplayPlan = {
  id: string;
  backendId?: number;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  buttonText: string;
  popular: boolean;
  duration?: string | null;
};

function parseFeatures(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n|,|\u2022/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function moneyLabel(plan: PublicPricingPlan) {
  const symbol = (plan.currency || "USD").toUpperCase() === "EUR" ? "€" : "$";
  return `${symbol}${Number(plan.price || 0).toFixed(2)}`;
}

function getPeriodLabel(duration?: string | null) {
  switch ((duration || "").toLowerCase()) {
    case "lifetime":
      return "one-time payment";
    case "6_months":
      return "per 6 months";
    case "3_months":
      return "per 3 months";
    case "1_month":
      return "per month";
    default:
      return "per year";
  }
}

function toDisplayPlan(plan: PublicPricingPlan): DisplayPlan {
  const features = parseFeatures(plan.features);
  return {
    id: `plan-${plan.id}`,
    backendId: Number(plan.id),
    name: plan.name || "Activation Plan",
    price: moneyLabel(plan),
    period: getPeriodLabel(plan.duration),
    description:
      features[0] || "Instant secure activation for your NOVA PLAYER device.",
    features:
      features.length > 0
        ? features
        : ["Secure device activation", "Fast provisioning", "Support included"],
    buttonText:
      (plan.duration || "").toLowerCase() === "lifetime"
        ? "Get Lifetime"
        : "Activate Now",
    popular: (plan.duration || "").toLowerCase() === "lifetime",
    duration: plan.duration || null,
  };
}

const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || "support@novaplayer.com";
const SUPPORT_WHATSAPP = (import.meta.env.VITE_SUPPORT_WHATSAPP || "")
  .toString()
  .replace(/\D/g, "");

export default function DeviceActivation() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [macAddress, setMacAddress] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DisplayPlan | null>(null);
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [applications, setApplications] = useState<PublicApp[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal">("card");
  const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activationComplete, setActivationComplete] =
    useState<CheckoutResponse | null>(null);
  const [isConfirmingCheckout, setIsConfirmingCheckout] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<{
    provider: string;
    configured: boolean;
    mode: string;
    publishableKey: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    // Handle Stripe return: ?checkout=success&session_id=...
    const checkoutStatus = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutStatus === "success" && sessionId) {
      setIsConfirmingCheckout(true);
      confirmPublicCheckout(sessionId)
        .then((result) => {
          if (!active) return;
          setActivationComplete(result);
        })
        .catch((err) => {
          if (!active) return;
          setNotice(
            err?.message ||
              "Could not confirm your payment. Please contact support.",
          );
        })
        .finally(() => {
          if (!active) return;
          setIsConfirmingCheckout(false);
        });
      return () => {
        active = false;
      };
    }

    if (checkoutStatus === "cancelled") {
      setNotice("Payment was cancelled. You can try again when ready.");
    }

    Promise.all([
      getPublicPricingPlans(),
      getPublicApplications(),
      getPublicPaymentConfig().catch(() => ({
        provider: "manual",
        configured: false,
        mode: "manual",
        publishableKey: null,
      })),
    ])
      .then(([pricingPlans, appList, gatewayConfig]) => {
        if (!active) return;

        const normalizedPlans = pricingPlans.map(toDisplayPlan);
        setPlans(normalizedPlans);
        setApplications(appList);
        setPaymentConfig(gatewayConfig);
        if (appList[0]?.id) {
          setSelectedApplicationId(String(appList[0].id));
        }
      })
      .catch((error) => {
        console.error("landing catalog loading failed", error);
        if (!active) return;
        setPlans([]);
        setApplications([]);
        setNotice(
          "Backend catalog is unavailable right now. Check API connection or VITE_API_URL.",
        );
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingCatalog(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const requestedPlan = searchParams.get("plan");
    const sourcePlans = plans.length > 0 ? plans : fallbackPlans;
    if (!requestedPlan) {
      setSelectedPlan(null);
      return;
    }

    const resolved = sourcePlans.find((plan) => {
      const normalized = requestedPlan.toLowerCase();
      return (
        plan.id === requestedPlan ||
        plan.name.toLowerCase().includes(normalized) ||
        (normalized === "lifetime" && plan.period.includes("one-time")) ||
        (normalized === "yearly" && plan.period.includes("year"))
      );
    });

    setSelectedPlan(resolved ?? null);
  }, [searchParams, plans]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const formatMacAddress = (value: string) => {
    const hexOnly = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    const limited = hexOnly.slice(0, 12);
    const matches = limited.match(/.{1,2}/g);
    return matches ? matches.join(":") : limited;
  };

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMacAddress(formatMacAddress(e.target.value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCaptchaChecked) {
      alert(t("Please verify that you are not a robot."));
      return;
    }

    if (!macAddress || !deviceKey) {
      setNotice("MAC address and device key are required.");
      return;
    }

    try {
      const verification = await verifyActivation({
        mac: macAddress,
        deviceKey,
        applicationId: selectedApplicationId || undefined,
      });

      if (verification.reason === "device_key_mismatch") {
        setNotice("The device key does not match this MAC address.");
        return;
      }

      if (verification.reason === "blocked") {
        setNotice("This device is blocked. Please contact support.");
        return;
      }

      setIsLoggedIn(true);
    } catch (error: any) {
      setNotice(error?.message || "Unable to verify device right now.");
    }
  };

  const handlePlanShortcut = (plan: DisplayPlan) => {
    setSelectedPlan(plan);
    const target = document.getElementById("device-login");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const selectedApplicationName =
    applications.find((app) => String(app.id) === selectedApplicationId)
      ?.name || "Not selected";

  const buildActivationContactMessage = () => {
    const lines = [
      "Hello, I want to activate my application manually.",
      `MAC: ${macAddress || "-"}`,
      `Device key: ${deviceKey || "-"}`,
      `Plan: ${selectedPlan?.name || "-"}`,
      `Application: ${selectedApplicationName}`,
    ];

    return lines.join("\n");
  };

  const handleManualContact = (channel: "whatsapp" | "email") => {
    const message = buildActivationContactMessage();

    if (channel === "whatsapp" && SUPPORT_WHATSAPP) {
      window.open(
        `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Activation request")}&body=${encodeURIComponent(message)}`;
  };

  const handleCheckout = async () => {
    if (!selectedPlan) {
      setNotice("Select a plan before continuing to payment.");
      return;
    }

    if (!selectedPlan.backendId) {
      setNotice("This plan is not linked to backend pricing yet.");
      return;
    }

    if (!selectedApplicationId) {
      setNotice("Select an application before completing payment.");
      return;
    }

    if (!paymentConfig?.configured) {
      handleManualContact(SUPPORT_WHATSAPP ? "whatsapp" : "email");
      return;
    }

    setIsSubmittingCheckout(true);
    try {
      const response = await checkoutPublicPlan(selectedPlan.backendId, {
        mac: macAddress,
        deviceKey,
        applicationId: selectedApplicationId,
        duration: selectedPlan.duration || undefined,
      });

      if (response.mode === "redirect" && response.checkoutUrl) {
        // Real payment gateway — redirect to Stripe/external checkout
        window.location.href = response.checkoutUrl;
        return;
      }

      setActivationComplete(response);
    } catch (error: any) {
      setNotice(error?.message || "Unable to complete activation right now.");
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const displayPlans = plans.length > 0 ? plans : fallbackPlans;

  // Stripe is confirming payment on return from gateway
  if (isConfirmingCheckout) {
    return (
      <div className="pt-24 min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white text-lg font-semibold">
            Confirming your payment…
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Please wait, do not refresh.
          </p>
        </div>
      </div>
    );
  }

  // Activation completed (simulation or post Stripe confirmation)
  if (activationComplete) {
    return (
      <div className="pt-24 min-h-screen bg-black selection:bg-red-500/30 selection:text-red-200 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full mx-4 bg-white/5 border border-white/10 rounded-[32px] p-10 backdrop-blur-xl text-center"
        >
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={40} className="text-green-400" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">
            Activation Complete!
          </h2>
          <p className="text-gray-400 mb-2">
            Your device{" "}
            <span className="text-white font-mono font-bold">{macAddress}</span>{" "}
            is now active.
          </p>
          {activationComplete.mode === "simulation" && (
            <p className="text-xs text-yellow-500/80 mb-6">
              This activation was completed in temporary manual mode.
            </p>
          )}
          {activationComplete.mode !== "simulation" && (
            <p className="text-xs text-gray-500 mb-6">
              A confirmation receipt was sent to your email if provided.
            </p>
          )}
          <button
            onClick={() => navigate("/")}
            className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
          >
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="pt-24 min-h-screen bg-black selection:bg-red-500/30 selection:text-red-200">
        {notice && (
          <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[70] rounded-2xl border border-red-500/30 bg-black/90 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-red-600/10">
            {notice}
          </div>
        )}
        <section className="py-20 relative overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/10 blur-[120px] rounded-full" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12"
              >
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  Checkout <span className="text-red-600">Panel</span>
                </h1>
                <p className="text-gray-400 max-w-xl mx-auto">
                  Complete your activation for device{" "}
                  <span className="text-white font-mono font-bold">
                    {macAddress}
                  </span>
                </p>
              </motion.div>

              <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Plans Selection */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <Zap size={20} className="text-red-600" />
                      1. Select Your Plan
                    </h3>
                    {isLoadingCatalog && (
                      <p className="text-sm text-gray-400 mb-4">
                        Loading plans from backend...
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {displayPlans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan)}
                          className={`p-6 rounded-2xl border-2 transition-all text-left relative overflow-hidden group ${
                            selectedPlan?.id === plan.id
                              ? "bg-red-600/10 border-red-600 shadow-lg shadow-red-600/10"
                              : "bg-white/5 border-white/5 hover:border-white/20"
                          }`}
                        >
                          {plan.popular && (
                            <div className="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">
                              Popular
                            </div>
                          )}
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="font-bold text-white">
                              {plan.name}
                            </h4>
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                selectedPlan?.id === plan.id
                                  ? "border-red-600 bg-red-600"
                                  : "border-gray-600"
                              }`}
                            >
                              {selectedPlan?.id === plan.id && (
                                <Check size={12} className="text-white" />
                              )}
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">
                              {plan.price}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {plan.period}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <CreditCard size={20} className="text-red-600" />
                      {paymentConfig?.configured
                        ? "2. Payment Method"
                        : "2. Contact For Activation"}
                    </h3>
                    <div className="mb-6 space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                        Application
                      </label>
                      <select
                        value={selectedApplicationId}
                        onChange={(event) =>
                          setSelectedApplicationId(event.target.value)
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
                      >
                        {applications.length === 0 && (
                          <option value="" className="text-black">
                            No active applications available
                          </option>
                        )}
                        {applications.map((app) => (
                          <option
                            key={app.id}
                            value={app.id}
                            className="text-black"
                          >
                            {app.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {paymentConfig?.configured ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button
                            onClick={() => setPaymentMethod("card")}
                            className={`p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                              paymentMethod === "card"
                                ? "bg-red-600/10 border-red-600 shadow-lg shadow-red-600/10"
                                : "bg-white/5 border-white/5 hover:border-white/20"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                paymentMethod === "card"
                                  ? "border-red-600 bg-red-600"
                                  : "border-gray-600"
                              }`}
                            >
                              {paymentMethod === "card" && (
                                <Check size={12} className="text-white" />
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <CreditCard size={20} className="text-white" />
                              <span className="font-bold text-white">
                                Credit Card
                              </span>
                            </div>
                          </button>
                          <button
                            onClick={() => setPaymentMethod("paypal")}
                            className={`p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                              paymentMethod === "paypal"
                                ? "bg-red-600/10 border-red-600 shadow-lg shadow-red-600/10"
                                : "bg-white/5 border-white/5 hover:border-white/20"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                paymentMethod === "paypal"
                                  ? "border-red-600 bg-red-600"
                                  : "border-gray-600"
                              }`}
                            >
                              {paymentMethod === "paypal" && (
                                <Check size={12} className="text-white" />
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <img
                                src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_37x23.jpg"
                                alt="PayPal"
                                className="h-5 rounded"
                              />
                              <span className="font-bold text-white">
                                PayPal
                              </span>
                            </div>
                          </button>
                        </div>

                        {paymentMethod === "card" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-8 space-y-4"
                          >
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                Card Number
                              </label>
                              <div className="relative">
                                <CreditCard
                                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
                                  size={18}
                                />
                                <input
                                  type="text"
                                  placeholder="0000 0000 0000 0000"
                                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-5 py-3.5 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 transition-all font-mono"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                  Expiry Date
                                </label>
                                <input
                                  type="text"
                                  placeholder="MM/YY"
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 transition-all font-mono"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                  CVV
                                </label>
                                <input
                                  type="text"
                                  placeholder="•••"
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 transition-all font-mono"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-2 space-y-4"
                      >
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <p className="text-sm font-semibold text-white mb-2">
                            Online payment is not enabled yet.
                          </p>
                          <p className="text-sm text-gray-400 leading-relaxed">
                            Choose your plan and application, then contact us to
                            complete the activation manually.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {SUPPORT_WHATSAPP && (
                            <button
                              type="button"
                              onClick={() => handleManualContact("whatsapp")}
                              className="rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-300 transition-colors hover:bg-green-500/20 flex items-center justify-center gap-2"
                            >
                              <MessageCircle size={16} />
                              WhatsApp Us
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleManualContact("email")}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-white/20 flex items-center justify-center gap-2"
                          >
                            <Mail size={16} />
                            Email Support
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Order Summary */}
                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl sticky top-24">
                    <h3 className="text-xl font-bold text-white mb-8">
                      Order Summary
                    </h3>
                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Device MAC</span>
                        <span className="text-white font-mono">
                          {macAddress}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Plan</span>
                        <span className="text-white font-bold">
                          {selectedPlan ? selectedPlan.name : "Not selected"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Application</span>
                        <span className="text-white font-bold">
                          {applications.find(
                            (app) => String(app.id) === selectedApplicationId,
                          )?.name || "Not selected"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Status</span>
                        <span className="text-red-500 font-bold">
                          Pending Activation
                        </span>
                      </div>
                      <div className="pt-4 border-t border-white/10 flex justify-between items-baseline">
                        <span className="text-white font-bold">Total</span>
                        <span className="text-3xl font-black text-white">
                          {selectedPlan ? selectedPlan.price : "€0.00"}
                        </span>
                      </div>
                    </div>

                    {!paymentConfig?.configured && (
                      <p className="mb-4 text-sm text-gray-400 leading-relaxed">
                        Payments are not live yet. We will prepare your
                        activation request with the selected plan and
                        application details.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={
                        !selectedPlan ||
                        !selectedPlan.backendId ||
                        !selectedApplicationId ||
                        isSubmittingCheckout
                      }
                      className={`w-full py-4 rounded-2xl font-bold text-lg transition-all transform active:scale-95 shadow-lg ${
                        selectedPlan &&
                        selectedPlan.backendId &&
                        selectedApplicationId &&
                        !isSubmittingCheckout
                          ? "bg-red-600 hover:bg-red-700 text-white shadow-red-600/20"
                          : "bg-white/10 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      {isSubmittingCheckout
                        ? "Processing..."
                        : paymentConfig?.configured
                          ? "Complete Payment"
                          : SUPPORT_WHATSAPP
                            ? "Contact Us On WhatsApp"
                            : "Contact Support"}
                    </button>

                    <button
                      onClick={() => {
                        setIsLoggedIn(false);
                        setIsCaptchaChecked(false);
                      }}
                      className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Back to Login
                    </button>

                    {paymentConfig?.configured && (
                      <div className="mt-8 flex items-center justify-center gap-4 opacity-30 grayscale">
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
                          alt="Visa"
                          className="h-3"
                        />
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                          alt="Mastercard"
                          className="h-5"
                        />
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg"
                          alt="PayPal"
                          className="h-4"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-24 min-h-screen bg-black selection:bg-red-500/30 selection:text-red-200">
      {notice && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[70] rounded-2xl border border-red-500/30 bg-black/90 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-red-600/10">
          {notice}
        </div>
      )}
      {/* Login Section */}
      <section className="py-20 relative overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-600/5 blur-[120px] rounded-full" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                {t("Device")}{" "}
                <span className="text-red-600">{t("Activation")}</span>
              </h1>
              <p className="text-gray-400 max-w-xl mx-auto">
                {t(
                  "Manage your device, check expiration date and upload your playlists.",
                )}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              id="device-login"
              className="w-full max-w-md p-8 md:p-10 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl relative"
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/40">
                <Lock className="text-white" size={24} />
              </div>

              <form onSubmit={handleLogin} className="space-y-6 mt-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                    {t("MAC Address")}
                  </label>
                  <input
                    type="text"
                    value={macAddress}
                    onChange={handleMacChange}
                    placeholder="00:1A:2B:3C:4D:5E"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all font-mono"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                      {t("Device Key")}
                    </label>
                    <button
                      type="button"
                      onClick={() => navigate("/help")}
                      className="text-[10px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-wider"
                    >
                      {t("Forgot Key?")}
                    </button>
                  </div>
                  <input
                    type="password"
                    value={deviceKey}
                    onChange={(e) => setDeviceKey(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all font-mono"
                    required
                  />
                </div>

                {/* High-Fidelity Simulated reCAPTCHA (Works in Preview) */}
                <div
                  onClick={() => setIsCaptchaChecked(!isCaptchaChecked)}
                  className="flex justify-center py-2 select-none"
                >
                  <div className="w-[302px] h-[76px] bg-[#222] border border-[#333] rounded-[3px] flex items-center px-3 gap-3 cursor-pointer hover:bg-[#252525] transition-colors">
                    <div
                      className={`w-6 h-6 border-2 rounded-[2px] flex items-center justify-center transition-all ${
                        isCaptchaChecked
                          ? "border-[#009688] bg-[#009688]"
                          : "border-[#555] bg-[#333]"
                      }`}
                    >
                      {isCaptchaChecked && (
                        <Check
                          size={16}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </div>
                    <span className="text-[14px] text-white font-sans flex-1">
                      {t("I'm not a robot")}
                    </span>
                    <div className="flex flex-col items-center gap-1">
                      <img
                        src="https://www.gstatic.com/recaptcha/api2/logo_48.png"
                        alt="reCAPTCHA"
                        className="w-8 h-8"
                      />
                      <div className="flex flex-col items-center -space-y-1">
                        <span className="text-[8px] text-[#999] font-sans">
                          reCAPTCHA
                        </span>
                        <div className="flex gap-1 text-[7px] text-[#999] font-sans">
                          <Link to="/legal/privacy" className="hover:underline">
                            Privacy
                          </Link>
                          <span>-</span>
                          <Link to="/legal/terms" className="hover:underline">
                            Terms
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {!isCaptchaChecked && (
                  <p className="text-[10px] text-gray-600 text-center mt-1">
                    Note: Real reCAPTCHA requires allowlisting the preview
                    domain in your Google Console.
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] shadow-lg shadow-red-600/20 group"
                  >
                    {t("Login to Device")}
                    <ArrowRight
                      size={18}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>

                <p className="text-center text-[11px] text-gray-500 leading-relaxed">
                  By logging in, you agree to our{" "}
                  <Link
                    to="/legal/terms"
                    className="text-red-500 hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/legal/privacy"
                    className="text-red-500 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-12 flex flex-wrap justify-center gap-8 text-gray-500"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-red-600" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  SSL Secure
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-red-600" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Instant Access
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-red-600" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Multi-Device
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-[#050505] relative overflow-hidden border-t border-white/5">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold text-white mb-4"
            >
              Premium <span className="text-red-600">Activation</span>
            </motion.h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Unlock the full potential of NOVA PLAYER with our premium plans.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {displayPlans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-8 rounded-[32px] border transition-all hover:scale-[1.02] ${
                  plan.popular
                    ? "bg-red-600/10 border-red-500 shadow-2xl shadow-red-500/10"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star size={12} className="fill-current" />
                    Best Value
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-gray-400 text-sm">{plan.description}</p>
                </div>

                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-500 text-sm font-medium">
                    {plan.period}
                  </span>
                </div>

                <ul className="space-y-4 mb-10">
                  {plan.features.map((feature, fIndex) => (
                    <li
                      key={fIndex}
                      className="flex items-center gap-3 text-gray-300 text-sm"
                    >
                      <div className="w-5 h-5 rounded-full bg-red-600/20 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-red-500" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handlePlanShortcut(plan)}
                  className={`w-full py-4 rounded-2xl text-lg font-bold transition-all transform active:scale-95 ${
                    plan.popular
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
                >
                  {plan.buttonText}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-24 bg-black border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600/10 mb-8">
            <Info className="text-red-600" size={32} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-6">
            {t("Important Information")}
          </h2>
          <div className="space-y-6 text-gray-400 text-sm leading-relaxed text-left">
            <p>
              • NOVA PLAYER application does not include any channels, you must
              upload your own playlists.
            </p>
            <p>
              • The application is free to try for 7 days. After the trial
              period, you must activate your device to continue using it.
            </p>
            <p>
              • Activation is tied to your device's MAC address. If you change
              your device, you will need a new activation.
            </p>
            <p>
              • We do not provide any content or playlists. We are a media
              player developer.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
