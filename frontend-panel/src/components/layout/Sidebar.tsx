import { Link, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { useSidebar } from "../../contexts/SidebarContext";
import {
  LayoutDashboard,
  MonitorPlay,
  Users,
  CreditCard,
  Settings,
  ListVideo,
  LogOut,
  X,
  LayoutGrid,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { motion } from "motion/react";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    name: "Device Management",
    href: "/devices",
    icon: MonitorPlay,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    name: "Playlist Checker/Converter",
    href: "/playlists",
    icon: ListVideo,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    name: "Reseller",
    href: "/resellers",
    icon: Users,
    roles: ["superadmin", "reseller"],
  },
  {
    name: "Apps Management",
    href: "/apps",
    icon: LayoutGrid,
    roles: ["superadmin"],
  },
  {
    name: "Credits",
    href: "/credits",
    icon: CreditCard,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["superadmin", "reseller", "subreseller"],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const { isCollapsed, isMobileOpen, closeMobileSidebar } = useSidebar();

  // Filter navigation items based on the user's role
  const filteredNavigation = navigation.filter((item) => {
    if (!user?.role || !item.roles.includes(user.role)) return false;
    return true;
  });

  const roleDisplay = {
    superadmin: "Super Admin",
    reseller: "Reseller",
    subreseller: "Sub-Reseller",
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity lg:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeMobileSidebar}
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full flex-col bg-card text-muted-foreground border-r border-border transition-all duration-300 ease-in-out lg:static lg:translate-x-0",
          isCollapsed ? "lg:w-20" : "lg:w-64",
          isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-border transition-all duration-300",
            "justify-between px-6", // Mobile
            isCollapsed
              ? "lg:justify-center lg:px-0"
              : "lg:justify-start lg:px-6", // Desktop
          )}
        >
          <div className={cn("flex items-center", isCollapsed && "lg:mx-auto")}>
            <img
              src="/favicon.png"
              alt="NOVA Panel"
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
            <span
              className={cn(
                "ml-3 text-xl font-bold text-foreground tracking-tight whitespace-nowrap transition-all duration-300",
                isCollapsed
                  ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0"
                  : "lg:w-auto lg:opacity-100",
              )}
            >
              NOVA Panel
            </span>
          </div>

          <button
            onClick={closeMobileSidebar}
            className="p-2 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
          <div
            className={cn(
              "px-6 mb-4",
              isCollapsed && "lg:px-0 lg:flex lg:justify-center",
            )}
          >
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wider text-muted-foreground opacity-50",
                isCollapsed && "lg:hidden",
              )}
            >
              {t("Pages")}
            </p>
            {isCollapsed && (
              <div className="hidden lg:block h-px w-8 bg-border" />
            )}
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              const itemLabel =
                item.name === "Reseller"
                  ? user?.role === "reseller"
                    ? t("Subreseller Management")
                    : t("Reseller Management")
                  : t(item.name);

              return (
                <motion.div
                  key={item.name}
                  whileHover={{ x: !isCollapsed ? 5 : 0 }}
                  className="w-full"
                >
                  <Link
                    to={item.href}
                    onClick={closeMobileSidebar}
                    title={isCollapsed ? itemLabel : undefined}
                    className={cn(
                      isActive
                        ? "bg-input text-foreground"
                        : "text-muted-foreground hover:bg-input hover:text-foreground",
                      "group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isCollapsed && "lg:justify-center lg:px-2",
                    )}
                  >
                    <item.icon
                      className={cn(
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        !isCollapsed && "mr-3",
                        isCollapsed && "lg:mr-0 mr-3",
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap transition-all",
                        isCollapsed && "lg:hidden",
                      )}
                    >
                      {itemLabel}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 p-4 flex-col gap-2 border-t border-border">
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-2 mb-2 rounded-xl bg-input overflow-hidden transition-all",
              isCollapsed && "lg:justify-center lg:px-0",
            )}
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-foreground flex items-center justify-center text-background font-bold">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div
              className={cn(
                "flex flex-col overflow-hidden transition-all",
                isCollapsed && "lg:hidden",
              )}
            >
              <span className="text-sm font-medium text-foreground truncate">
                {user?.name || "Admin"}
              </span>
              <span className="text-xs text-muted-foreground capitalize truncate">
                {user?.role ? t(roleDisplay[user.role]) : ""}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            title={isCollapsed ? t("Logout") : undefined}
            className={cn(
              "group flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-input hover:text-foreground transition-colors",
              isCollapsed && "lg:justify-center lg:px-2",
            )}
          >
            <LogOut
              className={cn(
                "h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors",
                !isCollapsed && "mr-3",
                isCollapsed && "lg:mr-0 mr-3",
              )}
            />
            <span className={cn("transition-all", isCollapsed && "lg:hidden")}>
              {t("Logout")}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
