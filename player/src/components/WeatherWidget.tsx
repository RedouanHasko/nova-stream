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
import { getPlatformName } from "../lib/platformPlayer";

interface WeatherWidgetProps {
  variant?: "default" | "compact";
}

interface WeatherData {
  temp: number | null;
  code: number | null;
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
const REQUEST_TIMEOUT_MS = 7000;
const FALLBACK_WEATHER: WeatherData = { temp: null, code: null, city: "Weather unavailable" };

// Module-level in-memory cache shared across all mounted instances
let memCache: { data: WeatherData; ts: number } | null = null;

const isWeatherData = (value: unknown): value is WeatherData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<WeatherData>;
  return (
    (typeof data.temp === "number" || data.temp === null) &&
    (typeof data.code === "number" || data.code === null) &&
    typeof data.city === "string"
  );
};

function readCache(): WeatherData | null {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) return memCache.data;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: { data: unknown; ts: number } = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_TTL && isWeatherData(parsed.data)) {
      memCache = { data: parsed.data, ts: parsed.ts };
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

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function cityFromTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = timezone?.split("/").pop()?.replace(/_/g, " ");
    return city || "Local area";
  } catch {
    return "Local area";
  }
}

function getWeatherMeta(code: number | null): WeatherMeta {
  if (code === null)
    return {
      Icon: Cloud,
      label: "Weather",
      color: "text-white/60",
      bgColor: "bg-white/10",
      animation: "none",
    };
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

export default function WeatherWidget({ variant = "default" }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData>(() => readCache() || FALLBACK_WEATHER);

  useEffect(() => {
    let cancelled = false;
    const platform = getPlatformName();
    const isTvLikeEnv =
      platform === "webos" ||
      platform === "tizen" ||
      /WebOS|Tizen|SMART-TV|HbbTV|SmartTV|GoogleTV|Android TV|FireTV|AmazonWebAppPlatform/i.test(navigator.userAgent);

    // If we already have fresh cached data, do nothing.
    if (readCache()) return;

    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const [weatherRes, geoRes] = await Promise.allSettled([
          fetchWithTimeout(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
          ),
          fetchWithTimeout(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
            {
              headers: { "Accept-Language": "en" },
            },
          ),
        ]);

        if (weatherRes.status !== "fulfilled" || !weatherRes.value.ok) return;
        const weatherData = await weatherRes.value.json();

        let city = cityFromTimezone();
        if (geoRes.status === "fulfilled" && geoRes.value.ok) {
          const geoData = await geoRes.value.json();
          city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.suburb ||
            city;
        }

        const data: WeatherData = {
          temp: Math.round(weatherData.current_weather.temperature),
          code: weatherData.current_weather.weathercode,
          city,
        };
        writeCache(data);
        if (!cancelled) setWeather(data);
      } catch (err) {
        console.warn("Weather fetch failed:", err);
      }
    };

    if ("geolocation" in navigator && !isTvLikeEnv) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => {
          if (!cancelled) setWeather(FALLBACK_WEATHER);
        },
        { timeout: 8000 },
      );
    } else {
      // TV browsers often block geolocation prompts. Keep the widget stable and
      // avoid permission dialogs that can trap remote navigation.
      setWeather(FALLBACK_WEATHER);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = getWeatherMeta(weather.code);
  const { Icon, label, color, bgColor, animation } = meta;

  const MotionDiv = motion.div as any;
  const isCompact = variant === "compact";

  return (
    <MotionDiv
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ transform: "translateY(0)" }}
      transition={{ duration: 0.4 }}
      className={`flex items-center ${isCompact ? "gap-2 px-3 py-2" : "gap-3 px-4 py-2"} bg-white/5 backdrop-blur-md rounded-2xl border border-white/10`}
    >
      {/* Animated icon badge */}
      <div
        className={`${isCompact ? "p-1.5" : "p-2"} rounded-xl ${bgColor} flex items-center justify-center`}
      >
        <motion.div
          animate={iconAnimations[animation]}
          transition={iconTransitions[animation]}
        >
          <Icon className={`${isCompact ? "w-4 h-4" : "w-5 h-5"} ${color}`} />
        </motion.div>
      </div>

      {/* Text info */}
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-white">{weather.temp === null ? "--" : weather.temp}°C</span>
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
