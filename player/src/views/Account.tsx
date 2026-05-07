import {
  ArrowLeft,
  User,
  ShieldCheck,
  Calendar,
  Globe,
  Server,
  Hash,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { motion } from "motion/react";
import { focusNext } from "../lib/remote";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { toast } from "sonner";
import {
  getDeviceIdentity,
  getDeviceIdentitySummary,
  type DeviceIdentity,
} from "../lib/deviceIdentity";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

export default function Account() {
  const navigate = useNavigate();
  const { activePlaylist, isConnected, refreshAccountInfo } = usePlaylist();
  const t = useT();
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(
    null,
  );

  // TV remote navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;
      if (key === "back") { navigate("/"); return; }
      if (key === "up" || key === "left") focusNext("up");
      else if (key === "down" || key === "right") focusNext("down");
      else if (key === "enter") (document.activeElement as HTMLElement | null)?.click();
    };
    window.addEventListener("tv-remote-key", handler);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("button")?.focus();
    });
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [navigate]);

  useEffect(() => {
    let active = true;

    getDeviceIdentity()
      .then((identity) => {
        if (active) {
          setDeviceIdentity(identity);
        }
      })
      .catch((error) => {
        console.error("device identity resolution failed", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    if (!activePlaylist) return;

    toast.promise(refreshAccountInfo(activePlaylist.id), {
      loading: t.refreshingAccount,
      success: t.accountUpdated,
      error: t.failedToRefresh,
    });
  };

  const expiryDate = activePlaylist?.accountInfo?.user.exp_date
    ? IPTVService.formatExpiryDate(activePlaylist.accountInfo.user.exp_date)
    : t.unlimited;

  const getDaysRemaining = () => {
    if (expiryDate === "Unlimited") return null;
    const exp = new Date(expiryDate);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysRemaining = getDaysRemaining();

  const status =
    activePlaylist?.accountInfo?.user.status ||
    (isConnected ? "Active" : "Not Connected");
  const maxConnections =
    activePlaylist?.accountInfo?.user.max_connections || "1";
  const activeConnections =
    activePlaylist?.accountInfo?.user.active_cons || "0";

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-8 h-8" />
          </button>
          <div className="flex items-center gap-3">
            <User className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t.accountInformation}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {activePlaylist?.type === "xtream" && (
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" /> {t.refreshInfo}
            </button>
          )}
          <Logo size="sm" />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 rounded-3xl p-8 border border-white/10 flex flex-col items-center text-center gap-6 h-fit"
          >
            <div className="w-32 h-32 bg-primary/20 rounded-full flex items-center justify-center border-4 border-primary/40">
              <User className="w-16 h-16 text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-bold truncate max-w-[200px]">
                {activePlaylist?.name || t.notConnected}
              </h2>
              <p className="text-white/40 mt-1">
                {activePlaylist?.accountInfo?.user.is_trial === "1"
                  ? "Trial Account"
                  : "Premium Subscription"}
              </p>
            </div>
            <div className="w-full h-px bg-white/10" />
            <div className="grid grid-cols-2 w-full gap-4">
              <div className="bg-white/5 p-4 rounded-2xl">
                <span className="text-xs text-white/40 block mb-1">
                  {t.status}
                </span>
                <span
                  className={cn(
                    "font-bold flex items-center justify-center gap-1 capitalize",
                    status.toLowerCase() === "active"
                      ? "text-green-500"
                      : "text-red-500",
                  )}
                >
                  <ShieldCheck className="w-4 h-4" /> {status}
                </span>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl">
                <span className="text-xs text-white/40 block mb-1">
                  {t.connections}
                </span>
                <span className="font-bold flex items-center justify-center gap-1">
                  <Users className="w-4 h-4" /> {activeConnections}/
                  {maxConnections}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Details List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <DetailItem
              icon={Calendar}
              label={t.expires}
              value={expiryDate}
              subValue={
                expiryDate === t.unlimited
                  ? t.lifetime
                  : daysRemaining !== null
                    ? `${daysRemaining} ${t.daysRemaining}`
                    : t.expires
              }
            />
            <DetailItem
              icon={
                isConnected && activePlaylist?.type === "xtream"
                  ? Server
                  : Globe
              }
              label={t.serverInfo}
              value={
                activePlaylist?.type === "xtream"
                  ? "Xtream Codes"
                  : isConnected
                    ? "M3U Playlist"
                    : t.notConnected
              }
            />
            {activePlaylist?.type === "xtream" && (
              <DetailItem
                icon={Globe}
                label={t.serverUrl}
                value={activePlaylist.host || ""}
              />
            )}
            {activePlaylist?.accountInfo?.server.timezone && (
              <DetailItem
                icon={Globe}
                label={t.serverTimezone}
                value={activePlaylist.accountInfo.server.timezone}
              />
            )}
            <DetailItem
              icon={Hash}
              label="MAC Address"
              value={deviceIdentity?.macAddress || "Loading..."}
              subValue={getDeviceIdentitySummary(deviceIdentity)}
            />
            <DetailItem
              icon={Hash}
              label="Device Key"
              value={deviceIdentity?.deviceKey || "Loading..."}
              subValue={deviceIdentity?.profile.appVersion || ""}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
}) {
  const isUrlValue = /^https?:\/\//i.test(value);
  const normalizedUrl = isUrlValue
    ? value
    : /^([a-z0-9-]+\.)+[a-z]{2,}/i.test(value)
      ? `https://${value}`
      : "";

  return (
    <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex items-center gap-6 hover:bg-white/10 transition-colors">
      <div className="p-3 bg-primary/10 rounded-xl">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-1">
        <span className="text-sm text-white/40 block">{label}</span>
        {normalizedUrl ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xl font-bold break-all whitespace-normal leading-snug text-primary hover:underline block"
          >
            {value}
          </a>
        ) : (
          <span className="text-xl font-bold break-all whitespace-normal leading-snug block">
            {value}
          </span>
        )}
        {subValue && (
          <span className="text-xs text-primary block mt-0.5">{subValue}</span>
        )}
      </div>
    </div>
  );
}
