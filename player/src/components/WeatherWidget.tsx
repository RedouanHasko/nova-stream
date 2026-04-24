import { useState, useEffect } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
  MapPin,
} from "lucide-react";
import { motion } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";

interface WeatherData {
  temp: number;
  code: number;
  city: string;
}

interface WeatherMeta {
  Icon: React.ElementType;
  label: string;
  color: string; // Tailwind text color
  bgColor: string; // Tailwind bg color
  animation: "spin" | "bounce" | "pulse" | "sway" | "none";
}

const CACHE_KEY = "nova_weather_v1";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Module-level in-memory cache shared across all mounted instances
let memCache: { data: WeatherData; ts: number } | null = null;

function readCache(): WeatherData | null {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) return memCache.data;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: { data: WeatherData; ts: number } = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_TTL) {
      memCache = parsed;
      return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(data: WeatherData) {
  const entry = { data, ts: Date.now() };
  memCache = entry;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function getWeatherMeta(code: number): WeatherMeta {
  if (code === 0)
    return {
      Icon: Sun,
      label: "Clear Sky",
      color: "text-white",
      bgColor: "bg-white/10",
      animation: "spin",
    };
  if (code <= 2)
    return {
      Icon: Sun,
      label: "Mainly Clear",
      color: "text-white",
      bgColor: "bg-white/10",
      animation: "sway",
    };
  if (code === 3)
    return {
      Icon: Cloud,
      label: "Overcast",
      color: "text-white/70",
      bgColor: "bg-white/10",
      animation: "sway",
    };
  if (code <= 48)
    return {
      Icon: CloudFog,
      label: "Foggy",
      color: "text-white/60",
      bgColor: "bg-white/10",
      animation: "pulse",
    };
  if (code <= 55)
    return {
      Icon: CloudDrizzle,
      label: "Drizzle",
      color: "text-white/80",
      bgColor: "bg-white/10",
      animation: "bounce",
    };
  if (code <= 65)
    return {
      Icon: CloudRain,
      label: "Rainy",
      color: "text-white/80",
      bgColor: "bg-white/10",
      animation: "bounce",
    };
  if (code <= 77)
    return {
      Icon: CloudSnow,
      label: "Snowy",
      color: "text-white",
      bgColor: "bg-white/10",
      animation: "pulse",
    };
  if (code <= 82)
    return {
      Icon: CloudRain,
      label: "Showers",
      color: "text-white/80",
      bgColor: "bg-white/10",
      animation: "bounce",
    };
  if (code <= 99)
    return {
      Icon: CloudLightning,
      label: "Thunderstorm",
      color: "text-white",
      bgColor: "bg-white/10",
      animation: "pulse",
    };
  return {
    Icon: Wind,
    label: "Windy",
    color: "text-white/70",
    bgColor: "bg-white/10",
    animation: "sway",
  };
}

const iconAnimations: Record<WeatherMeta["animation"], TargetAndTransition> = {
  spin: { rotate: [0, 360] },
  bounce: { y: [0, -3, 0] },
  pulse: { scale: [1, 1.15, 1] },
  sway: { rotate: [-8, 8, -8] },
  none: {},
};

const iconTransitions: Record<WeatherMeta["animation"], Transition> = {
  spin: { duration: 8, repeat: Infinity, ease: "linear" },
  bounce: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
  pulse: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  sway: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  none: {},
};

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(() => readCache());

  useEffect(() => {
    // If we already have fresh cached data, do nothing
    if (readCache()) return;

    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const [weatherRes, geoRes] = await Promise.allSettled([
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
          ),
          fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
            {
              headers: { "Accept-Language": "en" },
            },
          ),
        ]);

        if (weatherRes.status !== "fulfilled" || !weatherRes.value.ok) return;
        const weatherData = await weatherRes.value.json();

        let city = "Unknown";
        if (geoRes.status === "fulfilled" && geoRes.value.ok) {
          const geoData = await geoRes.value.json();
          city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.suburb ||
            "Unknown";
        }

        const data: WeatherData = {
          temp: Math.round(weatherData.current_weather.temperature),
          code: weatherData.current_weather.weathercode,
          city,
        };
        writeCache(data);
        setWeather(data);
      } catch (err) {
        console.warn("Weather fetch failed:", err);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => {
          /* silently fail — widget just won't show */
        },
        { timeout: 8000 },
      );
    }
  }, []);

  if (!weather) return null;

  const meta = getWeatherMeta(weather.code);
  const { Icon, label, color, bgColor, animation } = meta;

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ transform: "translateY(0)" }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10"
    >
      {/* Animated icon badge */}
      <div
        className={`p-2 rounded-xl ${bgColor} flex items-center justify-center`}
      >
        <motion.div
          animate={iconAnimations[animation]}
          transition={iconTransitions[animation]}
        >
          <Icon className={`w-5 h-5 ${color}`} />
        </motion.div>
      </div>

      {/* Text info */}
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-white">{weather.temp}°C</span>
          <span className={`text-xs font-medium ${color}`}>{label}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-white/40">
          <MapPin className="w-2.5 h-2.5" />
          <span className="truncate max-w-28">{weather.city}</span>
        </div>
      </div>
    </MotionDiv>
  );
}
