import { motion } from "motion/react";
import { Check, Star, Zap, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

const plans = [
  {
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

export default function Pricing() {
  const { t } = useI18n();

  return (
    <section
      id="pricing"
      className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[65%] h-[65%] bg-red-600/12 blur-[170px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 md:mb-20">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6"
          >
            {t("Pricing Plans")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5"
          >
            {t("Premium Access.")} <br />
            <span className="text-red-600">{t("Unbeatable Value.")}</span>
          </motion.h2>
          <p className="text-gray-300/90 max-w-2xl mx-auto text-lg">
            {t(
              "Choose the perfect plan to unlock the full potential of your media experience.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto items-stretch">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`relative p-6 sm:p-8 rounded-3xl border transition-all hover:scale-[1.01] ${
                plan.popular
                  ? "bg-rose-600/12 border-rose-400/70 shadow-2xl shadow-rose-500/25"
                  : "glass-surface border-white/15"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-4 py-1 rounded-full text-sm font-bold flex items-center gap-1 shadow-lg shadow-rose-500/35">
                  <Star size={14} className="fill-current" />
                  {t("Most Popular")}
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">
                  {t(plan.name)}
                </h3>
                <p className="text-gray-300/85">{t(plan.description)}</p>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">
                  {plan.price}
                </span>
                <span className="text-gray-300/80 ml-2">{t(plan.period)}</span>
              </div>

              <ul className="space-y-4 mb-10">
                {plan.features.map((feature, fIndex) => (
                  <li
                    key={fIndex}
                    className="flex items-center gap-3 text-gray-200/90"
                  >
                    <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-300/30 flex items-center justify-center">
                      <Check size={12} className="text-rose-400" />
                    </div>
                    {t(feature)}
                  </li>
                ))}
              </ul>

              <Link
                to={`/device/activate?plan=${plan.popular ? "lifetime" : "yearly"}`}
                className={`block w-full py-4 rounded-2xl text-lg font-bold transition-all transform active:scale-95 text-center ${
                  plan.popular
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30"
                    : "bg-white/10 hover:bg-white/20 text-white border border-white/15"
                }`}
              >
                {t(plan.buttonText)}
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex flex-col md:flex-row items-center gap-6 p-6 rounded-2xl glass-surface">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-gray-300/85">
                <ShieldCheck size={20} className="text-rose-400" />
                <span>{t("Secure Payment")}</span>
              </div>
              <div className="hidden md:block w-px h-8 bg-white/10" />
              <div className="flex items-center gap-2 text-gray-300/85">
                <Zap size={20} className="text-rose-400" />
                <span>{t("Instant Activation")}</span>
              </div>
            </div>
            <div className="hidden md:block w-px h-8 bg-white/10" />
            <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-6 px-4 sm:px-6 py-3 rounded-xl bg-white/10 border border-white/5">
              <img
                src="https://img.icons8.com/color/48/visa.png"
                alt="Visa"
                className="h-6 sm:h-8 w-auto"
                referrerPolicy="no-referrer"
              />
              <img
                src="https://img.icons8.com/color/48/mastercard.png"
                alt="Mastercard"
                className="h-8 sm:h-10 w-auto"
                referrerPolicy="no-referrer"
              />
              <img
                src="https://img.icons8.com/color/48/paypal.png"
                alt="PayPal"
                className="h-6 sm:h-8 w-auto"
                referrerPolicy="no-referrer"
              />
              <img
                src="https://img.icons8.com/color/48/apple-pay.png"
                alt="Apple Pay"
                className="h-8 sm:h-10 w-auto"
                referrerPolicy="no-referrer"
              />
              <img
                src="https://img.icons8.com/color/48/google-pay.png"
                alt="Google Pay"
                className="h-8 sm:h-10 w-auto"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
