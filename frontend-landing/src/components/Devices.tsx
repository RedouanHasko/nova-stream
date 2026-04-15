import { motion } from "motion/react";
import { Smartphone, Tv, Monitor, Laptop, Tablet, Box } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import sonyLogo from "../assets/img/sony-logo-png.png";
import androidTvLogo from "../assets/img/Android_tv_logo.svg";
import windowsLogo from "../assets/img/Windows_log.png";
import rokuLogo from "../assets/img/Roku_logo.png";
import appleTvLogo from "../assets/img/Apple_TV.png";
import samsungLogo from "../assets/img/Samsung_logo.svg";
import lgLogo from "../assets/img/LG-webOS-Logo.png";

const devices = [
  {
    icon: <Tv size={48} className="text-red-500" />,
    name: "Smart TV",
    description: "Samsung, LG, Sony, Android TV",
  },
  {
    icon: <Smartphone size={48} className="text-red-500" />,
    name: "Android & iOS",
    description: "Phones and Tablets",
  },
  {
    icon: <Box size={48} className="text-red-500" />,
    name: "Firestick",
    description: "Amazon Fire TV Stick",
  },
  {
    icon: <Monitor size={48} className="text-red-500" />,
    name: "Windows & Mac",
    description: "Desktop Applications",
  },
  {
    icon: <Laptop size={48} className="text-red-500" />,
    name: "Web Player",
    description: "All Modern Browsers",
  },
  {
    icon: <Tablet size={48} className="text-red-500" />,
    name: "Apple TV",
    description: "tvOS Support",
  },
];

const compatibleBrands = [
  { src: sonyLogo, alt: "Sony", widthClass: "w-[100px] md:w-[210px]" },
  {
    src: androidTvLogo,
    alt: "Android TV",
    widthClass: "w-[120px] md:w-[240px]",
  },
  { src: windowsLogo, alt: "Windows", widthClass: "w-[100px] md:w-[220px]" },
  { src: rokuLogo, alt: "Roku", widthClass: "w-[70px] md:w-[150px]" },
  { src: appleTvLogo, alt: "Apple TV", widthClass: "w-[80px] md:w-[160px]" },
  {
    src: samsungLogo,
    alt: "Samsung",
    widthClass: "w-[140px] md:w-[280px]",
  },
  { src: lgLogo, alt: "LG webOS", widthClass: "w-[80px] md:w-[160px]" },
];

export default function Devices() {
  const { t } = useI18n();

  return (
    <section
      id="devices"
      className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 md:mb-20">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6"
          >
            {t("Device Ecosystem")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5 tracking-tight"
          >
            {t("Seamlessly Connected.")} <br />
            <span className="text-red-600">{t("Everywhere.")}</span>
          </motion.h2>
          <p className="text-gray-300/90 max-w-2xl mx-auto text-lg">
            {t(
              "NOVA Player is optimized for all your favorite platforms. One account, unlimited possibilities.",
            )}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="mb-16"
        >
          <p className="text-center text-sm md:text-[18px] text-white/95 mb-8">
            {t("Watch NOVA Player with these compatible streaming devices")}
          </p>

          <div className="relative overflow-hidden py-4 md:py-6">
            <div className="absolute left-0 top-0 h-full w-12 md:w-24 bg-gradient-to-r from-black via-black/90 to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 h-full w-12 md:w-24 bg-gradient-to-l from-black via-black/90 to-transparent z-10 pointer-events-none" />

            <motion.div
              aria-label="Compatible streaming device companies"
              className="flex items-center gap-8 md:gap-20 [transform:rotate(-2.4deg)] will-change-transform"
              animate={{ x: ["0%", "-50%"] }}
              transition={{
                duration: 26,
                ease: "linear",
                repeat: Infinity,
              }}
            >
              {[...compatibleBrands, ...compatibleBrands].map(
                (brand, index) => (
                  <div
                    key={`${brand.alt}-${index}`}
                    className="shrink-0 h-8 md:h-14 flex items-center justify-center"
                  >
                    <img
                      src={brand.src}
                      alt={`${brand.alt} logo`}
                      className={`${brand.widthClass} h-auto max-h-full object-contain opacity-90`}
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                ),
              )}
            </motion.div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 lg:gap-8">
          {devices.map((device, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col items-center text-center p-4 sm:p-6 rounded-3xl glass-surface hover:bg-white/10 transition-all group"
            >
              <div className="mb-3 sm:mb-6 group-hover:scale-110 transition-transform">
                {device.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {t(device.name)}
              </h3>
              <p className="text-gray-500 text-sm leading-tight">
                {t(device.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
