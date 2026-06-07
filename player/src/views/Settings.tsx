import {
  ArrowLeft,
  Check,
  Clock,
  EyeOff,
  Languages,
  LayoutGrid,
  ListRestart,
  Lock,
  LogOut,
  MonitorPlay,
  Palette,
  PictureInPicture,
  Plus,
  ShieldAlert,
  ShieldCheck,
  SortAsc,
  Subtitles,
  Trash2,
  Unlock,
  User,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { getDeviceIdentity, type DeviceIdentity } from "../lib/deviceIdentity";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { useT } from "../lib/i18n";
import { focusNext, useTVRemote } from "../lib/remote";

type Section =
  | "group-account"
  | "group-playlist"
  | "group-security"
  | "group-appearance"
  | "group-playback"
  | "group-data"
  | "account"
  | "playlists"
  | "parental"
  | "pin-prompt"
  | "language"
  | "layout"
  | "hide-live"
  | "hide-vod"
  | "hide-series"
  | "sort"
  | "stream-format"
  | "subtitles"
  | "themes"
  | "pip";

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

  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("group-account");
  const [pendingSection, setPendingSection] = useState<Section>("parental");
  const [pinInput, setPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [isPinSetup, setIsPinSetup] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isParentalManaging, setIsParentalManaging] = useState(false);
  const [categoryLockTab, setCategoryLockTab] = useState<"live" | "vod" | "series">("live");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const focusFirstContentOption = () => {
    const first = contentRef.current?.querySelector<HTMLElement>(
      "[data-tv-focusable]:not([disabled]), button:not([disabled]):not([tabindex='-1']), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    if (!first) return;
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  useEffect(() => {
    let active = true;
    getDeviceIdentity()
      .then((identity) => {
        if (active) setDeviceIdentity(identity);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.state?.openModal === "playlists") {
      setActiveSection("playlists");
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const groupList = [
    { icon: User, label: t.account, id: "group-account" as const },
    { icon: ListRestart, label: t.changePlaylist, id: "group-playlist" as const },
    { icon: Lock, label: t.security, id: "group-security" as const },
    { icon: Palette, label: t.appearance, id: "group-appearance" as const },
    { icon: MonitorPlay, label: t.playback, id: "group-playback" as const },
    { icon: Trash2, label: t.data, id: "group-data" as const },
  ];

  const toSection = (id: string): Section | null => {
    if (id === "Account Info") return "account";
    if (id === "Parental Control") return "parental";
    if (id === "Change Playlist") return "playlists";
    if (id === "Change Language") return "language";
    if (id === "Change Layout") return "layout";
    if (id === "Hide Live Categories") return "hide-live";
    if (id === "Hide Vod Categories") return "hide-vod";
    if (id === "Hide Series Categories") return "hide-series";
    if (id === "Live Channel Sort") return "sort";
    if (id === "Stream Format (HLS/TS)") return "stream-format";
    if (id === "Subtitle Settings") return "subtitles";
    if (id === "Themes") return "themes";
    if (id === "PIP Settings") return "pip";
    return null;
  };

  const parentForSection = (section: Section): Section => {
    if (section === "account") return "group-account";
    if (section === "playlists") return "group-playlist";
    if (section === "parental" || section === "pin-prompt" || section === "hide-live" || section === "hide-vod" || section === "hide-series") {
      return "group-security";
    }
    if (section === "language" || section === "layout" || section === "subtitles" || section === "themes") {
      return "group-appearance";
    }
    if (section === "sort" || section === "stream-format" || section === "pip") {
      return "group-playback";
    }
    if (section.startsWith("group-")) return section;
    return "group-account";
  };

  const handlePinSubmit = () => {
    if (activeSection === "pin-prompt") {
      if (pinInput === settings.parentalPin) {
        setIsVerified(true);
        setActiveSection(pendingSection);
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
    } else if (pinInput === settings.parentalPin) {
      setIsVerified(true);
      setIsParentalManaging(true);
      setPinInput("");
      toast.success(t.pinVerified);
    } else {
      toast.error(t.incorrectPin);
      setPinInput("");
    }
  };

  const handleSettingClick = (id: string) => {
    if (id === "Logout") {
      logout();
      toast.success(t.loggedOutSuccess);
      navigate("/playlist-setup");
      return;
    }

    if (id === "Clear App Cache") {
      const confirmed = window.confirm("Clear cached player data? The app will reload playlists and catalog data.");
      if (!confirmed) return;
      clearCache();
      toast.success(t.playlistCacheCleared);
      return;
    }

    if (id === "Automatic") {
      const newValue = !settings.autoPlay;
      updateSettings({ autoPlay: newValue });
      toast.success(`${t.autoPlaybackChanged}: ${newValue ? t.enabled : t.disabled}`);
      return;
    }

    if (id === "Time Format") {
      const next = settings.timeFormat === "12h" ? "24h" : "12h";
      updateSettings({ timeFormat: next });
      toast.success(`${t.timeFormatChanged} ${next}`);
      return;
    }

    if (id.startsWith("Clear History")) {
      const type = id.includes("Channels") ? "live" : id.includes("Movies") ? "vod" : "series";
      clearHistory(type);
      return;
    }

    const section = toSection(id);
    if (!section) return;

    const protectedSettings = ["parental", "hide-live", "hide-vod", "hide-series"] as const;
    const protectedSection = protectedSettings.find((value) => value === section);
    if (protectedSection && settings.parentalPin && !isVerified) {
      setPendingSection(protectedSection);
      setActiveSection("pin-prompt");
      return;
    }

    if (section === "parental") {
      setIsPinSetup(!settings.parentalPin);
    }

    setActiveSection(section);
  };

  const toggleCategoryHidden = (type: "live" | "vod" | "series", catId: string) => {
    const currentHidden = settings.hiddenCategories[type];
    const updated = currentHidden.includes(catId)
      ? currentHidden.filter((id) => id !== catId)
      : [...currentHidden, catId];

    updateSettings({
      hiddenCategories: {
        ...settings.hiddenCategories,
        [type]: updated,
      },
    });
  };

  const toggleCategoryLocked = (type: "live" | "vod" | "series", catId: string) => {
    const current = settings.parentalLockedCategories?.[type] || [];
    const updated = current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId];
    updateSettings({
      parentalLockedCategories: {
        ...(settings.parentalLockedCategories || { live: [], vod: [], series: [] }),
        [type]: updated,
      },
    });
  };

  const getCategoriesForLockTab = () => {
    if (categoryLockTab === "live") return playlistData.liveCategories;
    if (categoryLockTab === "vod") return playlistData.vodCategories;
    return playlistData.seriesCategories;
  };

  const goBack = () => {
    if (activeSection.startsWith("group-")) {
      if (activeSection !== "group-account") {
        setActiveSection("group-account");
      } else {
        navigate("/");
      }
    } else {
      setActiveSection(parentForSection(activeSection));
      setIsParentalManaging(false);
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (key === "back" || key === "red") {
        goBack();
      }
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [activeSection, navigate]);

  useEffect(() => {
    const immediate = window.setTimeout(() => {
      window.requestAnimationFrame(focusFirstContentOption);
    }, 0);
    // webOS/Tizen browsers can keep the exiting panel mounted until the motion
    // transition completes, so run one delayed focus pass for the entered panel.
    const afterTransition = window.setTimeout(focusFirstContentOption, 260);
    return () => {
      window.clearTimeout(immediate);
      window.clearTimeout(afterTransition);
    };
  }, [activeSection]);

  useTVRemote((key) => {
    const navRoot = rootRef.current;
    if (key === "left" || key === "right" || key === "up" || key === "down") {
      if (activeSection === "playlists" && (key === "left" || key === "right")) {
        const active = document.activeElement as HTMLElement | null;
        const row = active?.closest<HTMLElement>("[data-playlist-row]");
        if (row && key === "right" && active?.matches("[data-playlist-main]")) {
          const deleteButton = row.querySelector<HTMLElement>("[data-playlist-delete]");
          if (deleteButton) {
            deleteButton.focus({ preventScroll: true });
            return;
          }
        }
        if (row && key === "left" && active?.matches("[data-playlist-delete]")) {
          row.querySelector<HTMLElement>("[data-playlist-main]")?.focus({ preventScroll: true });
          return;
        }
      }
      focusNext(key, { root: navRoot });
      return;
    }

    if (key === "enter" || key === "select") {
      const active = document.activeElement as HTMLElement | null;
      if (active && navRoot?.contains(active)) active.click();
    }
  });

  const sectionTitle = (() => {
    if (activeSection === "group-account") return t.account;
    if (activeSection === "group-playlist") return t.changePlaylist;
    if (activeSection === "group-security") return t.security;
    if (activeSection === "group-appearance") return t.appearance;
    if (activeSection === "group-playback") return t.playback;
    if (activeSection === "group-data") return t.data;
    if (activeSection === "account") return t.accountInfo;
    if (activeSection === "playlists") return t.managePlaylists;
    if (activeSection === "parental") return t.parentalControlTitle;
    if (activeSection === "pin-prompt") return t.verifyPin;
    if (activeSection === "language") return t.selectLanguage;
    if (activeSection === "layout") return t.chooseLayout;
    if (activeSection === "hide-live") return t.hideLiveCategories;
    if (activeSection === "hide-vod") return t.hideVodCategories;
    if (activeSection === "hide-series") return t.hideSeriesCategories;
    if (activeSection === "sort") return t.channelSorting;
    if (activeSection === "stream-format") return t.streamFormatTitle;
    if (activeSection === "subtitles") return t.subtitleSettings;
    if (activeSection === "themes") return t.themes;
    if (activeSection === "pip") return t.pipSettings;
    return t.settingsTitle;
  })();

  const sectionParentTitle = (() => {
    if (activeSection.startsWith("group-")) return t.settingsTitle;
    const parent = parentForSection(activeSection);
    if (parent === "group-account") return t.account;
    if (parent === "group-playlist") return t.changePlaylist;
    if (parent === "group-security") return t.security;
    if (parent === "group-appearance") return t.appearance;
    if (parent === "group-playback") return t.playback;
    if (parent === "group-data") return t.data;
    return t.settingsTitle;
  })();

  const sectionSubtitle = (() => {
    if (activeSection === "group-account") return t.accountSectionDesc;
    if (activeSection === "group-playlist") return t.playlistSectionDesc;
    if (activeSection === "group-security") return t.securitySectionDesc;
    if (activeSection === "group-appearance") return t.appearanceSectionDesc;
    if (activeSection === "group-playback") return t.playbackSectionDesc;
    if (activeSection === "group-data") return t.dataSectionDesc;
    return t.preferencesSavedInstantly;
  })();

  return (
    <div ref={rootRef} className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_8%_8%,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_92%_0%,rgba(148,163,184,0.14),transparent_30%),linear-gradient(170deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))] p-8">
      <div className="mb-10 flex items-center gap-6">
        <button
          data-tv-focusable
          onClick={() => goBack()}
          className="group rounded-full p-3 transition-all hover:bg-white/20 hover:scale-110 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]"
          title="Go back (Remote: Back/Red Button)"
        >
          <ArrowLeft className="h-8 w-8 transition-transform group-hover:scale-110" />
        </button>
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-2xl font-semibold text-white/80">| {t.settingsTitle}</span>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[350px_minmax(0,1fr)] gap-6 pb-16">
        <aside className="rounded-3xl border border-white/15 bg-white/[0.04] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">{t.settingsTitle}</div>
          <div className="space-y-2">
            {groupList.map((group, idx) => {
              const selected = group.id === activeSection;
              const Icon = group.icon;
              return (
                <button
                  key={group.id}
                  data-tv-focusable
                  data-tv-initial-focus={idx === 0 ? "true" : undefined}
                  onClick={() => setActiveSection(group.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200",
                    selected
                      ? "border-white/20 bg-white/[0.12] text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                      : "border-white/10 bg-white/[0.025] text-white/80 hover:-translate-y-0.5 hover:bg-white/[0.08]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                      selected ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="truncate text-sm font-medium tracking-wide">{group.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex-1">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                {sectionParentTitle}
                {!activeSection.startsWith("group-") && <span className="px-2 text-white/25">/</span>}
                {!activeSection.startsWith("group-") && <span className="text-white/65">{sectionTitle}</span>}
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">{sectionTitle}</h3>
              <p className="mt-1 text-sm text-white/45">{sectionSubtitle}</p>
            </div>
            {!activeSection.startsWith("group-") && (
              <button
                data-tv-focusable
                onClick={() => goBack()}
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/60 transition-all hover:bg-white/15 hover:-translate-y-0.5 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]"
                title="Back to parent section (Remote: Back button)"
              >
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              ref={contentRef}
              key={activeSection}
              initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(3px)" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onAnimationComplete={focusFirstContentOption}
              className="space-y-4"
            >
            {activeSection === "group-account" && (
              <div className="grid w-full grid-cols-1 gap-2">
                <button data-tv-focusable onClick={() => setActiveSection("account")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.accountInfo}</span>
                  <User className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Logout")} className="flex items-center justify-between rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-red-300 transition-all hover:-translate-y-0.5 hover:bg-red-500/20">
                  <span className="font-medium">{t.logout}</span>
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            )}

            {activeSection === "group-playlist" && (
              <div className="grid w-full grid-cols-1 gap-2">
                <button data-tv-focusable onClick={() => setActiveSection("playlists")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.managePlaylists}</span>
                  <ListRestart className="h-5 w-5 text-white/60" />
                </button>
              </div>
            )}

            {activeSection === "group-security" && (
              <div className="grid w-full grid-cols-1 gap-2">
                <button data-tv-focusable onClick={() => handleSettingClick("Parental Control")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.parentalControl}</span>
                  <Lock className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Hide Live Categories")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.hideLiveCategories}</span>
                  <EyeOff className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Hide Vod Categories")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.hideVodCategories}</span>
                  <EyeOff className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Hide Series Categories")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.hideSeriesCategories}</span>
                  <EyeOff className="h-5 w-5 text-white/60" />
                </button>
              </div>
            )}

            {activeSection === "group-appearance" && (
              <div className="grid w-full grid-cols-1 gap-2">
                <button data-tv-focusable onClick={() => setActiveSection("language")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.changeLanguage}</span>
                  <Languages className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => setActiveSection("layout")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.changeLayout}</span>
                  <LayoutGrid className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => setActiveSection("themes")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.themes}</span>
                  <Palette className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => setActiveSection("subtitles")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.subtitleSettings}</span>
                  <Subtitles className="h-5 w-5 text-white/60" />
                </button>
              </div>
            )}

            {activeSection === "group-playback" && (
              <div className="grid w-full grid-cols-1 gap-4">
                <button data-tv-focusable onClick={() => setActiveSection("sort")} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/15 hover:border-white/20 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                  <span className="text-base font-semibold">{t.liveChannelSort}</span>
                  <SortAsc className="h-6 w-6 text-white/60 transition-transform group-hover:scale-110" />
                </button>
                <button data-tv-focusable onClick={() => setActiveSection("stream-format")} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/15 hover:border-white/20 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                  <span className="text-base font-semibold">{t.streamFormat}</span>
                  <MonitorPlay className="h-6 w-6 text-white/60 transition-transform group-hover:scale-110" />
                </button>
                <button data-tv-focusable onClick={() => setActiveSection("pip")} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/15 hover:border-white/20 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                  <span className="text-base font-semibold">{t.pipSettings}</span>
                  <PictureInPicture className="h-6 w-6 text-white/60 transition-transform group-hover:scale-110" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Automatic")} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/15 hover:border-white/20 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                  <span className="text-base font-semibold">{t.automatic}</span>
                  <Zap className="h-6 w-6 text-white/60 transition-transform group-hover:scale-110" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Time Format")} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/15 hover:border-white/20 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                  <span className="text-base font-semibold">{t.timeFormat}</span>
                  <Clock className="h-6 w-6 text-white/60 transition-transform group-hover:scale-110" />
                </button>
              </div>
            )}

            {activeSection === "group-data" && (
              <div className="grid w-full grid-cols-1 gap-2">
                <button data-tv-focusable onClick={() => handleSettingClick("Clear History Channels")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.clearHistoryChannels}</span>
                  <Trash2 className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Clear History Movies")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.clearHistoryMovies}</span>
                  <Trash2 className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Clear History Series")} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  <span className="font-medium">{t.clearHistorySeries}</span>
                  <Trash2 className="h-5 w-5 text-white/60" />
                </button>
                <button data-tv-focusable onClick={() => handleSettingClick("Clear App Cache")} className="flex items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-200 transition-all hover:-translate-y-0.5 hover:bg-amber-500/20">
                  <span className="font-medium">Clear App Cache</span>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            )}

            {activeSection === "account" && (
              <div className="w-full space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <div className="flex items-center gap-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                      <User className="h-10 w-10 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold">{activePlaylist?.name}</h2>
                      <p className="text-white/40">{activePlaylist?.type === "xtream" ? `Xtream: ${activePlaylist.host}` : "M3U Playlist"}</p>
                      <p className="mt-1 text-xs font-bold text-primary">
                        Expires: {activePlaylist?.accountInfo?.user.exp_date ? IPTVService.formatExpiryDate(activePlaylist.accountInfo.user.exp_date) : t.unlimited}
                      </p>
                    </div>
                  </div>
                </div>
                <button data-tv-focusable onClick={() => handleSettingClick("Logout")} className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-base font-semibold text-red-300 transition-all hover:bg-red-500/20 hover:-translate-y-1">
                  {t.logout}
                </button>
              </div>
            )}

            {activeSection === "playlists" && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                {playlists.map((playlist) => (
                  <div key={playlist.id} data-playlist-row className={cn("flex items-center justify-between gap-4 rounded-2xl border p-5 transition-all", activePlaylist?.id === playlist.id ? "border-white/25 bg-white/[0.10] shadow-[0_8px_24px_rgba(0,0,0,0.25)]" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.08]")}>  
                    <button
                      data-tv-focusable
                      data-playlist-main
                      onClick={() => {
                        if (activePlaylist?.id !== playlist.id) {
                          setActivePlaylist(playlist.id);
                          toast.success(`${t.playlistSwitched} ${playlist.name}`);
                        }
                      }}
                      className="flex flex-1 items-center gap-4 text-left transition-all hover:-translate-y-0.5 focus:outline-none focus:shadow-[0_0_0_2px_rgba(66,133,244,0.15),0_0_24px_rgba(66,133,244,0.35)]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/8">
                        <User className="h-6 w-6 text-white/80" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white/92">{playlist.name}</p>
                        <p className="truncate text-sm text-white/48">{playlist.type === "xtream" ? playlist.host : "M3U Playlist"}</p>
                      </div>
                    </button>
                    {!playlist.managedByBackend && (
                      <button
                        data-tv-focusable
                        data-playlist-delete
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlaylist(playlist.id);
                          toast.success(t.playlistRemovedMsg);
                        }}
                        className="rounded-full border border-red-500/25 bg-red-500/10 p-3 text-red-400 transition-all hover:bg-red-500/20 hover:scale-110 focus:outline-none focus:shadow-[0_0_0_2px_rgba(239,68,68,0.20),0_0_24px_rgba(239,68,68,0.35)]"
                        title="Remove Playlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button data-tv-focusable onClick={() => navigate("/playlist-setup")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/30 bg-white/[0.03] p-4 text-white/80 transition-all hover:bg-white/[0.09]">
                  <Plus className="h-5 w-5" />
                  <span className="font-bold">{t.addNewPlaylist}</span>
                </button>
              </div>
            )}

            {activeSection === "language" && (
              <div className="grid w-full grid-cols-1 gap-4">
                {["English", "Francais", "Espanol", "Deutsch", "Italiano", "Arabic"].map((lang) => (
                  <button
                    key={lang}
                    data-tv-focusable
                    onClick={() => {
                      updateSettings({ language: lang.toLowerCase() });
                      toast.success(`${t.languageChanged} ${lang}`);
                    }}
                    className={cn("flex items-center justify-between rounded-xl p-5 text-base font-semibold transition-all hover:-translate-y-1", settings.language === lang.toLowerCase() ? "bg-white/15 text-white shadow-lg" : "bg-white/5 hover:bg-white/15")}
                  >
                    <span>{lang}</span>
                    {settings.language === lang.toLowerCase() && <Check className="h-6 w-6" />}
                  </button>
                ))}
              </div>
            )}

            {activeSection === "layout" && (
              <div className="grid w-full grid-cols-1 gap-4">
                <button data-tv-focusable onClick={() => updateSettings({ layout: "grid" })} className={cn("rounded-xl border-2 p-4 text-left transition-all hover:bg-white/10", settings.layout === "grid" ? "border-white/30 bg-white/15" : "border-white/10 bg-white/5")}>{t.gridView}</button>
                <button data-tv-focusable onClick={() => updateSettings({ layout: "list" })} className={cn("rounded-xl border-2 p-4 text-left transition-all hover:bg-white/10", settings.layout === "list" ? "border-white/30 bg-white/15" : "border-white/10 bg-white/5")}>{t.listView}</button>
              </div>
            )}

            {(activeSection === "hide-live" || activeSection === "hide-vod" || activeSection === "hide-series") && (
              <div className="grid w-full grid-cols-1 gap-3">
                {(() => {
                  const type = activeSection === "hide-live" ? "live" : activeSection === "hide-vod" ? "vod" : "series";
                  const categories = type === "live" ? playlistData.liveCategories : type === "vod" ? playlistData.vodCategories : playlistData.seriesCategories;
                  if (categories.length === 0) return <p className="py-8 text-center text-white/40">{t.noCategoriesFound}</p>;
                  return categories.map((cat) => (
                    <button key={cat.category_id} data-tv-focusable onClick={() => toggleCategoryHidden(type, cat.category_id)} className={cn("flex items-center justify-between rounded-xl p-5 text-base font-semibold transition-all hover:-translate-y-0.5", settings.hiddenCategories[type].includes(cat.category_id) ? "bg-red-500/20 text-red-400" : "bg-white/5 hover:bg-white/15")}>
                      <span>{cat.category_name}</span>
                      {settings.hiddenCategories[type].includes(cat.category_id) ? <EyeOff className="h-5 w-5" /> : <Check className="h-5 w-5 opacity-20" />}
                    </button>
                  ));
                })()}
              </div>
            )}

            {activeSection === "sort" && (
              <div className="grid w-full grid-cols-1 gap-4">
                {[{ id: "default", label: t.defaultOrder }, { id: "az", label: t.nameAZ }, { id: "za", label: t.nameZA }, { id: "added", label: t.recentlyAdded }].map((option) => (
                  <button key={option.id} data-tv-focusable onClick={() => updateSettings({ liveSort: option.id as any })} className={cn("flex items-center justify-between rounded-xl p-5 text-base font-semibold transition-all hover:-translate-y-1", settings.liveSort === option.id ? "bg-white/15 text-white shadow-lg" : "bg-white/5 hover:bg-white/15")}>
                    <span>{option.label}</span>
                    {settings.liveSort === option.id && <Check className="h-6 w-6" />}
                  </button>
                ))}
              </div>
            )}

            {activeSection === "stream-format" && (
              <div className="grid w-full grid-cols-1 gap-4">
                {[{ id: "ts", label: "MPEG-TS (.ts)" }, { id: "hls", label: "HLS (.m3u8)" }, { id: "mp4", label: "MP4 (.mp4)" }].map((option) => (
                  <button key={option.id} data-tv-focusable onClick={() => updateSettings({ streamFormat: option.id as any })} className={cn("flex items-center justify-between rounded-xl p-5 text-base font-semibold transition-all hover:-translate-y-1", settings.streamFormat === option.id ? "bg-white/15 text-white shadow-lg" : "bg-white/5 hover:bg-white/15")}>
                    <span>{option.label}</span>
                    {settings.streamFormat === option.id && <Check className="h-6 w-6" />}
                  </button>
                ))}
              </div>
            )}

            {activeSection === "subtitles" && (
              <div className="grid w-full grid-cols-1 gap-5">
                <p className="text-sm font-bold uppercase tracking-wider text-white/45">{t.subtitleFontSize}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[{ id: "small", label: t.small }, { id: "medium", label: t.medium }, { id: "large", label: t.large }].map(({ id, label }) => (
                    <button key={id} data-tv-focusable onClick={() => updateSettings({ subtitleSize: id as any })} className={cn("rounded-xl py-4 text-base font-semibold transition-all hover:-translate-y-0.5", settings.subtitleSize === id ? "bg-white/15 text-white shadow-lg" : "bg-white/5 hover:bg-white/15")}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "themes" && (
              <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {[{ id: "#8b0000", label: "Red" }, { id: "#2563eb", label: "Blue" }, { id: "#d4af37", label: "Gold" }, { id: "#059669", label: "Emerald" }, { id: "#7c3aed", label: "Purple" }].map((color) => (
                  <button key={color.id} data-tv-focusable onClick={() => updateSettings({ accentColor: color.id })} className={cn("rounded-xl border-2 p-4 text-center transition-all hover:-translate-y-1 hover:scale-105", settings.accentColor === color.id ? "border-white/40 bg-white/12 shadow-lg scale-105" : "border-white/10 bg-white/5")}>
                    <div className="mx-auto mb-3 h-10 w-10 rounded-full transition-transform hover:scale-110" style={{ backgroundColor: color.id }} />
                    <span className="text-xs font-semibold">{color.label}</span>
                  </button>
                ))}
              </div>
            )}

            {activeSection === "pip" && (
              <button data-tv-focusable onClick={() => updateSettings({ pipEnabled: !settings.pipEnabled })} className={cn("w-full rounded-2xl border-2 p-5 text-left transition-all hover:bg-white/10", settings.pipEnabled ? "border-white/30 bg-white/15 shadow-[0_10px_24px_rgba(0,0,0,0.25)]" : "border-white/10 bg-white/5")}>{t.enablePip}</button>
            )}

            {activeSection === "parental" && (
              <div className="w-full space-y-4">
                {!isParentalManaging ? (
                  <>
                    <p className="text-white/60">{isPinSetup ? t.setPinDesc : t.verifyPinDesc}</p>
                    <input
                      type="password"
                      maxLength={4}
                      value={isPinSetup ? newPinInput : pinInput}
                      onChange={(e) => (isPinSetup ? setNewPinInput(e.target.value.replace(/\D/g, "")) : setPinInput(e.target.value.replace(/\D/g, "")))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center text-3xl tracking-[1em]"
                    />
                    <button data-tv-focusable onClick={handlePinSubmit} className="rounded-xl bg-primary px-6 py-3 font-bold">{isPinSetup ? t.setPin : t.verify}</button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-green-500/20 bg-green-500/10 p-4">
                      <span className="font-bold text-green-300">{t.parentalControlTitle}: {t.enabled}</span>
                      <button
                        data-tv-focusable
                        onClick={() => {
                          updateSettings({ parentalPin: null, parentalLockedCategories: { live: [], vod: [], series: [] } });
                          setIsParentalManaging(false);
                        }}
                        className="text-sm font-bold text-red-300"
                      >
                        {t.disableParentalControl}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      {[{ id: "live" as const, label: t.live }, { id: "vod" as const, label: t.movies }, { id: "series" as const, label: t.series }].map((tab) => (
                        <button key={tab.id} data-tv-focusable onClick={() => setCategoryLockTab(tab.id)} className={cn("flex-1 rounded-lg py-2 text-sm font-bold transition-all", categoryLockTab === tab.id ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}>{tab.label}</button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {getCategoriesForLockTab().map((cat) => {
                        const locked = (settings.parentalLockedCategories?.[categoryLockTab] || []).includes(cat.category_id);
                        return (
                          <button
                            key={cat.category_id}
                            data-tv-focusable
                            onClick={() => toggleCategoryLocked(categoryLockTab, cat.category_id)}
                            className={cn("flex items-center justify-between rounded-xl p-5 text-base font-semibold transition-all hover:-translate-y-0.5", locked ? "border border-white/20 bg-white/12" : "bg-white/5 hover:bg-white/15")}
                          >
                            <span>{cat.category_name}</span>
                            {locked ? <Lock className="h-5 w-5 text-primary" /> : <Unlock className="h-5 w-5 text-white/35" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 text-sm text-white/40">
        <span>Mac Address: {deviceIdentity?.macAddress || "Loading..."}</span>
        <span>Device Key: {deviceIdentity?.deviceKey || "Loading..."}</span>
        <span className="mt-2">Version : 1.0.0</span>
      </div>
    </div>
  );
}
