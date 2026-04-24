import {
  ArrowLeft,
  Lock,
  Unlock,
  ListRestart,
  Languages,
  LayoutGrid,
  EyeOff,
  Trash2,
  SortAsc,
  MonitorPlay,
  Clock,
  Subtitles,
  PictureInPicture,
  Zap,
  LogOut,
  User,
  X,
  Check,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Palette,
  Image as ImageIcon,
  Upload,
  Plus,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import Logo from "../components/Logo";
import {
  getDeviceIdentity,
  type DeviceIdentity,
} from "../lib/deviceIdentity";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { useState, useEffect } from "react";
import { useT } from "../lib/i18n";

interface SettingButtonProps {
  key?: any;
  icon: any;
  label: string;
  onClick?: () => void;
  variant?: "default" | "danger";
}

function SettingButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
}: SettingButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-5 rounded-lg text-left transition-all duration-200",
        variant === "danger"
          ? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
          : "border border-white/5 shadow-md hover:brightness-125",
      )}
      style={{
        backgroundColor:
          variant === "danger" ? undefined : "rgba(var(--primary-rgb), 0.8)",
      }}
    >
      <Icon
        className={cn(
          "w-6 h-6",
          variant === "danger" ? "text-red-500" : "text-white/90",
        )}
      />
      <span
        className={cn(
          "text-lg font-medium",
          variant === "danger" ? "text-red-500" : "text-white",
        )}
      >
        {label}
      </span>
    </motion.button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activePlaylist,
    isConnected,
    logout,
    clearCache,
    playlists,
    settings,
    updateSettings,
    clearHistory,
    playlistData,
    setActivePlaylist,
    removePlaylist,
  } = usePlaylist();
  const t = useT();
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(
    null,
  );

  const [activeModal, setActiveModal] = useState<
    | "none"
    | "parental"
    | "language"
    | "layout"
    | "hide-live"
    | "hide-vod"
    | "hide-series"
    | "sort"
    | "stream-format"
    | "subtitles"
    | "pip"
    | "pin-prompt"
    | "themes"
    | "playlists"
  >("none");
  const [pendingModal, setPendingModal] = useState<typeof activeModal>("none");
  const [pinInput, setPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [isPinSetup, setIsPinSetup] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isParentalManaging, setIsParentalManaging] = useState(false);
  const [categoryLockTab, setCategoryLockTab] = useState<
    "live" | "vod" | "series"
  >("live");

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

  useEffect(() => {
    if (location.state?.openModal) {
      setActiveModal(location.state.openModal);
      // Clear state to avoid reopening on back navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSettingClick = (label: string) => {
    if (label === "Change Playlist") {
      setActiveModal("playlists");
      return;
    }
    if (label === "Account Info") {
      navigate("/account");
      return;
    }
    if (label === "Logout") {
      logout();
      toast.success(t.loggedOutSuccess);
      navigate("/playlist-setup");
      return;
    }
    if (label === "Clear App Cache") {
      const confirmed = window.confirm(
        "Clear cached player data? The app will reload playlists and catalog data.",
      );
      if (!confirmed) return;
      clearCache();
      toast.success(t.playlistCacheCleared);
      return;
    }

    // Parental protected settings
    const protectedSettings = [
      "Parental Control",
      "Hide Live Categories",
      "Hide Vod Categories",
      "Hide Series Categories",
    ];

    if (
      protectedSettings.includes(label) &&
      settings.parentalPin &&
      !isVerified
    ) {
      setPendingModal(
        label === "Parental Control"
          ? "parental"
          : label === "Hide Live Categories"
            ? "hide-live"
            : label === "Hide Vod Categories"
              ? "hide-vod"
              : "hide-series",
      );
      setActiveModal("pin-prompt");
      return;
    }

    if (label === "Parental Control") {
      setActiveModal("parental");
      setIsPinSetup(!settings.parentalPin);
      return;
    }
    if (label === "Change Language") {
      setActiveModal("language");
      return;
    }
    if (label === "Change Layout") {
      setActiveModal("layout");
      return;
    }
    if (label === "Hide Live Categories") {
      setActiveModal("hide-live");
      return;
    }
    if (label === "Hide Vod Categories") {
      setActiveModal("hide-vod");
      return;
    }
    if (label === "Hide Series Categories") {
      setActiveModal("hide-series");
      return;
    }
    if (label === "Live Channel Sort") {
      setActiveModal("sort");
      return;
    }
    if (label === "Stream Format (HLS/TS)") {
      setActiveModal("stream-format");
      return;
    }
    if (label === "Automatic") {
      const newValue = !settings.autoPlay;
      updateSettings({ autoPlay: newValue });
      toast.success(
        `${t.autoPlaybackChanged}: ${newValue ? t.enabled : t.disabled}`,
      );
      return;
    }
    if (label === "Time Format") {
      const newFormat = settings.timeFormat === "12h" ? "24h" : "12h";
      updateSettings({ timeFormat: newFormat });
      toast.success(`${t.timeFormatChanged} ${newFormat}`);
      return;
    }
    if (label === "Subtitle Settings") {
      setActiveModal("subtitles");
      return;
    }
    if (label === "Themes") {
      setActiveModal("themes");
      return;
    }
    if (label === "PIP Settings") {
      setActiveModal("pip");
      return;
    }
    if (label.startsWith("Clear History")) {
      const type = label.includes("Channels")
        ? "live"
        : label.includes("Movies")
          ? "vod"
          : "series";
      clearHistory(type);
      return;
    }
    toast.info(`${label} ${t.settingsLocked}`);
  };

  const handlePinSubmit = () => {
    if (activeModal === "pin-prompt") {
      if (pinInput === settings.parentalPin) {
        setIsVerified(true);
        setActiveModal(pendingModal);
        setPinInput("");
      } else {
        toast.error(t.incorrectPin);
        setPinInput("");
      }
      return;
    }

    if (isPinSetup) {
      if (newPinInput.length === 4) {
        updateSettings({ parentalPin: newPinInput });
        toast.success(t.pinSet);
        setIsVerified(true);
        setIsParentalManaging(true);
        setNewPinInput("");
      } else {
        toast.error("PIN must be 4 digits");
      }
    } else {
      if (pinInput === settings.parentalPin) {
        toast.success(t.pinVerified);
        setIsVerified(true);
        setIsParentalManaging(true);
        setPinInput("");
      } else {
        toast.error(t.incorrectPin);
        setPinInput("");
      }
    }
  };

  const toggleCategoryLocked = (
    type: "live" | "vod" | "series",
    catId: string,
  ) => {
    const current = settings.parentalLockedCategories?.[type] || [];
    const updated = current.includes(catId)
      ? current.filter((id) => id !== catId)
      : [...current, catId];
    updateSettings({
      parentalLockedCategories: {
        ...(settings.parentalLockedCategories || {
          live: [],
          vod: [],
          series: [],
        }),
        [type]: updated,
      },
    });
  };

  const isCategoryLocked = (type: "live" | "vod" | "series", catId: string) =>
    (settings.parentalLockedCategories?.[type] || []).includes(catId);

  const getCategoriesForLockTab = () => {
    if (categoryLockTab === "live") return playlistData.liveCategories;
    if (categoryLockTab === "vod") return playlistData.vodCategories;
    return playlistData.seriesCategories;
  };

  const toggleCategoryHidden = (
    type: "live" | "vod" | "series",
    catId: string,
  ) => {
    const currentHidden = settings.hiddenCategories[type];
    const isHidden = currentHidden.includes(catId);
    const updated = isHidden
      ? currentHidden.filter((id) => id !== catId)
      : [...currentHidden, catId];

    updateSettings({
      hiddenCategories: {
        ...settings.hiddenCategories,
        [type]: updated,
      },
    });
  };

  const settings_list = [
    { icon: User, label: t.accountInfo, id: "Account Info" },
    { icon: Lock, label: t.parentalControl, id: "Parental Control" },
    { icon: ListRestart, label: t.changePlaylist, id: "Change Playlist" },
    { icon: Languages, label: t.changeLanguage, id: "Change Language" },
    { icon: LayoutGrid, label: t.changeLayout, id: "Change Layout" },
    { icon: EyeOff, label: t.hideLiveCategories, id: "Hide Live Categories" },
    { icon: EyeOff, label: t.hideVodCategories, id: "Hide Vod Categories" },
    {
      icon: EyeOff,
      label: t.hideSeriesCategories,
      id: "Hide Series Categories",
    },
    {
      icon: Trash2,
      label: t.clearHistoryChannels,
      id: "Clear History Channels",
    },
    { icon: Trash2, label: t.clearHistoryMovies, id: "Clear History Movies" },
    { icon: Trash2, label: t.clearHistorySeries, id: "Clear History Series" },
    { icon: Trash2, label: "Clear App Cache", id: "Clear App Cache" },
    { icon: SortAsc, label: t.liveChannelSort, id: "Live Channel Sort" },
    { icon: MonitorPlay, label: t.streamFormat, id: "Stream Format (HLS/TS)" },
    { icon: Zap, label: t.automatic, id: "Automatic" },
    { icon: Clock, label: t.timeFormat, id: "Time Format" },
    { icon: Palette, label: t.themes, id: "Themes" },
    { icon: Subtitles, label: t.subtitleSettings, id: "Subtitle Settings" },
    { icon: PictureInPicture, label: t.pipSettings, id: "PIP Settings" },
  ];

  // TV remote: back key navigates home
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (key === "back" || key === "backspace") navigate("/");
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [navigate]);

  return (
    <div className="flex flex-col min-h-screen p-8">
      {/* Header */}
      <div className="flex items-center gap-6 mb-12">
        <button
          onClick={() => navigate("/")}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ArrowLeft className="w-8 h-8" />
        </button>
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-2xl font-semibold text-white/80">
            | {t.settingsTitle}
          </span>
        </div>
      </div>

      {/* Account Info Section */}
      {isConnected && (
        <div className="mb-8 max-w-7xl mx-auto w-full">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
            <button
              onClick={() => navigate("/account")}
              className="flex items-center gap-4 hover:opacity-80 transition-opacity text-left"
            >
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{activePlaylist?.name}</h2>
                <p className="text-white/40">
                  {activePlaylist?.type === "xtream"
                    ? `Xtream: ${activePlaylist.host}`
                    : "M3U Playlist"}
                </p>
                <p className="text-primary text-xs font-bold mt-1">
                  Expires:{" "}
                  {activePlaylist?.accountInfo?.user.exp_date
                    ? IPTVService.formatExpiryDate(
                        activePlaylist.accountInfo.user.exp_date,
                      )
                    : t.unlimited}
                </p>
                {playlists.length > 1 && (
                  <p className="text-white/30 text-[10px] mt-0.5">
                    {playlists.length} servers configured
                  </p>
                )}
              </div>
            </button>
            <SettingButton
              icon={LogOut}
              label={t.logout}
              variant="danger"
              onClick={() => handleSettingClick("Logout")}
            />
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 gap-4 max-w-7xl mx-auto w-full pb-20">
        {settings_list.map((setting, index) => (
          <SettingButton
            key={index}
            icon={setting.icon}
            label={setting.label}
            onClick={() => handleSettingClick(setting.id)}
          />
        ))}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal !== "none" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => {
              setActiveModal("none");
              setIsParentalManaging(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "bg-zinc-900 w-full rounded-2xl border border-white/10 overflow-hidden shadow-2xl",
                activeModal === "parental" && isParentalManaging
                  ? "max-w-lg"
                  : "max-w-md",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  {activeModal === "parental" && (
                    <>
                      <Shield className="w-5 h-5 text-primary" />{" "}
                      {isParentalManaging
                        ? t.pinProtectedCategories
                        : t.parentalControlTitle}
                    </>
                  )}
                  {activeModal === "language" && (
                    <>
                      <Languages className="w-5 h-5 text-primary" />{" "}
                      {t.selectLanguage}
                    </>
                  )}
                  {activeModal === "layout" && (
                    <>
                      <LayoutGrid className="w-5 h-5 text-primary" />{" "}
                      {t.chooseLayout}
                    </>
                  )}
                  {activeModal === "hide-live" && (
                    <>
                      <EyeOff className="w-5 h-5 text-primary" />{" "}
                      {t.hideLiveCategories}
                    </>
                  )}
                  {activeModal === "hide-vod" && (
                    <>
                      <EyeOff className="w-5 h-5 text-primary" />{" "}
                      {t.hideVodCategories
                        .replace("Hide ", "")
                        .replace("Masquer ", "")
                        .replace("Ocultar ", "")
                        .replace("Nascondi ", "")
                        .replace("Ausblenden ", "") || t.hideVodCategories}
                    </>
                  )}
                  {activeModal === "hide-series" && (
                    <>
                      <EyeOff className="w-5 h-5 text-primary" />{" "}
                      {t.hideSeriesCategories}
                    </>
                  )}
                  {activeModal === "sort" && (
                    <>
                      <SortAsc className="w-5 h-5 text-primary" />{" "}
                      {t.channelSorting}
                    </>
                  )}
                  {activeModal === "stream-format" && (
                    <>
                      <MonitorPlay className="w-5 h-5 text-primary" />{" "}
                      {t.streamFormatTitle}
                    </>
                  )}
                  {activeModal === "subtitles" && (
                    <>
                      <Subtitles className="w-5 h-5 text-primary" />{" "}
                      {t.subtitleSettings}
                    </>
                  )}
                  {activeModal === "themes" && (
                    <>
                      <Palette className="w-5 h-5 text-primary" /> {t.themes}
                    </>
                  )}
                  {activeModal === "pip" && (
                    <>
                      <PictureInPicture className="w-5 h-5 text-primary" />{" "}
                      {t.pipSettings}
                    </>
                  )}
                  {activeModal === "playlists" && (
                    <>
                      <ListRestart className="w-5 h-5 text-primary" />{" "}
                      {t.managePlaylists}
                    </>
                  )}
                </h3>
                <button
                  onClick={() => {
                    setActiveModal("none");
                    setIsParentalManaging(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {activeModal === "pin-prompt" && (
                  <div className="flex flex-col gap-6 items-center py-4">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                      <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-white/60">{t.enterPinToAccess}</p>
                    </div>
                    <input
                      type="password"
                      maxLength={4}
                      autoFocus
                      placeholder="••••"
                      value={pinInput}
                      onChange={(e) =>
                        setPinInput(e.target.value.replace(/\D/g, ""))
                      }
                      onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                      className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={handlePinSubmit}
                      className="w-full bg-primary py-4 rounded-xl font-bold hover:bg-primary-hover transition-colors"
                    >
                      {t.verifyPin}
                    </button>
                  </div>
                )}

                {activeModal === "parental" && (
                  <div className="flex flex-col gap-6 items-center py-4">
                    {!isParentalManaging ? (
                      isPinSetup ? (
                        <>
                          <p className="text-center text-white/60">
                            {t.setPinDesc}
                          </p>
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="Enter New PIN"
                            value={newPinInput}
                            onChange={(e) =>
                              setNewPinInput(e.target.value.replace(/\D/g, ""))
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" && handlePinSubmit()
                            }
                            className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:border-primary"
                          />
                          <button
                            onClick={handlePinSubmit}
                            className="w-full bg-primary py-4 rounded-xl font-bold hover:bg-primary-hover transition-colors"
                          >
                            {t.setPin}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-center text-white/60">
                            {t.verifyPinDesc}
                          </p>
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="••••"
                            value={pinInput}
                            onChange={(e) =>
                              setPinInput(e.target.value.replace(/\D/g, ""))
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" && handlePinSubmit()
                            }
                            className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:border-primary"
                          />
                          <div className="flex gap-4 w-full">
                            <button
                              onClick={handlePinSubmit}
                              className="flex-1 bg-primary py-4 rounded-xl font-bold hover:bg-primary-hover transition-colors"
                            >
                              {t.verify}
                            </button>
                            <button
                              onClick={() => {
                                updateSettings({
                                  parentalPin: null,
                                  parentalLockedCategories: {
                                    live: [],
                                    vod: [],
                                    series: [],
                                  },
                                });
                                toast.info(t.pinRemoved);
                                setActiveModal("none");
                                setIsParentalManaging(false);
                              }}
                              className="flex-1 bg-white/5 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors"
                            >
                              {t.removePin}
                            </button>
                          </div>
                        </>
                      )
                    ) : (
                      /* Management Panel */
                      <div className="w-full flex flex-col gap-5">
                        {/* Status + Disable row */}
                        <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="w-5 h-5 text-green-400" />
                            <span className="font-bold text-green-400">
                              {t.parentalControlTitle}: {t.enabled}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              updateSettings({
                                parentalPin: null,
                                parentalLockedCategories: {
                                  live: [],
                                  vod: [],
                                  series: [],
                                },
                              });
                              toast.info(t.pinRemoved);
                              setActiveModal("none");
                              setIsParentalManaging(false);
                            }}
                            className="text-red-400 text-sm font-bold hover:text-red-300 transition-colors"
                          >
                            {t.disableParentalControl}
                          </button>
                        </div>

                        {/* PIN-protected categories */}
                        <div>
                          <p className="text-sm text-white/40 mb-1 uppercase tracking-wider font-bold">
                            {t.pinProtectedCategories}
                          </p>
                          <p className="text-xs text-white/30 mb-4">
                            {t.pinProtectedCategoriesDesc}
                          </p>

                          {/* Tabs */}
                          <div className="flex gap-2 mb-4">
                            {(
                              [
                                { id: "live" as const, label: t.live },
                                { id: "vod" as const, label: t.movies },
                                {
                                  id: "series" as const,
                                  label: t.series,
                                },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => setCategoryLockTab(tab.id)}
                                className={cn(
                                  "flex-1 py-2 rounded-lg text-sm font-bold transition-colors",
                                  categoryLockTab === tab.id
                                    ? "bg-primary text-white"
                                    : "bg-white/5 hover:bg-white/10 text-white/60",
                                )}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Category list */}
                          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                            {getCategoriesForLockTab().length === 0 ? (
                              <p className="text-center text-white/40 py-6 text-sm">
                                {t.noCategoriesFound}
                              </p>
                            ) : (
                              getCategoriesForLockTab().map((cat) => (
                                <button
                                  key={cat.category_id}
                                  onClick={() =>
                                    toggleCategoryLocked(
                                      categoryLockTab,
                                      cat.category_id,
                                    )
                                  }
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-xl transition-colors",
                                    isCategoryLocked(
                                      categoryLockTab,
                                      cat.category_id,
                                    )
                                      ? "bg-primary/20 border border-primary/40"
                                      : "bg-white/5 hover:bg-white/10",
                                  )}
                                >
                                  <span className="font-medium text-sm">
                                    {cat.category_name}
                                  </span>
                                  {isCategoryLocked(
                                    categoryLockTab,
                                    cat.category_id,
                                  ) ? (
                                    <Lock className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Unlock className="w-4 h-4 text-white/20" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeModal === "language" && (
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      "English",
                      "Français",
                      "Español",
                      "Deutsch",
                      "Italiano",
                      "Arabic",
                    ].map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          updateSettings({ language: lang.toLowerCase() });
                          toast.success(`${t.languageChanged} ${lang}`);
                          setActiveModal("none");
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl transition-colors",
                          settings.language === lang.toLowerCase()
                            ? "bg-primary text-white"
                            : "bg-white/5 hover:bg-white/10",
                        )}
                      >
                        <span className="font-medium">{lang}</span>
                        {settings.language === lang.toLowerCase() && (
                          <Check className="w-5 h-5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeModal === "layout" && (
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => {
                        updateSettings({ layout: "grid" });
                        setActiveModal("none");
                      }}
                      className={cn(
                        "flex items-center gap-4 p-6 rounded-xl border-2 transition-all",
                        settings.layout === "grid"
                          ? "border-primary bg-primary/10"
                          : "border-white/5 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <LayoutGrid className="w-8 h-8" />
                      <div className="text-left">
                        <p className="font-bold">{t.gridView}</p>
                        <p className="text-sm text-white/40">
                          {t.gridViewDesc}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        updateSettings({ layout: "list" });
                        setActiveModal("none");
                      }}
                      className={cn(
                        "flex items-center gap-4 p-6 rounded-xl border-2 transition-all",
                        settings.layout === "list"
                          ? "border-primary bg-primary/10"
                          : "border-white/5 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <ListRestart className="w-8 h-8" />
                      <div className="text-left">
                        <p className="font-bold">{t.listView}</p>
                        <p className="text-sm text-white/40">
                          {t.listViewDesc}
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {(activeModal === "hide-live" ||
                  activeModal === "hide-vod" ||
                  activeModal === "hide-series") && (
                  <div className="grid grid-cols-1 gap-2">
                    {(() => {
                      const type =
                        activeModal === "hide-live"
                          ? "live"
                          : activeModal === "hide-vod"
                            ? "vod"
                            : "series";
                      const categories =
                        type === "live"
                          ? playlistData.liveCategories
                          : type === "vod"
                            ? playlistData.vodCategories
                            : playlistData.seriesCategories;

                      if (categories.length === 0) {
                        return (
                          <p className="text-center text-white/40 py-8">
                            {t.noCategoriesFound}
                          </p>
                        );
                      }

                      return categories.map((cat) => (
                        <button
                          key={cat.category_id}
                          onClick={() =>
                            toggleCategoryHidden(type, cat.category_id)
                          }
                          className={cn(
                            "flex items-center justify-between p-4 rounded-xl transition-colors",
                            settings.hiddenCategories[type].includes(
                              cat.category_id,
                            )
                              ? "bg-red-500/20 text-red-500"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                        >
                          <span className="font-medium">
                            {cat.category_name}
                          </span>
                          {settings.hiddenCategories[type].includes(
                            cat.category_id,
                          ) ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Check className="w-5 h-5 opacity-20" />
                          )}
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {activeModal === "sort" && (
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "default", label: t.defaultOrder },
                      { id: "az", label: t.nameAZ },
                      { id: "za", label: t.nameZA },
                      { id: "added", label: t.recentlyAdded },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          updateSettings({ liveSort: option.id as any });
                          toast.success(`${t.sortingChanged} ${option.label}`);
                          setActiveModal("none");
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl transition-colors",
                          settings.liveSort === option.id
                            ? "bg-primary text-white"
                            : "bg-white/5 hover:bg-white/10",
                        )}
                      >
                        <span className="font-medium">{option.label}</span>
                        {settings.liveSort === option.id && (
                          <Check className="w-5 h-5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeModal === "stream-format" && (
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "ts", label: "MPEG-TS (.ts)" },
                      { id: "hls", label: "HLS (.m3u8)" },
                      { id: "mp4", label: "MP4 (.mp4)" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          updateSettings({ streamFormat: option.id as any });
                          toast.success(`${t.formatChanged} ${option.label}`);
                          setActiveModal("none");
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl transition-colors",
                          settings.streamFormat === option.id
                            ? "bg-primary text-white"
                            : "bg-white/5 hover:bg-white/10",
                        )}
                      >
                        <span className="font-medium">{option.label}</span>
                        {settings.streamFormat === option.id && (
                          <Check className="w-5 h-5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeModal === "subtitles" && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-sm text-white/40 mb-3 uppercase tracking-wider font-bold">
                        {t.subtitleFontSize}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "small", label: t.small },
                          { id: "medium", label: t.medium },
                          { id: "large", label: t.large },
                        ].map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() =>
                              updateSettings({ subtitleSize: id as any })
                            }
                            className={cn(
                              "py-3 rounded-xl transition-colors font-medium",
                              settings.subtitleSize === id
                                ? "bg-primary text-white"
                                : "bg-white/5 hover:bg-white/10",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-white/40 mb-3 uppercase tracking-wider font-bold">
                        {t.subtitleTextColor}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { id: "#ffffff", label: t.colorWhite },
                          { id: "#ffff00", label: t.colorYellow },
                          { id: "#00ffff", label: t.colorCyan },
                          { id: "#00ff00", label: t.colorGreen },
                        ].map((color) => (
                          <button
                            key={color.id}
                            onClick={() =>
                              updateSettings({ subtitleColor: color.id })
                            }
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl transition-colors",
                              settings.subtitleColor === color.id
                                ? "bg-primary text-white"
                                : "bg-white/5 hover:bg-white/10",
                            )}
                          >
                            <div
                              className="w-6 h-6 rounded-full border border-white/20"
                              style={{ backgroundColor: color.id }}
                            />
                            <span className="text-[10px]">{color.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeModal === "themes" && (
                  <div className="space-y-8">
                    <div>
                      <p className="text-sm text-white/40 mb-4 uppercase tracking-wider font-bold">
                        {t.accentColor}
                      </p>
                      <div className="grid grid-cols-5 gap-3">
                        {[
                          { id: "#8b0000", label: "Red" },
                          { id: "#2563eb", label: "Blue" },
                          { id: "#d4af37", label: "Gold" },
                          { id: "#059669", label: "Emerald" },
                          { id: "#7c3aed", label: "Purple" },
                        ].map((color) => (
                          <button
                            key={color.id}
                            onClick={() =>
                              updateSettings({ accentColor: color.id })
                            }
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2",
                            )}
                            style={{
                              backgroundColor:
                                settings.accentColor === color.id
                                  ? `rgba(var(--primary-rgb), 0.1)`
                                  : "rgba(255, 255, 255, 0.05)",
                              borderColor:
                                settings.accentColor === color.id
                                  ? "var(--primary-color)"
                                  : "transparent",
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded-full shadow-lg"
                              style={{ backgroundColor: color.id }}
                            />
                            <span className="text-[10px] font-medium">
                              {color.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-white/40 mb-4 uppercase tracking-wider font-bold">
                        {t.backgroundImage}
                      </p>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() =>
                              updateSettings({ backgroundImage: null })
                            }
                            className={cn(
                              "p-4 rounded-xl border-2 transition-all text-left",
                              !settings.backgroundImage
                                ? "border-primary bg-primary/10"
                                : "border-transparent bg-white/5 hover:bg-white/10",
                            )}
                          >
                            <p className="font-bold">Default</p>
                            <p className="text-xs text-white/40">
                              Original dark theme
                            </p>
                          </button>
                          <label
                            className={cn(
                              "p-4 rounded-xl border-2 transition-all text-left cursor-pointer relative overflow-hidden",
                              settings.backgroundImage
                                ? "border-primary bg-primary/10"
                                : "border-transparent bg-white/5 hover:bg-white/10",
                            )}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    updateSettings({
                                      backgroundImage: reader.result as string,
                                    });
                                    toast.success(t.backgroundUpdated);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <Upload className="w-4 h-4" />
                              <p className="font-bold">Upload</p>
                            </div>
                            <p className="text-xs text-white/40">
                              Custom image
                            </p>
                          </label>
                        </div>

                        {settings.backgroundImage && (
                          <div className="relative group rounded-xl overflow-hidden aspect-video border border-white/10">
                            <img
                              src={settings.backgroundImage}
                              alt="Custom background"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() =>
                                  updateSettings({ backgroundImage: null })
                                }
                                className="bg-red-500 p-2 rounded-full hover:bg-red-600 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeModal === "pip" && (
                  <div className="space-y-4">
                    <button
                      onClick={() => {
                        const newValue = !settings.pipEnabled;
                        updateSettings({ pipEnabled: newValue });
                        toast.success(
                          `PIP ${newValue ? "Enabled" : "Disabled"}`,
                        );
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-6 rounded-xl border-2 transition-all",
                        settings.pipEnabled
                          ? "border-primary bg-primary/10"
                          : "border-white/5 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <PictureInPicture className="w-8 h-8" />
                        <div className="text-left">
                          <p className="font-bold">{t.enablePip}</p>
                          <p className="text-sm text-white/40">
                            {t.watchWhileBrowsing}
                          </p>
                        </div>
                      </div>
                      {settings.pipEnabled ? (
                        <ShieldCheck className="w-6 h-6 text-primary" />
                      ) : (
                        <ShieldAlert className="w-6 h-6 text-white/20" />
                      )}
                    </button>
                  </div>
                )}

                {activeModal === "playlists" && (
                  <div className="space-y-4">
                    {playlists.map((playlist) => (
                      <div
                        key={playlist.id}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
                          activePlaylist?.id === playlist.id
                            ? "border-primary bg-primary/10"
                            : "border-white/5 bg-white/5",
                        )}
                      >
                        <button
                          onClick={() => {
                            if (activePlaylist?.id !== playlist.id) {
                              setActivePlaylist(playlist.id);
                              setActiveModal("none");
                              toast.success(
                                `${t.playlistSwitched} ${playlist.name}`,
                              );
                            }
                          }}
                          className="flex-1 text-left flex items-center gap-4"
                        >
                          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold">{playlist.name}</p>
                              {playlist.managedByBackend && (
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300 bg-sky-500/15 border border-sky-400/20 px-2 py-1 rounded-md">
                                  Managed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/40">
                              {playlist.type === "xtream"
                                ? playlist.host
                                : "M3U Playlist"}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          {activePlaylist?.id === playlist.id && (
                            <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/20 rounded-md">
                              {t.active_playlist}
                            </span>
                          )}
                          {playlist.managedByBackend ? (
                            <span className="text-[11px] text-white/35 px-2 py-1">
                              Synced from backend
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removePlaylist(playlist.id);
                                toast.success(t.playlistRemovedMsg);
                              }}
                              className="p-2 hover:bg-red-500/20 text-red-500 rounded-full transition-colors"
                              title="Remove Playlist"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        setActiveModal("none");
                        navigate("/playlist-setup");
                      }}
                      className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all mt-4"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-bold">{t.addNewPlaylist}</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="mt-auto flex flex-col items-center gap-1 text-white/40 text-sm">
        <span>Mac Address: {deviceIdentity?.macAddress || "Loading..."}</span>
        <span>Device Key: {deviceIdentity?.deviceKey || "Loading..."}</span>
        <span className="mt-2">Version : 1.7.2.0</span>
      </div>
    </div>
  );
}
