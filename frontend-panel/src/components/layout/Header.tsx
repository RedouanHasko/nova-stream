import {
  AppWindow,
  ArrowUpRight,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Languages,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  MonitorPlay,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { useSidebar } from "../../contexts/SidebarContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import api from "../../lib/api";
import {
  isCreditsNotification,
  resolveNotificationTarget,
} from "../../lib/utils";

const LANGUAGE_OPTIONS = [
  { code: "EN", label: "English" },
  { code: "FR", label: "Français" },
  { code: "AR", label: "العربية" },
] as const;

type SearchSuggestion = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  roles?: string[];
  path: string;
  tab?: string;
  search?: string;
  type?: string;
};

const NAV_SEARCH_ITEMS: SearchSuggestion[] = [
  {
    id: "dashboard",
    group: "Quick Access",
    title: "Dashboard",
    subtitle: "Open the main overview page",
    keywords: ["home", "overview", "summary", "stats"],
    path: "/",
    type: "dashboard",
  },
  {
    id: "devices-check",
    group: "Device Management",
    title: "Check MAC",
    subtitle: "Verify a device MAC address and key",
    keywords: ["mac", "activation", "check", "device"],
    path: "/devices",
    tab: "check",
    type: "tool",
  },
  {
    id: "devices-switch",
    group: "Device Management",
    title: "Switch MAC",
    subtitle: "Move an activation to a new device",
    keywords: ["switch", "replace", "mac", "device"],
    path: "/devices",
    tab: "switch",
    type: "tool",
  },
  {
    id: "devices-list",
    group: "Device Management",
    title: "Activated Apps List",
    subtitle: "Browse activated devices and apps",
    keywords: ["devices", "list", "activations", "apps"],
    path: "/devices",
    tab: "list",
    type: "tool",
  },
  {
    id: "devices-add-playlist",
    group: "Device Management",
    title: "Add Playlist",
    subtitle: "Assign a playlist to a device",
    keywords: ["playlist", "assign", "m3u"],
    path: "/devices",
    tab: "add-playlist",
    type: "tool",
  },
  {
    id: "devices-reset-playlist",
    group: "Device Management",
    title: "Reset Playlist",
    subtitle: "Reset a device playlist configuration",
    keywords: ["playlist", "reset", "device"],
    path: "/devices",
    tab: "reset-playlist",
    type: "tool",
  },
  {
    id: "devices-direct",
    group: "Device Management",
    title: "Direct Subscriptions",
    subtitle: "Manage direct client activations",
    keywords: ["direct", "subscriptions", "clients"],
    path: "/devices",
    tab: "direct",
    roles: ["superadmin"],
    type: "tool",
  },
  {
    id: "devices-domain",
    group: "Device Management",
    title: "Change Domain Url",
    subtitle: "Update the device portal domain",
    keywords: ["domain", "url", "portal"],
    path: "/devices",
    tab: "domain",
    roles: ["superadmin"],
    type: "tool",
  },
  {
    id: "resellers-list",
    group: "Resellers",
    title: "Reseller List",
    subtitle: "Browse resellers and sub-resellers",
    keywords: ["reseller", "subreseller", "users"],
    path: "/resellers",
    tab: "list",
    roles: ["superadmin", "reseller"],
    type: "tool",
  },
  {
    id: "resellers-add",
    group: "Resellers",
    title: "Add Reseller",
    subtitle: "Create a new main reseller account",
    keywords: ["create reseller", "new reseller"],
    path: "/resellers",
    tab: "add-reseller",
    roles: ["superadmin"],
    type: "tool",
  },
  {
    id: "resellers-add-sub",
    group: "Resellers",
    title: "Add Sub Reseller",
    subtitle: "Create a new sub-reseller account",
    keywords: ["sub reseller", "subreseller", "create user"],
    path: "/resellers",
    tab: "add-sub",
    roles: ["superadmin", "reseller"],
    type: "tool",
  },
  {
    id: "resellers-change",
    group: "Resellers",
    title: "Change Reseller",
    subtitle: "Move a reseller to a different parent",
    keywords: ["parent", "transfer", "move reseller"],
    path: "/resellers",
    tab: "change",
    roles: ["superadmin"],
    type: "tool",
  },
  {
    id: "credits-logs",
    group: "Credits",
    title: "Credit Point Share Logs",
    subtitle: "Review credit transfer history",
    keywords: ["credits", "logs", "transactions", "history"],
    path: "/credits",
    tab: "credit-logs",
    type: "tool",
  },
  {
    id: "credits-withdrawals",
    group: "Credits",
    title: "Withdraw Point Share Logs",
    subtitle: "Review withdrawn credit history",
    keywords: ["withdraw", "credits", "logs"],
    path: "/credits",
    tab: "withdraw-logs",
    roles: ["superadmin", "reseller"],
    type: "tool",
  },
  {
    id: "credits-requests",
    group: "Credits",
    title: "Request Credits",
    subtitle: "Send a new credit request",
    keywords: ["request", "credits", "balance"],
    path: "/credits",
    tab: "request-credits",
    roles: ["subreseller"],
    type: "tool",
  },
  {
    id: "credits-pending",
    group: "Credits",
    title: "Pending Requests",
    subtitle: "Review pending credit requests",
    keywords: ["pending", "requests", "credits"],
    path: "/credits",
    tab: "pending-requests",
    roles: ["reseller"],
    type: "tool",
  },
  {
    id: "playlists",
    group: "Playlists",
    title: "Playlist Management",
    subtitle: "Check and convert playlist files",
    keywords: ["playlist", "converter", "checker", "m3u"],
    path: "/playlists",
    type: "tool",
  },
  {
    id: "notifications",
    group: "System",
    title: "Notifications",
    subtitle: "Open all panel notifications",
    keywords: ["alerts", "updates", "messages"],
    path: "/notifications",
    type: "tool",
  },
  {
    id: "settings",
    group: "System",
    title: "System Settings",
    subtitle: "Manage panel configuration",
    keywords: ["settings", "configuration", "system"],
    path: "/settings",
    type: "tool",
  },
  {
    id: "applications",
    group: "System",
    title: "Applications Management",
    subtitle: "Manage app catalog and logos",
    keywords: ["apps", "applications", "catalog"],
    path: "/apps",
    roles: ["superadmin"],
    type: "tool",
  },
];

const SEARCH_GROUP_ORDER = [
  "Quick Access",
  "Device Management",
  "Resellers",
  "Credits",
  "Playlists",
  "System",
];

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSearchItemScore(
  item: SearchSuggestion,
  query: string,
  t: (value: string) => string,
) {
  const fields = [
    item.title,
    t(item.title),
    item.subtitle || "",
    item.subtitle ? t(item.subtitle) : "",
    item.group,
    ...(item.keywords || []),
  ]
    .map((value) => normalizeSearchValue(value))
    .filter(Boolean);

  let score = 0;
  for (const field of fields) {
    if (field === query) {
      score = Math.max(score, 150);
    } else if (field.startsWith(query)) {
      score = Math.max(score, 120);
    } else if (field.split(/\s+/).some((part) => part.startsWith(query))) {
      score = Math.max(score, 90);
    } else if (field.includes(query)) {
      score = Math.max(score, 60);
    }
  }

  return score;
}

function getSuggestionIcon(group: string, type?: string) {
  if (type === "dashboard") return LayoutDashboard;
  if (group === "Device Management") return MonitorPlay;
  if (group === "Resellers") return Users;
  if (group === "Credits") return CreditCard;
  if (group === "System") return Settings;
  if (group === "Playlists") return ListChecks;
  if (type === "application") return AppWindow;
  return Search;
}

function formatNotificationTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Just now";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { isCollapsed, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const navigate = useNavigate();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  const notificationsRefreshTimeoutRef = useRef<number | null>(null);
  const creditsRefreshTimeoutRef = useRef<number | null>(null);

  const loadNotifications = useCallback(
    async (silent = true) => {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      try {
        if (!silent) setLoadingNotifications(true);
        const res = await api.getNotifications({ take: 4, pageSize: 4 });
        const items = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
            ? res
            : [];
        setNotifications(items);
        setUnreadCount(Number(res?.unreadCount || 0));
      } catch (error) {
        console.error("Failed to load notifications", error);
        if (!silent) {
          setNotifications([]);
          setUnreadCount(0);
        }
      } finally {
        setLoadingNotifications(false);
      }
    },
    [user],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        languageRef.current &&
        !languageRef.current.contains(event.target as Node)
      ) {
        setIsLanguageOpen(false);
      }
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;

    loadNotifications(true);

    const queueNotificationsRefresh = () => {
      if (notificationsRefreshTimeoutRef.current !== null) {
        window.clearTimeout(notificationsRefreshTimeoutRef.current);
      }

      notificationsRefreshTimeoutRef.current = window.setTimeout(() => {
        loadNotifications(true).catch(() => {
          /* ignore */
        });
        notificationsRefreshTimeoutRef.current = null;
      }, 100);
    };

    const queueCreditsRefresh = () => {
      if (creditsRefreshTimeoutRef.current !== null) {
        window.clearTimeout(creditsRefreshTimeoutRef.current);
      }

      creditsRefreshTimeoutRef.current = window.setTimeout(() => {
        window.dispatchEvent(new Event("credits:refresh"));
        creditsRefreshTimeoutRef.current = null;
      }, 120);
    };

    const handleRealtimeNotification = (payload: any) => {
      queueNotificationsRefresh();

      const notification = payload?.notification || payload;
      if (isCreditsNotification(notification)) {
        queueCreditsRefresh();
      }
    };

    const unsubscribe = api.subscribeToNotifications(
      handleRealtimeNotification,
    );

    window.addEventListener("notifications:refresh", queueNotificationsRefresh);
    window.addEventListener("credits:refresh", queueNotificationsRefresh);

    return () => {
      if (notificationsRefreshTimeoutRef.current !== null) {
        window.clearTimeout(notificationsRefreshTimeoutRef.current);
        notificationsRefreshTimeoutRef.current = null;
      }
      if (creditsRefreshTimeoutRef.current !== null) {
        window.clearTimeout(creditsRefreshTimeoutRef.current);
        creditsRefreshTimeoutRef.current = null;
      }

      window.removeEventListener(
        "notifications:refresh",
        queueNotificationsRefresh,
      );
      window.removeEventListener("credits:refresh", queueNotificationsRefresh);
      unsubscribe();
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!user || !debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    let active = true;
    setLoadingSearch(true);

    api
      .getGlobalSearch({ q: debouncedSearch, limit: 4 })
      .then((res) => {
        if (!active) return;
        setSearchResults(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to search panel", error);
        setSearchResults([]);
      })
      .finally(() => {
        if (active) setLoadingSearch(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, user]);

  const quickMatches = useMemo(() => {
    const query = normalizeSearchValue(searchTerm);
    const role = (user?.role || "").toString().toLowerCase();

    if (!query) return [] as SearchSuggestion[];

    return NAV_SEARCH_ITEMS.map((item) => {
      const displayItem =
        role === "reseller" && item.path === "/resellers"
          ? {
              ...item,
              title:
                item.id === "resellers-list"
                  ? "Subreseller List"
                  : item.id === "resellers-add-sub"
                    ? "Add Subreseller"
                    : item.title,
            }
          : item;

      return {
        item: displayItem,
        score: getSearchItemScore(displayItem, query, t),
      };
    })
      .filter(({ item, score }) => {
        if (score <= 0) return false;
        if (!item.roles || item.roles.length === 0) return true;
        return role ? item.roles.includes(role) : false;
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map(({ item }) => item);
  }, [searchTerm, t, user?.role]);

  const groupedSearchResults = useMemo(() => {
    if (!searchTerm.trim()) return [] as Array<[string, SearchSuggestion[]]>;

    const seen = new Set<string>();
    const groups = new Map<string, SearchSuggestion[]>();

    [...quickMatches, ...searchResults].forEach((item) => {
      const key = `${item.group}:${item.title}:${item.path}:${item.tab || ""}:${item.search || ""}`;
      if (seen.has(key)) return;
      seen.add(key);

      const nextItems = groups.get(item.group) || [];
      nextItems.push(item);
      groups.set(item.group, nextItems);
    });

    return Array.from(groups.entries()).sort(([left], [right]) => {
      const leftIndex = SEARCH_GROUP_ORDER.indexOf(left);
      const rightIndex = SEARCH_GROUP_ORDER.indexOf(right);
      return (
        (leftIndex === -1 ? 999 : leftIndex) -
        (rightIndex === -1 ? 999 : rightIndex)
      );
    });
  }, [quickMatches, searchResults, searchTerm]);

  const firstSearchResult = groupedSearchResults[0]?.[1]?.[0] || null;
  const shouldShowSearchResults = isSearchOpen && Boolean(searchTerm.trim());

  const visibleNotifications = notifications.slice(0, 4);
  const hasMoreNotifications =
    notifications.length >= 4 || unreadCount > visibleNotifications.length;

  const handleLanguageSelect = (code: string) => {
    setLanguage(code as "EN" | "FR" | "AR");
    setIsLanguageOpen(false);
  };

  const handleNotificationClick = async (notification: any) => {
    try {
      if (!notification.read) {
        await api.markNotificationRead(Number(notification.id));
        setNotifications((current) =>
          current.map((item) =>
            Number(item.id) === Number(notification.id)
              ? { ...item, read: true, readAt: new Date().toISOString() }
              : item,
          ),
        );
        setUnreadCount((current) => Math.max(current - 1, 0));
      }
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }

    if (isCreditsNotification(notification)) {
      window.dispatchEvent(new Event("credits:refresh"));
    }

    setIsNotificationsOpen(false);
    navigate(resolveNotificationTarget(notification, user?.role));
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  };

  const handleSearchSelect = (item: SearchSuggestion) => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSearchResults([]);
    setIsSearchOpen(false);

    const params = new URLSearchParams();
    if (item.tab) params.set("tab", item.tab);
    if (item.search) params.set("search", item.search);

    const target = params.toString()
      ? `${item.path}?${params.toString()}`
      : item.path;

    navigate(target);
  };

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6 transition-colors duration-300">
      <div className="flex flex-1 items-center gap-2 sm:gap-4">
        <button
          onClick={toggleSidebar}
          className="hidden h-10 w-10 items-center justify-center rounded-xl bg-input text-foreground transition-all duration-300 hover:bg-ring lg:flex"
          aria-label="Toggle sidebar"
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>

        <button
          onClick={toggleMobileSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-input text-foreground transition-all duration-300 hover:bg-ring lg:hidden"
          aria-label="Toggle mobile sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div ref={searchRef} className="relative w-full max-w-xs sm:max-w-xl">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search
              className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5"
              aria-hidden="true"
            />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => {
              if (searchTerm.trim()) {
                setIsSearchOpen(true);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsSearchOpen(false);
              }
              if (event.key === "Enter" && firstSearchResult) {
                event.preventDefault();
                handleSearchSelect(firstSearchResult);
              }
            }}
            className="block w-full rounded-xl border-0 bg-input py-1.5 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:py-2 sm:pl-10 sm:pr-10 sm:text-sm sm:leading-6"
            placeholder={t("Search pages, tools, and accounts...")}
            aria-label={t("Global search")}
          />
          {loadingSearch && searchTerm.trim().length >= 2 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          <AnimatePresence>
            {shouldShowSearchResults && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    {t("Search results")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Jump to pages, tools, devices, and reseller accounts.")}
                  </p>
                </div>

                <div className="max-h-[26rem] overflow-y-auto p-2">
                  {groupedSearchResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {loadingSearch && searchTerm.trim().length >= 2
                        ? t("Searching the panel...")
                        : t("No matching pages or accounts found.")}
                    </div>
                  ) : (
                    groupedSearchResults.map(([group, items]) => {
                      const GroupIcon = getSuggestionIcon(
                        group,
                        items[0]?.type,
                      );
                      return (
                        <div key={group} className="mb-2 last:mb-0">
                          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            <GroupIcon className="h-3.5 w-3.5" />
                            <span>{t(group)}</span>
                          </div>

                          <div className="space-y-1">
                            {items.map((item) => {
                              const ItemIcon = getSuggestionIcon(
                                item.group,
                                item.type,
                              );
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleSearchSelect(item)}
                                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/5"
                                >
                                  <span className="mt-0.5 rounded-lg bg-foreground/5 p-2 text-muted-foreground">
                                    <ItemIcon className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-foreground">
                                      {t(item.title)}
                                    </span>
                                    {item.subtitle && (
                                      <span className="block truncate text-xs text-muted-foreground">
                                        {t(item.subtitle)}
                                      </span>
                                    )}
                                  </span>
                                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-x-2 sm:gap-x-6">
        {user?.role !== "superadmin" && (
          <div className="hidden items-center gap-2 rounded-full bg-input px-3 py-1 sm:px-4 sm:py-1.5 xs:flex">
            <Coins className="h-3.5 w-3.5 text-yellow-500 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap text-xs font-semibold text-foreground sm:text-sm">
              {Number(user?.reseller?.credits || 0).toLocaleString()}{" "}
              <span className="hidden sm:inline">{t("Credits")}</span>
            </span>
          </div>
        )}

        <div className="relative" ref={languageRef}>
          <button
            type="button"
            onClick={() => setIsLanguageOpen((current) => !current)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-input px-2.5 text-foreground transition-all duration-300 hover:bg-ring sm:h-10"
            aria-label={t("Select language")}
            title={t("Select language")}
          >
            <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden text-xs font-semibold sm:inline">
              {language}
            </span>
          </button>

          <AnimatePresence>
            {isLanguageOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    {t("Language")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Choose your panel language")}
                  </p>
                </div>
                <div className="p-2">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => handleLanguageSelect(option.code)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                        language === option.code
                          ? "bg-foreground/5 text-foreground"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      <span>{option.label}</span>
                      <span className="text-xs font-semibold">
                        {option.code}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-input text-foreground transition-all duration-300 hover:bg-ring sm:h-10 sm:w-10"
          aria-label={t("Toggle theme")}
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              const next = !isNotificationsOpen;
              setIsNotificationsOpen(next);
              if (next) {
                loadNotifications(false).catch(() => {
                  /* ignore */
                });
              }
            }}
            className="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground"
          >
            <span className="sr-only">{t("Notifications")}</span>
            <Bell className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                className="absolute right-0 mt-2 w-88 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("Notifications")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {unreadCount > 0
                        ? unreadCount === 1
                          ? t("1 unread update")
                          : t("{{count}} unread updates", {
                              count: unreadCount,
                            })
                        : t("You're all caught up")}
                    </p>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground hover:bg-foreground/5"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {t("Mark all read")}
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Loading notifications...")}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("No notifications yet.")}
                    </div>
                  ) : (
                    visibleNotifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5 ${
                          notification.read ? "opacity-80" : "bg-foreground/5"
                        }`}
                      >
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            notification.read ? "bg-border" : "bg-rose-500"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">
                              {notification.title}
                            </p>
                            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                              {formatNotificationTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {notification.message}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {!loadingNotifications && hasMoreNotifications && (
                  <div className="flex justify-end border-t border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotificationsOpen(false);
                        navigate("/notifications");
                      }}
                      className="text-xs font-semibold text-foreground hover:text-rose-600 transition-colors"
                    >
                      {t("Show all")}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="group flex items-center gap-x-2 p-1"
            aria-label={t("Account")}
            title={t("Account")}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-input transition-colors group-hover:bg-ring">
              <User className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
            </div>
            <span className="hidden md:flex md:items-center">
              <span
                className="text-sm font-medium leading-6 text-foreground"
                aria-hidden="true"
              >
                {user?.name || "User"}
              </span>
            </span>
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute right-0 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              >
                <div className="space-y-1 p-2">
                  <div className="mb-1 border-b border-border px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t("Account")}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {user?.email}
                    </p>
                  </div>

                  <Link
                    to="/settings"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    {t("System Settings")}
                  </Link>

                  <div className="my-1 h-px bg-border" />

                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-500 transition-colors hover:bg-rose-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("Logout")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
