import { motion } from "motion/react";
import { useI18n } from "../contexts/I18nContext";

export default function ParentalControl() {
  const { t } = useI18n();

  return (
    <section
      id="parental-control"
      className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-red-600/10 blur-[180px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6">
              {t("Family Safety")}
            </p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-8 tracking-tight">
              {t("Guardians of Content:")} <br />
              {t("Unveiling Media Player's")} <br />
              <span className="text-red-600">{t("Parental Power")}</span>
            </h2>
            <p className="text-gray-300/90 text-lg md:text-xl leading-relaxed font-medium">
              {t(
                "Take full control of what your family watches. Our advanced parental control features allow you to lock specific channels, categories, or content types with a secure PIN, ensuring a safe and age-appropriate viewing experience for your children.",
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full px-4 py-2 text-sm text-white/90 border border-white/15 bg-white/5">
                {t("PIN Lock")}
              </span>
              <span className="rounded-full px-4 py-2 text-sm text-white/90 border border-white/15 bg-white/5">
                {t("Category Filters")}
              </span>
              <span className="rounded-full px-4 py-2 text-sm text-white/90 border border-white/15 bg-white/5">
                {t("Instant Restriction")}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative pb-10 lg:pb-0"
          >
            <div className="rounded-[34px] overflow-hidden shadow-2xl shadow-red-500/25 border border-white/15 glass-surface p-2">
              <img
                src="https://images.unsplash.com/photo-1593784991095-a205069470b6?q=80&w=2070&auto=format&fit=crop"
                alt="Family Entertainment"
                className="w-full h-auto object-cover opacity-85 rounded-[28px]"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Floating Badge */}
            <div className="absolute -bottom-4 sm:-bottom-6 -left-2 sm:-left-6 bg-gradient-to-br from-rose-500 to-red-700 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl shadow-rose-900/45">
              <p className="text-xl sm:text-2xl font-bold">100% Safe</p>
              <p className="text-xs sm:text-sm opacity-80">
                {t("Family Protection")}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
