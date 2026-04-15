import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useNavigate } from "react-router";
import api from "../lib/api";
import { SessionTimeoutModal } from "../components/auth/SessionTimeoutModal";

export interface User {
  id: number | string;
  name: string;
  email: string;
  phone?: string | null;
  role: "superadmin" | "reseller" | "subreseller";
  resellerId?: number | null;
  reseller?: {
    id?: number | string;
    name?: string;
    code?: string;
    phone?: string | null;
    credits?: number;
    parentId?: number | null;
  } | null;
}

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
    captchaToken?: string | null,
  ) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_DURATION_MS = 30 * 1000;
const WARNING_SECONDS = Math.floor(WARNING_DURATION_MS / 1000);
const LAST_ACTIVITY_KEY = "stream_panel_last_activity";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "pointerdown",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isTimeoutWarningOpen, setIsTimeoutWarningOpen] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(WARNING_SECONDS);
  const navigate = useNavigate();
  const warningTimeoutRef = useRef<number | null>(null);
  const logoutTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const clearSessionTimers = useCallback(() => {
    if (warningTimeoutRef.current !== null) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }

    if (logoutTimeoutRef.current !== null) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }

    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearSessionTimers();
    setIsTimeoutWarningOpen(false);
    setWarningCountdown(WARNING_SECONDS);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    void api.logout();
    setUser(null);
    setIsAuthReady(true);
    navigate("/login");
  }, [clearSessionTimers, navigate]);

  const startWarningCountdown = useCallback(
    (remainingMs: number) => {
      clearSessionTimers();
      const safeRemainingMs = Math.max(remainingMs, 1000);
      setIsTimeoutWarningOpen(true);
      setWarningCountdown(Math.max(Math.ceil(safeRemainingMs / 1000), 1));

      logoutTimeoutRef.current = window.setTimeout(() => {
        logout();
      }, safeRemainingMs);

      countdownIntervalRef.current = window.setInterval(() => {
        const storedActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
        const lastActivity = storedActivity
          ? Number(storedActivity)
          : Date.now();
        const msUntilLogout = Math.max(
          IDLE_TIMEOUT_MS - (Date.now() - lastActivity),
          0,
        );
        setWarningCountdown(Math.max(Math.ceil(msUntilLogout / 1000), 0));
      }, 1000);
    },
    [clearSessionTimers, logout],
  );

  const scheduleSessionTimeout = useCallback(() => {
    if (!user) {
      clearSessionTimers();
      return;
    }

    clearSessionTimers();

    const now = Date.now();
    const storedActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    const parsedActivity = storedActivity ? Number(storedActivity) : now;
    const lastActivity = Number.isNaN(parsedActivity) ? now : parsedActivity;

    if (!storedActivity || Number.isNaN(parsedActivity)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }

    const msUntilLogout = IDLE_TIMEOUT_MS - (now - lastActivity);

    if (msUntilLogout <= 0) {
      logout();
      return;
    }

    if (msUntilLogout <= WARNING_DURATION_MS) {
      startWarningCountdown(msUntilLogout);
      return;
    }

    setIsTimeoutWarningOpen(false);
    setWarningCountdown(WARNING_SECONDS);
    warningTimeoutRef.current = window.setTimeout(() => {
      startWarningCountdown(WARNING_DURATION_MS);
    }, msUntilLogout - WARNING_DURATION_MS);
  }, [clearSessionTimers, logout, startWarningCountdown, user]);

  const registerActivity = useCallback(() => {
    if (!user) return;

    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setIsTimeoutWarningOpen(false);
    setWarningCountdown(WARNING_SECONDS);
    scheduleSessionTimeout();
  }, [scheduleSessionTimeout, user]);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.me();
      if (currentUser && currentUser.id) {
        setUser(currentUser as User);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {
      /* not authenticated */
    });
  }, [refreshUser]);

  useEffect(() => {
    const handleRefresh = () => {
      refreshUser().catch(() => {
        /* ignore background refresh failures */
      });
    };

    window.addEventListener("credits:refresh", handleRefresh);
    return () => {
      window.removeEventListener("credits:refresh", handleRefresh);
    };
  }, [refreshUser]);

  useEffect(() => {
    if (!user) {
      clearSessionTimers();
      setIsTimeoutWarningOpen(false);
      setWarningCountdown(WARNING_SECONDS);
      return;
    }

    scheduleSessionTimeout();

    const handleActivity = () => {
      registerActivity();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        if (!event.newValue) {
          setIsTimeoutWarningOpen(false);
          setWarningCountdown(WARNING_SECONDS);
          return;
        }
        scheduleSessionTimeout();
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("storage", handleStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("storage", handleStorage);
      clearSessionTimers();
    };
  }, [clearSessionTimers, registerActivity, scheduleSessionTimeout, user]);

  const login = async (
    email: string,
    password: string,
    captchaToken?: string | null,
  ) => {
    try {
      const res = await api.login(email, password, captchaToken);
      if (res && res.user) {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        setIsTimeoutWarningOpen(false);
        setWarningCountdown(WARNING_SECONDS);
        setUser(res.user as User);
        await refreshUser();
        return true;
      }
      return false;
    } catch (err) {
      console.error("login error", err);
      throw err;
    }
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        updateUser,
        refreshUser,
        isAuthenticated: !!user,
        isAuthReady,
      }}
    >
      {children}
      <SessionTimeoutModal
        isOpen={isTimeoutWarningOpen && !!user}
        countdown={warningCountdown}
        idleMinutes={IDLE_TIMEOUT_MS / (60 * 1000)}
        onStaySignedIn={registerActivity}
        onLogoutNow={logout}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
