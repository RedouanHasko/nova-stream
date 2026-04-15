import { motion, AnimatePresence, useScroll, useSpring } from "motion/react";
import { Menu, X, Sparkles, Users, Languages } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n, type SupportedLanguage } from "../contexts/I18nContext";

const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; labelKey: string }> = [
  { code: "EN", labelKey: "English" },
  { code: "FR", labelKey: "French" },
  { code: "AR", labelKey: "Arabic" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const { t, language, setLanguage } = useI18n();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    restDelta: 0.001,
  });

  const navLinks = [
    { name: t("HOME"), href: "/" },
    { name: t("DOWNLOADS"), href: "/downloads" },
    { name: t("ACTIVATE DEVICE"), href: "/device/activate" },
    { name: t("MANAGE PLAYLISTS"), href: "/device/playlists" },
    { name: t("HOW TO TUTORIALS"), href: "/help" },
    { name: t("SUPPORT"), href: "/#contact" },
    { name: t("CONTACT"), href: "/#contact" },
    { name: t("I'M RESELLER"), href: "/reseller", isSpecial: true },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/65 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-24">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <Sparkles className="text-white fill-current" size={24} />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center animate-pulse">
                <div className="w-2 h-2 bg-red-600 rounded-full" />
              </div>
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-2xl font-black text-white tracking-tighter italic">
                NOVA
              </span>
              <span className="text-[10px] font-black text-red-600 tracking-[0.3em] uppercase ml-0.5">
                PLAYER
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:block">
            <div className="flex items-center space-x-4 xl:space-x-6">
              {navLinks.map((link, index) => (
                <div
                  key={link.name}
                  className="relative px-1 py-2"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {link.isSpecial ? (
                    <motion.a
                      href={link.href}
                      animate={{
                        boxShadow: [
                          "0 0 0 0px rgba(220, 38, 38, 0)",
                          "0 0 0 8px rgba(220, 38, 38, 0.1)",
                          "0 0 0 0px rgba(220, 38, 38, 0)",
                        ],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="relative z-10 flex items-center gap-2 px-3 xl:px-5 py-2.5 bg-gradient-to-br from-red-500 via-red-600 to-red-700 text-white text-[10px] xl:text-[11px] font-black rounded-xl shadow-xl shadow-red-600/20 hover:shadow-red-600/40 hover:scale-105 transition-all tracking-[0.1em] xl:tracking-[0.2em] border border-white/20 group/reseller overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 -translate-x-full group-hover/reseller:translate-x-full transition-transform duration-1000 ease-in-out" />
                      <Users
                        size={14}
                        className="group-hover/reseller:rotate-[20deg] transition-transform duration-300"
                      />
                      {link.name}
                    </motion.a>
                  ) : (
                    <>
                      {link.href.startsWith("/") && !link.href.includes("#") ? (
                        <Link
                          to={link.href}
                          className="relative z-10 text-white hover:text-red-500 text-[12px] xl:text-[13px] font-bold transition-colors tracking-wide whitespace-nowrap"
                        >
                          {link.name}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="relative z-10 text-white hover:text-red-500 text-[12px] xl:text-[13px] font-bold transition-colors tracking-wide whitespace-nowrap"
                        >
                          {link.name}
                        </a>
                      )}
                      {hoveredIndex === index && (
                        <motion.div
                          layoutId="nav-hover"
                          className="absolute inset-0 bg-white/5 rounded-lg -z-0"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        />
                      )}
                      {hoveredIndex === index && (
                        <motion.div
                          layoutId="nav-underline"
                          className="absolute bottom-0 left-1 right-1 h-0.5 bg-red-600 rounded-full z-20"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1 rounded-xl border border-white/20 bg-white/5 p-1">
            <AnimatePresence>
              {langOpen && (
                <motion.div
                  key="lang-options"
                  initial={{ maxWidth: 0, opacity: 0 }}
                  animate={{ maxWidth: 160, opacity: 1 }}
                  exit={{ maxWidth: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="overflow-hidden flex items-center gap-1"
                >
                  {LANGUAGE_OPTIONS.map((option) => {
                    const isActive = language === option.code;
                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => {
                          setLanguage(option.code);
                          setLangOpen(false);
                        }}
                        title={`${t("Language")}: ${t(option.labelKey)}`}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          isActive
                            ? "bg-white text-black"
                            : "text-white hover:bg-white/10"
                        }`}
                      >
                        {option.code}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              title={t("Language")}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                langOpen
                  ? "text-white bg-white/10"
                  : "text-gray-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Languages className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white hover:text-red-500 p-2"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-black border-b border-white/10 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-1">
              <div className="px-3 py-2 mb-2">
                <label
                  htmlFor="landing-language-mobile"
                  className="block text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2"
                >
                  {t("Language")}
                </label>
                <select
                  id="landing-language-mobile"
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as SupportedLanguage)
                  }
                  className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-red-500"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option
                      key={option.code}
                      value={option.code}
                      className="text-black"
                    >
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              {navLinks.map((link) =>
                link.isSpecial ? (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    animate={{
                      boxShadow: [
                        "0 0 0 0px rgba(220, 38, 38, 0)",
                        "0 0 0 8px rgba(220, 38, 38, 0.1)",
                        "0 0 0 0px rgba(220, 38, 38, 0)",
                      ],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="flex items-center justify-center gap-3 px-4 py-5 bg-gradient-to-br from-red-500 to-red-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-red-600/20 tracking-[0.2em] mt-6 border border-white/10"
                    onClick={() => setIsOpen(false)}
                  >
                    <Users size={18} />
                    {link.name}
                  </motion.a>
                ) : link.href.startsWith("/") && !link.href.includes("#") ? (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="text-white hover:text-red-500 block px-3 py-4 text-sm font-bold border-b border-white/5"
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-white hover:text-red-500 block px-3 py-4 text-sm font-bold border-b border-white/5"
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                  </a>
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{ scaleX: progressX, transformOrigin: "0% 50%" }}
        className="h-[2px] w-full bg-gradient-to-r from-rose-500 via-red-500 to-orange-400"
      />
    </nav>
  );
}
