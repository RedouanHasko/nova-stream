import { useState, FormEvent } from "react";
import {
  ArrowLeft,
  Link as LinkIcon,
  ShieldCheck,
  Globe,
  User,
  Lock,
  Server,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import Logo from "../components/Logo";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { useT } from "../lib/i18n";

type SetupMode = "m3u" | "xtream";

export default function PlaylistSetup() {
  const navigate = useNavigate();
  const { addPlaylist } = usePlaylist();
  const t = useT();
  const [mode, setMode] = useState<SetupMode>("m3u");
  const [isLoading, setIsLoading] = useState(false);

  // M3U State
  const [m3uName, setM3uName] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");

  // Xtream State
  const [xtreamName, setXtreamName] = useState("");
  const [xtreamHost, setXtreamHost] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();

    // Validation
    if (mode === "m3u") {
      if (!m3uName.trim() || !m3uUrl.trim()) {
        toast.error(t.fillAllFields);
        return;
      }
      if (!m3uUrl.startsWith("http")) {
        toast.error(t.invalidM3uUrl);
        return;
      }
    } else {
      if (
        !xtreamName.trim() ||
        !xtreamHost.trim() ||
        !xtreamUser.trim() ||
        !xtreamPass.trim()
      ) {
        toast.error(t.fillAllFields);
        return;
      }
      if (!xtreamHost.startsWith("http")) {
        toast.error(t.invalidServerUrl);
        return;
      }
    }

    setIsLoading(true);

    const playlistInfo =
      mode === "m3u"
        ? { name: m3uName, type: "m3u" as const, url: m3uUrl }
        : {
            name: xtreamName,
            type: "xtream" as const,
            host: xtreamHost,
            username: xtreamUser,
            password: xtreamPass,
          };

    toast.promise(
      (async () => {
        if (mode === "xtream") {
          const info = await IPTVService.getXtreamInfo(
            xtreamHost,
            xtreamUser,
            xtreamPass,
          );
          if (!info?.user_info)
            throw new Error("Server responded but credentials are invalid");
          if (info.user_info.status === "Banned")
            throw new Error("Account is banned");
          if (info.user_info.status === "Disabled")
            throw new Error("Account is disabled");
        }
        addPlaylist(playlistInfo);
      })(),
      {
        loading: t.connecting,
        success: () => {
          setIsLoading(false);
          navigate("/");
          return t.playlistAdded;
        },
        error: (err) => {
          setIsLoading(false);
          return err instanceof Error ? err.message : t.failedToConnect;
        },
      },
    );
  };

  return (
    <div className="flex flex-col min-h-screen p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-6 mb-12">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ArrowLeft className="w-8 h-8" />
        </button>
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-2xl font-semibold text-white/80">
            | {t.addPlaylist}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 bg-black/20 p-1.5 rounded-xl self-center">
        <button
          onClick={() => setMode("m3u")}
          className={cn(
            "flex items-center gap-2 px-8 py-3 rounded-lg font-semibold transition-all",
            mode === "m3u"
              ? "bg-primary text-white shadow-lg"
              : "text-white/40 hover:text-white/60",
          )}
        >
          <LinkIcon className="w-5 h-5" />
          M3U Link
        </button>
        <button
          onClick={() => setMode("xtream")}
          className={cn(
            "flex items-center gap-2 px-8 py-3 rounded-lg font-semibold transition-all",
            mode === "xtream"
              ? "bg-primary text-white shadow-lg"
              : "text-white/40 hover:text-white/60",
          )}
        >
          <ShieldCheck className="w-5 h-5" />
          Xtream Login
        </button>
      </div>

      {/* Form Container */}
      <motion.div
        layout
        className="bg-black/30 backdrop-blur-xl border border-white/5 rounded-3xl p-10 shadow-2xl"
      >
        <form onSubmit={handleConnect} className="flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {mode === "m3u" ? (
              <motion.div
                key="m3u"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.playlistName}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="text"
                      placeholder={t.playlistName}
                      value={m3uName}
                      onChange={(e) => setM3uName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.m3uUrl}
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="url"
                      placeholder="http://example.com/playlist.m3u"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="xtream"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-2 gap-6"
              >
                <div className="col-span-2 flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.playlistName}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="text"
                      placeholder={t.playlistName}
                      value={xtreamName}
                      onChange={(e) => setXtreamName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.serverUrl}
                  </label>
                  <div className="relative">
                    <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="url"
                      placeholder="http://provider-dns.com:8080"
                      value={xtreamHost}
                      onChange={(e) => setXtreamHost(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.username}
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="text"
                      placeholder={t.username}
                      value={xtreamUser}
                      onChange={(e) => setXtreamUser(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/40 ml-1">
                    {t.password}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input
                      required
                      type="password"
                      placeholder="••••••••"
                      value={xtreamPass}
                      onChange={(e) => setXtreamPass(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            disabled={isLoading}
            type="submit"
            className={cn(
              "mt-4 w-full bg-primary hover:bg-primary-hover py-5 rounded-2xl font-bold text-xl transition-all shadow-xl shadow-primary/20",
              "flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isLoading ? (
              <>
                <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                {t.connecting}
              </>
            ) : (
              t.connect
            )}
          </button>
        </form>
      </motion.div>

      <div className="mt-8 text-center text-white/30 text-sm">
        By connecting, you agree to the terms of service and privacy policy.
      </div>
    </div>
  );
}
