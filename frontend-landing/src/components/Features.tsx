import { motion } from "motion/react";
import {
  Zap,
  Shield,
  Monitor,
  Smartphone,
  Tv,
  Layout,
  Settings,
  Heart,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

const features = [
  {
    icon: <Zap className="text-red-500" size={32} />,
    title: "High Performance",
    description:
      "Optimized for speed and smooth playback even on low-end devices.",
  },
  {
    icon: <Shield className="text-red-500" size={32} />,
    title: "Secure & Private",
    description:
      "Your data and playlists are encrypted and never shared with third parties.",
  },
  {
    icon: <Layout className="text-red-500" size={32} />,
    title: "User Friendly",
    description:
      "Intuitive interface designed for the best user experience on all screens.",
  },
  {
    icon: <Monitor className="text-red-500" size={32} />,
    title: "Multi-Device",
    description:
      "Available on Android, iOS, Smart TVs, Firestick, and Web Browsers.",
  },
  {
    icon: <Settings className="text-red-500" size={32} />,
    title: "Advanced Settings",
    description:
      "Customize your player with parental control, EPG, and subtitles support.",
  },
  {
    icon: <Heart className="text-red-500" size={32} />,
    title: "Favorites List",
    description:
      "Save your favorite channels and movies for quick and easy access.",
  },
];

export default function Features() {
  const { t } = useI18n();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1 },
  };

  return (
    <section
      id="features"
      className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 md:mb-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6"
          >
            {t("Core Advantages")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5 leading-tight"
          >
            {t("Engineered for")}{" "}
            <span className="text-red-600">{t("Pure Performance.")}</span>
          </motion.h2>
          <p className="text-gray-300/90 max-w-2xl mx-auto text-lg">
            {t(
              "Discover why NOVA PLAYER is the preferred choice for millions of users worldwide.",
            )}
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="p-6 sm:p-8 rounded-3xl glass-surface hover:border-rose-400/45 hover:-translate-y-1 transition-all group"
            >
              <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 w-fit group-hover:scale-105 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3 tracking-tight">
                {t(feature.title)}
              </h3>
              <p className="text-gray-300/85 leading-relaxed">
                {t(feature.description)}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
