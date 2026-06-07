import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Globe,
  Hash,
  MonitorSmartphone,
  RefreshCw,
  Server,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { motion } from "motion/react";
import { focusNext } from "../lib/remote";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { toast } from "sonner";
import {
  getDeviceIdentity,
  type DeviceIdentity,
} from "../lib/deviceIdentity";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

export default function Account() {
  const navigate = useNavigate();
  const {
    activePlaylist,
    isConnected,
    refreshAccountInfo,
    activationStatus,
    isActivationLoading,
    refreshActivationStatus,
  } = usePlaylist();
  const t = useT();
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  // TV remote navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;
      if (key === "back" || key === "red") { navigate("/"); return; }
      if (key === "up" || key === "down" || key === "left" || key === "right") {
        focusNext(key, { root: rootRef.current });
      }
      else if (key === "enter" || key === "select") (document.activeElement as HTMLElement | null)?.click();
    };
    window.addEventListener("tv-remote-key", handler);
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>("[data-tv-focusable]")?.focus();
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
    const refreshes: Promise<unknown>[] = [refreshActivationStatus(true)];

    if (activePlaylist?.type === "xtream") {
      refreshes.push(refreshAccountInfo(activePlaylist.id));
    }

    toast.promise(Promise.all(refreshes), {
      loading: t.refreshingAccount,
      success: t.accountUpdated,
      error: t.failedToRefresh,
    });
  };

  const accountUser = activePlaylist?.accountInfo?.user;
  const serverInfo = activePlaylist?.accountInfo?.server;
  const rawExpiry = accountUser?.exp_date;
  const hasUnlimitedIptv = !rawExpiry || rawExpiry === "0" || rawExpiry === "Unlimited";
  const expiryDate = hasUnlimitedIptv ? t.unlimited : IPTVService.formatExpiryDate(rawExpiry);

  const getDaysRemaining = () => {
    // Keep expiry math on the raw Xtream epoch value; formatted dates are display-only.
    if (hasUnlimitedIptv || !rawExpiry) return null;
    const exp = new Date(Number(rawExpiry) * 1000);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysRemaining = getDaysRemaining();

  const status =
    accountUser?.status ||
    (isConnected ? "Active" : "Not Connected");
  const maxConnections =
    accountUser?.max_connections || "0";
  const activeConnections =
    accountUser?.active_cons || "0";
  const isIptvActive = status.toLowerCase() === "active";
  const isAppActivated = activationStatus.activated || activationStatus.reason === "trial_active";
  const currentActivation =
    activationStatus.activations.find((activation) => activation.status?.toLowerCase() === "active") ||
    activationStatus.activations[0];
  const activationExpiry =
    currentActivation?.expiresAt ||
    (activationStatus.trial.active ? activationStatus.trial.expiresAt : null);
  const activationLabel = activationStatus.activated
    ? "Activated"
    : activationStatus.reason === "trial_active"
      ? "Trial Active"
      : activationStatus.reason === "trial_expired"
        ? "Trial Expired"
        : activationStatus.reason === "blocked"
          ? "Blocked"
          : "Not Activated";
  const activationTone = isAppActivated ? "success" : activationStatus.reason === "blocked" ? "danger" : "warning";
  const serverEndpoint =
    activePlaylist?.type === "xtream"
      ? serverInfo?.url
        ? `${serverInfo.server_protocol || "http"}://${serverInfo.url}${serverInfo.port ? `:${serverInfo.port}` : ""}`
        : activePlaylist.host || t.notConnected
      : activePlaylist?.url || t.notConnected;
  const playlistType = activePlaylist?.type === "xtream" ? "Xtream IPTV" : activePlaylist ? "M3U Playlist" : t.notConnected;

  const formatDateTime = (value?: string | null) => {
    if (!value) return t.unlimited;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div ref={rootRef} className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(139,0,0,0.24),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(160deg,#020617,#0f172a_52%,#020617)]">
      <header className="flex items-center justify-between border-b border-white/10 bg-black/25 px-8 py-6 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <button
            data-tv-focusable
            onClick={() => navigate("/")}
            className="rounded-full border border-white/10 bg-white/5 p-3 transition-all hover:scale-105 hover:bg-white/10 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.18),0_0_24px_rgba(66,133,244,0.35)]"
          >
            <ArrowLeft className="w-8 h-8" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/15 p-3">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{t.accountInformation}</h1>
              <p className="text-sm text-white/45">App activation, device identity, and IPTV account status</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            data-tv-focusable
            onClick={handleRefresh}
            disabled={isActivationLoading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition-colors hover:bg-white/10 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.18),0_0_24px_rgba(66,133,244,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", isActivationLoading && "animate-spin")} /> {t.refreshInfo}
          </button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="flex flex-1 items-center overflow-y-auto p-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[32px] border border-white/15 bg-white/[0.06] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-5">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/35 bg-primary/15">
                  <MonitorSmartphone className="h-12 w-12 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/40">Current Device</p>
                  <h2 className="mt-2 truncate text-4xl font-bold">{activePlaylist?.name || t.notConnected}</h2>
                  <p className="mt-2 text-white/50">{playlistType}</p>
                </div>
              </div>
              <StatusPill tone={activationTone} icon={isAppActivated ? BadgeCheck : AlertTriangle} label={activationLabel} />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetricCard
                icon={ShieldCheck}
                label="App Activation"
                value={activationLabel}
                subValue={activationExpiry ? `Expires ${formatDateTime(activationExpiry)}` : "No app expiry"}
                tone={activationTone}
              />
              <MetricCard
                icon={Calendar}
                label="IPTV Subscription"
                value={isIptvActive ? "Active" : status}
                subValue={hasUnlimitedIptv ? t.lifetime : `${expiryDate}${daysRemaining !== null ? ` · ${daysRemaining} ${t.daysRemaining}` : ""}`}
                tone={isIptvActive ? "success" : "danger"}
              />
              <MetricCard
                icon={Server}
                label="IPTV Server"
                value={playlistType}
                subValue={serverEndpoint}
              />
              <MetricCard
                icon={Hash}
                label="Device"
                value={activationStatus.device?.mac || deviceIdentity?.macAddress || "Loading..."}
                subValue={`Key: ${activationStatus.device?.deviceKey || deviceIdentity?.deviceKey || "Loading..."}`}
              />
              <MetricCard
                icon={Users}
                label={t.connections}
                value={`${activeConnections}/${maxConnections}`}
                subValue={accountUser?.username ? `User: ${accountUser.username}` : undefined}
              />
              <MetricCard
                icon={Globe}
                label="Platform"
                value={activationStatus.device?.platform || deviceIdentity?.profile.platform || "Unknown"}
                subValue={activationStatus.device?.status ? `Device status: ${activationStatus.device.status}` : undefined}
              />
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function StatusPill({ icon: Icon, label, tone = "neutral" }: { icon: LucideIcon; label: string; tone?: Tone }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-bold uppercase tracking-[0.16em]",
        toneClass(tone, "pill"),
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </div>
  );
}

type Tone = "success" | "warning" | "danger" | "neutral";

function toneClass(tone: Tone, variant: "card" | "pill") {
  const card = {
    success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    danger: "border-red-400/20 bg-red-500/10 text-red-200",
    neutral: "border-white/10 bg-white/[0.06] text-white",
  };
  const pill = {
    success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
    warning: "border-amber-400/30 bg-amber-500/15 text-amber-200",
    danger: "border-red-400/30 bg-red-500/15 text-red-200",
    neutral: "border-white/15 bg-white/10 text-white",
  };
  return variant === "card" ? card[tone] : pill[tone];
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subValue?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-3xl border p-5", toneClass(tone, "card"))}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">{label}</span>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
      <p className="text-2xl font-bold capitalize">{value}</p>
      {subValue && <p className="mt-2 text-sm opacity-65">{subValue}</p>}
    </div>
  );
}

