import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { useI18n } from "../contexts/I18nContext";

/* -------------------------------------------------------------------------- */
/*  Streaming UI shown inside the TV screen                                   */
/* -------------------------------------------------------------------------- */
function StreamingScreen() {
  const { t } = useI18n();
  const channels = [
    { color: "from-red-900 to-red-700", label: "Action" },
    { color: "from-blue-900 to-indigo-800", label: "Movies" },
    { color: "from-purple-900 to-purple-700", label: "Series" },
    { color: "from-green-900 to-emerald-800", label: "Sports" },
    { color: "from-yellow-900 to-orange-700", label: "Kids" },
    { color: "from-pink-900 to-pink-700", label: "News" },
  ];

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex flex-col overflow-hidden select-none">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/70 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-600" />
          <span className="text-white text-xs font-bold tracking-widest uppercase">
            Nova<span className="text-red-500">Player</span>
          </span>
        </div>
        <div className="flex gap-5 text-[10px] text-gray-400 font-medium">
          <span className="text-white">{t("Home")}</span>
          <span>{t("Live TV")}</span>
          <span>{t("Movies")}</span>
          <span>{t("Series")}</span>
          <span>{t("Settings")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">U</span>
          </div>
        </div>
      </div>

      {/* Featured hero banner */}
      <div className="relative flex-1 bg-gradient-to-br from-[#1a0000] via-[#0d0d1a] to-[#000a1a] overflow-hidden">
        {/* Background glow orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-4 left-1/4 w-48 h-32 bg-red-900/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-40 h-28 bg-blue-900/20 rounded-full blur-3xl" />
        </div>

        {/* "Now Playing" tag */}
        <div className="absolute top-4 right-6 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-400 text-[9px] font-semibold uppercase tracking-widest">
            {t("Live")}
          </span>
        </div>

        {/* Center mock content */}
        <div className="absolute inset-0 flex flex-col justify-end px-6 pb-4">
          {/* Fake widescreen movie thumbnail */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="w-3/4 h-3/4 rounded-lg bg-gradient-to-br from-zinc-800 via-zinc-700 to-zinc-900 border border-white/10" />
          </div>

          {/* Content info overlay */}
          <div className="relative z-10">
            <div className="text-[8px] text-red-400 font-semibold uppercase tracking-widest mb-1">
              {t("Featured • 4K UHD")}
            </div>
            <div className="text-white text-sm font-bold mb-1 leading-tight">
              {t("Premium Content")}
            </div>
            <div className="text-gray-400 text-[9px] mb-3 max-w-[60%]">
              {t(
                "Stream your favorite shows and movies in crystal-clear quality, anytime, anywhere.",
              )}
            </div>
            <div className="flex gap-2">
              <div className="px-3 py-1 rounded bg-red-600 text-white text-[9px] font-semibold">
                {t("▶ Watch Now")}
              </div>
              <div className="px-3 py-1 rounded bg-white/10 text-white text-[9px] font-medium border border-white/10">
                {t("+ Watchlist")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel / Category strip */}
      <div className="px-4 py-3 bg-black/80 border-t border-white/5">
        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-medium">
          {t("Categories")}
        </div>
        <div className="flex gap-2 overflow-hidden">
          {channels.map((ch) => (
            <div
              key={ch.label}
              className={`flex-shrink-0 w-16 h-10 rounded-md bg-gradient-to-br ${ch.color} flex items-end p-1.5 border border-white/5`}
            >
              <span className="text-white text-[8px] font-semibold">
                {ch.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main showcase component                                                    */
/* -------------------------------------------------------------------------- */
export default function SmartTVShowcase() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "center center"],
  });

  // useSpring smooths out scroll jitter — stiffness/damping tuned for 60 fps feel
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 20,
    restDelta: 0.001,
  });

  // Only animate transform (scale) and opacity — both are GPU-composited.
  // blur/filter forces full repaints every frame and is the #1 cause of lag.
  const scale = useTransform(smoothProgress, [0, 1], [0.24, 1]);
  const opacity = useTransform(smoothProgress, [0, 0.3], [0, 1]);

  return (
    <section
      ref={containerRef}
      className="relative py-16 md:py-28 bg-black overflow-hidden flex flex-col items-center justify-center"
    >
      {/* Ambient glow behind the TV */}
      <motion.div
        style={{ opacity }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="w-[600px] h-[400px] rounded-full bg-red-600/10 blur-[120px]" />
      </motion.div>

      {/* Eyebrow label */}
      <motion.p
        style={{ opacity }}
        initial={false}
        className="text-red-500 text-sm font-semibold uppercase tracking-widest mb-6 text-center"
      >
        {t("See it in action")}
      </motion.p>

      {/* TV assembly — will-change:transform promotes to its own GPU compositor layer */}
      <motion.div
        style={{ scale, opacity, willChange: "transform, opacity" }}
        className="w-full max-w-[860px] px-4 mx-auto"
      >
        {/* TV body / bezel */}
        <div
          className="relative rounded-[22px] p-[10px]"
          style={{
            background:
              "linear-gradient(160deg, #2a2a2a 0%, #111 50%, #1c1c1c 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.06), 0 40px 80px rgba(0,0,0,0.8), 0 0 60px rgba(239,68,68,0.12)",
          }}
        >
          {/* Inner bezel ring */}
          <div className="rounded-[14px] overflow-hidden ring-1 ring-white/5">
            {/* Aspect-ratio 16:9 screen */}
            <div className="aspect-video w-full overflow-hidden">
              <StreamingScreen />
            </div>
          </div>

          {/* Brand dot + center bottom chrome detail */}
          <div className="flex items-center justify-center gap-2 pt-3 pb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600/70" />
            <span className="text-[9px] font-semibold tracking-[0.25em] text-white/20 uppercase">
              Nova Player
            </span>
          </div>
        </div>

        {/* TV neck */}
        <div className="flex justify-center">
          <div
            className="w-[72px] h-[22px]"
            style={{
              background: "linear-gradient(to bottom, #1c1c1c, #111)",
              clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
            }}
          />
        </div>

        {/* TV base */}
        <div className="flex justify-center">
          <div
            className="h-[10px] w-[200px] rounded-t-none rounded-b-[40px]"
            style={{
              background: "linear-gradient(to bottom, #222, #111)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      </motion.div>

      {/* Subtitle below */}
      <motion.p
        style={{ opacity }}
        className="mt-6 md:mt-10 text-gray-500 text-base text-center max-w-md"
      >
        {t("Crisp 4K streaming · EPG guide · Thousands of channels")}
      </motion.p>
    </section>
  );
}
