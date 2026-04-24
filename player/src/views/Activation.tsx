import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Hash,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Tv,
} from "lucide-react";
import { toast } from "sonner";
import Logo from "../components/Logo";
import { usePlaylist } from "../context/PlaylistContext";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

export default function Activation() {
  const {
    activationStatus,
    isActivationLoading,
    startFreeTrial,
    refreshActivationStatus,
    activationPortalUrl,
  } = usePlaylist();

  const openActivationPortal = () => {
    if (!activationPortalUrl) {
      toast.error("Activation URL is not configured for this app build");
      return;
    }

    try {
      const target = new URL(activationPortalUrl, window.location.origin);
      target.searchParams.set("mac", activationStatus.device?.mac || "");
      target.searchParams.set("key", activationStatus.device?.deviceKey || "");
      window.open(target.toString(), "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Invalid activation URL configuration");
    }
  };

  const title =
    activationStatus.reason === "trial_active"
      ? "Free Trial Active"
      : activationStatus.reason === "trial_expired"
        ? "Free Trial Expired"
        : activationStatus.reason === "blocked"
          ? "Device Blocked"
          : activationStatus.reason === "device_key_mismatch"
            ? "Device Key Mismatch"
            : activationStatus.reason === "unreachable"
              ? "Activation Server Unreachable"
              : "Activation Required";

  const body =
    activationStatus.reason === "trial_active"
      ? `This device is using its free trial. ${activationStatus.trial.remainingDays || 0} day(s) remaining.`
      : activationStatus.reason === "trial_expired"
        ? "This device already consumed its 7-day free trial. Activate the app to continue."
        : activationStatus.reason === "blocked"
          ? "This device is blocked on the server. Contact your administrator."
          : activationStatus.reason === "device_key_mismatch"
            ? "The stored device key does not match this device. Contact support to resolve the activation lock."
            : activationStatus.reason === "unreachable"
              ? "The app could not verify activation right now. Check the backend connection and refresh."
              : "Activate this device or start its one-time free trial before using the player.";

  const StatusIcon =
    activationStatus.reason === "trial_active"
      ? Clock3
      : activationStatus.reason === "trial_expired" ||
          activationStatus.reason === "blocked" ||
          activationStatus.reason === "unreachable"
        ? ShieldAlert
        : activationStatus.reason === "device_key_mismatch"
          ? Lock
          : ShieldCheck;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,0,0,0.28),transparent_45%)]" />
      <div className="relative w-full max-w-4xl rounded-[36px] border border-white/10 bg-black/70 backdrop-blur-2xl shadow-2xl shadow-black/50 p-8 md:p-12">
        <div className="flex items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <Logo size="sm" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                Device Activation
              </p>
              <h1 className="text-3xl md:text-4xl font-black">
                NOVA PLAYER Access Control
              </h1>
            </div>
          </div>
          <Tv className="w-10 h-10 text-primary/80" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <StatusIcon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{title}</h2>
                  <p className="text-white/60 mt-2 leading-7">{body}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-white/45 mb-2">MAC Address</p>
                <div className="flex items-center gap-3 text-lg font-bold">
                  <Hash className="w-5 h-5 text-primary" />
                  <span>{activationStatus.device?.mac || "Loading..."}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-white/45 mb-2">Device Key</p>
                <div className="flex items-center gap-3 text-lg font-bold">
                  <Hash className="w-5 h-5 text-primary" />
                  <span>{activationStatus.device?.deviceKey || "Loading..."}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-white/45 mb-2">Trial Status</p>
                <div className="flex items-center gap-3 text-lg font-bold">
                  <Clock3 className="w-5 h-5 text-primary" />
                  <span>{activationStatus.trial.status}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-white/45 mb-2">Trial Expires</p>
                <div className="flex items-center gap-3 text-lg font-bold">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span>{formatDate(activationStatus.trial.expiresAt)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
            <h3 className="text-xl font-bold">What you can do now</h3>
            <p className="text-white/55 leading-7">
              Free trial is locked to this device identity. Uninstalling the app will not reset trial usage.
            </p>

            <button
              onClick={() => startFreeTrial()}
              disabled={
                isActivationLoading ||
                !activationStatus.trial.available ||
                activationStatus.reason === "blocked"
              }
              className="w-full rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed py-4 px-5 font-bold text-lg transition-colors"
            >
              {isActivationLoading
                ? "Working..."
                : `Start ${activationStatus.trial.durationDays}-Day Free Trial`}
            </button>

            <button
              onClick={openActivationPortal}
              className="w-full rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 py-4 px-5 font-bold text-lg transition-colors flex items-center justify-center gap-3"
            >
              <ExternalLink className="w-5 h-5" />
              Open Activation Page
            </button>

            <button
              onClick={() => refreshActivationStatus()}
              disabled={isActivationLoading}
              className="w-full rounded-2xl border border-white/10 bg-transparent hover:bg-white/5 disabled:opacity-50 py-4 px-5 font-semibold transition-colors flex items-center justify-center gap-3"
            >
              <RefreshCw className={`w-5 h-5 ${isActivationLoading ? "animate-spin" : ""}`} />
              Refresh Activation Status
            </button>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55 leading-6">
              <p>Device status: {activationStatus.device?.status || "Unknown"}</p>
              <p>Platform: {activationStatus.device?.platform || "Unknown"}</p>
              <p>Device name: {activationStatus.device?.deviceName || "Unknown"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
