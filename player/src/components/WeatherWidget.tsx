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
  temp: number | null;
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

type WeatherWidgetProps = {
  variant?: "default" | "hero" | "compact";
};

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

export default function WeatherWidget({ variant = "default" }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(() => readCache());
  const [loading, setLoading] = useState<boolean>(() => !readCache());

  useEffect(() => {
    // If we already have fresh cached data, do nothing
    if (readCache()) return;

    const fetchWeather = async (lat: number, lon: number, cityHint?: string) => {
      try {
        setLoading(true);
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
        if (cityHint) {
          city = cityHint;
        } else if (geoRes.status === "fulfilled" && geoRes.value.ok) {
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
      } finally {
        setLoading(false);
      }
    };

    const fetchFromIp = async () => {
      try {
        const ipRes = await fetch("https://ipapi.co/json/");
        if (!ipRes.ok) return;
        const ipData = await ipRes.json();
        const lat = Number(ipData?.latitude);
        const lon = Number(ipData?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const cityHint =
          typeof ipData?.city === "string" && ipData.city.trim()
            ? ipData.city.trim()
            : undefined;
        await fetchWeather(lat, lon, cityHint);
      } catch {
        /* ignore */
      }

      // Secondary IP provider fallback.
      try {
        const ipRes = await fetch("https://ipwho.is/");
        if (!ipRes.ok) return;
        const ipData = await ipRes.json();
        const lat = Number(ipData?.latitude);
        const lon = Number(ipData?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const cityHint =
          typeof ipData?.city === "string" && ipData.city.trim()
            ? ipData.city.trim()
            : undefined;
        await fetchWeather(lat, lon, cityHint);
      } catch {
        /* ignore */
      }
    };

    const fetchWeatherForDefaultCity = async () => {
      try {
        setLoading(true);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const cityGuess = tz.split("/").pop()?.replace(/_/g, " ") || "Unknown";
        const search = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityGuess)}&count=1&language=en&format=json`,
        );
        if (!search.ok) return;
        const result = await search.json();
        const first = Array.isArray(result?.results) ? result.results[0] : null;
        const lat = Number(first?.latitude);
        const lon = Number(first?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        await fetchWeather(lat, lon, first?.name || cityGuess);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };

    const ensureVisibleFallback = () => {
      setWeather((prev) =>
        prev || {
          temp: null,
          code: 45,
          city: "Weather unavailable",
        },
      );
      setLoading(false);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => {
          void fetchFromIp().then(() => {
            if (!readCache()) {
              void fetchWeatherForDefaultCity().then(() => {
                if (!readCache()) ensureVisibleFallback();
              });
            }
          });
        },
        { timeout: 8000 },
      );
    } else {
      void fetchFromIp().then(() => {
        if (!readCache()) {
          void fetchWeatherForDefaultCity().then(() => {
            if (!readCache()) ensureVisibleFallback();
          });
        }
      });
    }
  }, []);

  if (!weather) {
    if (variant === "compact") {
      return (
        <div className="flex min-w-[175px] items-center gap-2 text-left">
          <Cloud className="h-7 w-7 text-white/70" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-white">{loading ? "Loading" : "Weather"}</span>
            <span className="text-[10px] text-white/40">--</span>
          </div>
        </div>
      );
    }

    if (variant === "hero") {
      return (
        <div className="home-weather-hero flex min-w-[220px] items-center justify-center gap-3 rounded-full px-4 py-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8">
            <Cloud className="h-6 w-6 text-white/70" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">{loading ? "Loading weather" : "Weather"}</span>
            <span className="text-xs text-white/40">--</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
        <div className="p-2 rounded-xl bg-white/10 flex items-center justify-center">
          <Cloud className="w-5 h-5 text-white/70" />
        </div>
        <div className="flex flex-col leading-tight">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-white">--</span>
            <span className="text-xs font-medium text-white/70">
              {loading ? "Loading..." : "Weather"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <MapPin className="w-2.5 h-2.5" />
            <span className="truncate max-w-28">--</span>
          </div>
        </div>
      </div>
    );
  }

  const meta = getWeatherMeta(weather.code);
  const { Icon, label, color, bgColor, animation } = meta;

  const MotionDiv = motion.div as any;

  if (variant === "hero") {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="home-weather-hero flex min-w-[240px] items-center justify-center gap-4 rounded-full px-4 py-3 text-left"
      >
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${bgColor}`}>
          <motion.div
            animate={iconAnimations[animation]}
            transition={iconTransitions[animation]}
          >
            <Icon className={`h-5.5 w-5.5 ${color}`} />
          </motion.div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-end gap-2 leading-none">
            <span className="text-[28px] font-semibold text-white">
              {typeof weather.temp === "number" ? `${weather.temp}°C` : "--"}
            </span>
            <span className={`pb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${color}`}>{label}</span>
          </div>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-white/48">
            <MapPin className="h-3.5 w-3.5" />
            {weather.city}
          </span>
        </div>
      </MotionDiv>
    );
  }

  if (variant === "compact") {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex min-w-[196px] items-center gap-2"
      >
        <motion.div
          animate={iconAnimations[animation]}
          transition={iconTransitions[animation]}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8"
        >
          <Icon className={`h-7 w-7 ${color}`} />
        </motion.div>
        <div className="flex flex-col leading-tight">
          <div className="flex items-baseline gap-2">
            <span className="text-[19px] font-semibold leading-none text-white">
              {typeof weather.temp === "number" ? `${weather.temp}°C` : "--"}
            </span>
            <span className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${color}`}>{label}</span>
          </div>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-white/58">
            <MapPin className="h-3 w-3" />
            <span className="truncate max-w-32">{weather.city}</span>
          </span>
        </div>
      </MotionDiv>
    );
  }

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
          <span className="text-sm font-bold text-white">
            {typeof weather.temp === "number" ? `${weather.temp}°C` : "--"}
          </span>
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
