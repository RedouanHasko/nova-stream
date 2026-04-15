import { motion } from "motion/react";
import {
  Smartphone,
  Subtitles,
  Film,
  Tablet,
  Wifi,
  Star,
  Play,
  Settings2,
  Globe,
  MonitorPlay,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/* ─── tiny internal UI mock: phone screen ─────────────────────────── */
function PhoneScreen() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-[120px] sm:w-[140px] h-[220px] sm:h-[260px] rounded-[26px] border-2 border-white/15 bg-black/60 overflow-hidden shadow-2xl">
      {/* notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-4 bg-black rounded-b-xl z-10" />
      {/* screen gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0000] via-[#0d0d1a] to-[#000a1a]" />
      {/* nav row */}
      <div className="relative z-10 flex justify-between items-center px-3 pt-6 pb-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-600" />
          <span className="text-[8px] font-black text-white leading-none">
            NOVA
          </span>
        </div>
        <Wifi className="w-2.5 h-2.5 text-gray-400" />
      </div>
      {/* hero featured content */}
      <div className="relative z-10 px-3 py-2">
        <div className="w-full h-[80px] sm:h-[100px] rounded-xl bg-gradient-to-br from-red-900/60 to-black/80 border border-white/10 flex items-end p-2 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Play className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="text-[7px] text-red-400 font-semibold uppercase tracking-widest">
              {t("Live")}
            </div>
            <div className="text-[9px] text-white font-bold leading-tight">
              {t("Premium Content")}
            </div>
          </div>
        </div>
        {/* channel list */}
        <div className="mt-2 space-y-1.5">
          {["Action", "Movies", "Sports"].map((label, i) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg ${i === 0 ? "bg-red-600/30 border border-red-500/30" : "bg-white/5"}`}
            >
              <div
                className={`w-2 h-2 rounded-full ${i === 0 ? "bg-red-500" : "bg-gray-600"}`}
              />
              <span className="text-[8px] text-gray-300 font-medium">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* bottom home bar */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/30" />
    </div>
  );
}

/* ─── tiny internal UI mock: subtitle settings ────────────────────── */
function SubtitleScreen() {
  const { t } = useI18n();
  return (
    <div className="w-full rounded-xl bg-black/50 border border-white/10 overflow-hidden p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
          {t("Subtitle Settings")}
        </span>
        <Settings2 className="w-3 h-3 text-gray-500" />
      </div>
      {/* size slider */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-[9px] text-gray-500">Size</span>
          <span className="text-[9px] text-red-400 font-semibold">90px</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full">
          <div className="h-full w-3/5 bg-gradient-to-r from-red-600 to-red-400 rounded-full" />
        </div>
      </div>
      {/* background color */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-gray-500">Background</span>
        <div className="flex gap-1">
          {["bg-black", "bg-white/20", "bg-red-600/60", "bg-blue-600/60"].map(
            (c, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded ${c} border ${i === 0 ? "border-red-500 scale-110" : "border-white/10"}`}
              />
            ),
          )}
        </div>
      </div>
      {/* preview */}
      <div className="mt-1 px-2 py-1 bg-black/80 rounded-lg text-center">
        <span className="text-[9px] text-white font-medium">
          This is how subtitles will look
        </span>
      </div>
      {/* language badges */}
      <div className="flex flex-wrap gap-1 pt-1">
        {["EN", "FR", "AR", "ES", "+17"].map((lang) => (
          <span
            key={lang}
            className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 font-mono"
          >
            {lang}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── tiny internal UI mock: movie detail card ────────────────────── */
function MovieCard() {
  const { t } = useI18n();
  return (
    <div className="w-full rounded-xl bg-black/50 border border-white/10 overflow-hidden p-3">
      <div className="w-full h-[70px] sm:h-[80px] rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-end p-2 mb-2 overflow-hidden relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <MonitorPlay className="w-10 h-10 text-white" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-1 mb-0.5">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[8px] text-yellow-300 font-bold">8.4</span>
            <span className="text-[7px] text-gray-500 ml-1">· 2h 14m</span>
          </div>
          <div className="text-[10px] text-white font-bold leading-tight">
            {t("Premium Content")}
          </div>
        </div>
      </div>
      <div className="text-[8px] text-gray-400 leading-relaxed line-clamp-2 mb-2">
        Stream your favorite movies and series in 4K with Dolby surround sound
        support.
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white">
          <Play className="w-2.5 h-2.5 fill-white" />
          <span className="text-[8px] font-semibold">{t("Watch Now")}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white">
          <span className="text-[8px] text-gray-300">Trailer</span>
        </div>
        <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
          4K
        </span>
      </div>
    </div>
  );
}

/* ─── tiny internal UI mock: tablet/remote ────────────────────────── */
function TabletScreen() {
  const { t } = useI18n();
  const menuItems = [
    { icon: <Play className="w-3 h-3" />, label: t("Live TV"), active: true },
    { icon: <Film className="w-3 h-3" />, label: t("Movies"), active: false },
    {
      icon: <MonitorPlay className="w-3 h-3" />,
      label: t("Series"),
      active: false,
    },
    {
      icon: <Globe className="w-3 h-3" />,
      label: t("Replay"),
      active: false,
    },
  ];
  return (
    <div className="relative mx-auto w-[130px] sm:w-[155px] h-[180px] sm:h-[210px] rounded-[18px] border-2 border-white/15 bg-black/70 overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0000] via-[#0d0d20] to-black" />
      {/* top bar */}
      <div className="relative z-10 flex justify-between items-center px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-600" />
          <span className="text-[7px] font-black text-white">NOVA</span>
        </div>
        <div className="text-[7px] text-gray-500">12:34</div>
      </div>
      {/* icon grid */}
      <div className="relative z-10 p-2 grid grid-cols-2 gap-1.5">
        {menuItems.map((item) => (
          <div
            key={item.label}
            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border ${
              item.active
                ? "bg-red-600/30 border-red-500/50 text-red-300"
                : "bg-white/5 border-white/10 text-gray-400"
            }`}
          >
            {item.icon}
            <span className="text-[7px] font-semibold">{item.label}</span>
          </div>
        ))}
      </div>
      {/* bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-1.5 border-t border-white/5 flex justify-between">
        {["Theme", "Server", "Settings"].map((btn) => (
          <div
            key={btn}
            className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10"
          >
            <span className="text-[6.5px] text-gray-500">{btn}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── shared card class ───────────────────────────────────────────── */
const CARD =
  "glass-surface rounded-3xl border border-white/10 hover:border-rose-400/40 transition-colors duration-300 p-5 sm:p-6 flex flex-col";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
// amount:0.35 = card must be 35% visible before triggering.
// margin "-15% 0px" shrinks the active trigger zone away from the very edges
// so the animation fires when the card is clearly in the center of the screen.
const VP = { once: false, amount: 0.35, margin: "-10% 0px -10% 0px" } as const;

/* ─── Main component ───────────────────────────────────────────────── */
export default function StreamingShowcase() {
  const { t } = useI18n();

  return (
    <section className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden">
      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-red-900/10 blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── header ── */}
        <div className="text-center mb-14">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6"
          >
            {t("Every Screen")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.05 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5 leading-tight"
          >
            {t("Seamless Streaming")}{" "}
            <span className="text-red-600">{t("Across Every Screen")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.1 }}
            className="text-gray-300/85 max-w-2xl mx-auto text-lg"
          >
            {t(
              "From your TV to your tablet or smartphone, our platform ensures a consistent and immersive viewing experience.",
            )}
          </motion.p>
        </div>

        {/* ── bento grid ──
            Mobile  : 1 col, stacked
            md      : 2×2 equal grid
            lg      : 3 cols, side cards span 2 rows
                      col 1 rows 1-2  │  col 2 row 1  │  col 3 rows 1-2
                                      │  col 2 row 2  │
        ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 gap-4 md:gap-5">
          {/* ── LEFT card — slides from left ── */}
          <motion.div
            initial={{ x: -140, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={VP}
            transition={{ duration: 0.85, ease: EASE }}
            className={`${CARD} min-h-[300px] lg:min-h-0 lg:row-span-2`}
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-300 border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 rounded-full mb-3 self-start">
              <Smartphone className="w-3 h-3" />
              {t("Mobile Ready")}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1 leading-tight">
              {t("Watch On The Go")}
            </h3>
            <div className="flex-1 flex items-center justify-center py-4">
              <PhoneScreen />
            </div>
            <p className="text-sm text-gray-400/90 leading-relaxed">
              {t("Stream live TV, movies and series anywhere on your phone.")}
            </p>
          </motion.div>

          {/* ── TOP CENTER card — slides from top ── */}
          <motion.div
            initial={{ y: -140, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={VP}
            transition={{ duration: 0.85, ease: EASE, delay: 0.08 }}
            className={`${CARD} min-h-[260px] lg:min-h-0 lg:col-start-2 lg:row-start-1`}
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-300 border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 rounded-full mb-3 self-start">
              <Subtitles className="w-3 h-3" />
              20+ Languages
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1 leading-tight">
              {t("Subtitle Support")}
            </h3>
            <div className="flex-1 flex items-center justify-center py-3">
              <SubtitleScreen />
            </div>
            <p className="text-sm text-gray-400/90 leading-relaxed">
              {t(
                "Customize subtitles in size, color and background to suit your preference.",
              )}
            </p>
          </motion.div>

          {/* ── BOTTOM CENTER card — slides from bottom ── */}
          <motion.div
            initial={{ y: 140, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={VP}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
            className={`${CARD} min-h-[260px] lg:min-h-0 lg:col-start-2 lg:row-start-2`}
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-300 border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 rounded-full mb-3 self-start">
              <Film className="w-3 h-3" />
              HD &amp; 4K
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1 leading-tight">
              {t("Rich Content Library")}
            </h3>
            <div className="flex-1 flex items-center justify-center py-3">
              <MovieCard />
            </div>
            <p className="text-sm text-gray-400/90 leading-relaxed">
              {t(
                "Browse thousands of movies and series in stunning 4K quality.",
              )}
            </p>
          </motion.div>

          {/* ── RIGHT card — slides from right ── */}
          <motion.div
            initial={{ x: 140, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={VP}
            transition={{ duration: 0.7, ease: EASE }}
            className={`${CARD} min-h-[300px] lg:min-h-0 lg:col-start-3 lg:row-start-1 lg:row-span-2`}
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-300 border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 rounded-full mb-3 self-start">
              <Tablet className="w-3 h-3" />
              {t("Multi-Device")}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1 leading-tight">
              {t("Smart Navigation")}
            </h3>
            <div className="flex-1 flex items-center justify-center py-4">
              <TabletScreen />
            </div>
            <p className="text-sm text-gray-400/90 leading-relaxed">
              {t(
                "Intuitive tablet and TV remote interface for effortless control.",
              )}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
