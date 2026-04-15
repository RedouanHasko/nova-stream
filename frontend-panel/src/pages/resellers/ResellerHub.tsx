import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  Users,
  UserPlus,
  UserCog,
  ArrowRightLeft,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { ResellerList } from "./tabs/ResellerList";
import { AddReseller } from "./tabs/AddReseller";
import { AddSubReseller } from "./tabs/AddSubReseller";
import { ChangeReseller } from "./tabs/ChangeReseller";
import { ParentChangeRequests } from "./tabs/ParentChangeRequests";
import { motion } from "motion/react";

const allTabs = [
  {
    id: "list",
    name: "Reseller List",
    icon: Users,
    roles: ["superadmin", "reseller"],
  },
  {
    id: "add-reseller",
    name: "Add Reseller",
    icon: UserPlus,
    roles: ["superadmin"],
  },
  {
    id: "add-sub",
    name: "Add Sub Reseller",
    icon: UserCog,
    roles: ["superadmin", "reseller"],
  },
  {
    id: "change",
    name: "Change Reseller",
    icon: ArrowRightLeft,
    roles: ["superadmin"],
  },
  {
    id: "parent-requests",
    name: "Parent Change Requests",
    icon: ClipboardList,
    roles: ["superadmin"],
  },
];

export function ResellerHub() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const isResellerManager = user?.role === "reseller";

  // Filter tabs based on user role
  const tabs = useMemo(
    () => allTabs.filter((tab) => user?.role && tab.roles.includes(user.role)),
    [user?.role],
  );

  const [activeTab, setActiveTab] = useState(tabs.length > 0 ? tabs[0].id : "");

  // Update active tab if role changes and current tab is no longer available
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [user?.role, tabs, activeTab]);

  useEffect(() => {
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, tabs]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab && tabs.some((tab) => tab.id === detail.tab)) {
        setActiveTab(detail.tab);
      }
    };

    window.addEventListener("reseller-hub:navigate", handleNavigate);
    return () => {
      window.removeEventListener("reseller-hub:navigate", handleNavigate);
    };
  }, [tabs]);

  if (tabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">
          {t("You do not have access to any features in this section.")}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 flex flex-col h-full"
    >
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {isResellerManager
            ? t("Subreseller Management")
            : t("Reseller Management")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isResellerManager
            ? t("Manage your sub-resellers under your reseller account.")
            : t(
                "Manage your resellers, sub-resellers, and handle credit requests.",
              )}
        </p>
      </div>

      {/* Horizontal Tabs Navigation */}
      <div className="border-b border-border">
        <nav
          className="-mb-px flex space-x-8 overflow-x-auto pb-1 scrollbar-hide"
          aria-label={t("Tabs")}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const tabLabel =
              isResellerManager && tab.id === "list"
                ? t("Subreseller List")
                : isResellerManager && tab.id === "add-sub"
                  ? t("Add Subreseller")
                  : t(tab.name);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group inline-flex items-center whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                  ${
                    isActive
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }
                `}
              >
                <tab.icon
                  className={`
                    mr-2 h-4 w-4 transition-colors
                    ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}
                  `}
                  aria-hidden="true"
                />
                {tabLabel}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content Area */}
      <div className="mt-6 flex flex-1 justify-center">
        <div className="w-full max-w-6xl">
          {activeTab === "list" && <ResellerList />}
          {activeTab === "add-reseller" && <AddReseller />}
          {activeTab === "add-sub" && <AddSubReseller />}
          {activeTab === "change" && <ChangeReseller />}
          {activeTab === "parent-requests" && <ParentChangeRequests />}
        </div>
      </div>
    </motion.div>
  );
}
