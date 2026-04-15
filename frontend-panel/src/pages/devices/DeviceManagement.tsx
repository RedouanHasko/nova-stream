import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { CheckMac } from "./tabs/CheckMac";
import { SwitchMac } from "./tabs/SwitchMac";
import { MultiAppsActivation } from "./tabs/MultiAppsActivation";
import { ActivatedAppsList } from "./tabs/ActivatedAppsList";
import { DirectSubscriptions } from "./tabs/DirectSubscriptions";
import { AddPlaylist } from "./tabs/AddPlaylist";
import { ResetPlaylist } from "./tabs/ResetPlaylist";
import { ChangeDomainUrl } from "./tabs/ChangeDomainUrl";
import {
  MonitorPlay,
  RefreshCcw,
  Layers,
  List,
  PlusCircle,
  RotateCcw,
  Globe,
  UserCheck,
} from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "../../contexts/I18nContext";

const allTabs = [
  {
    id: "check",
    name: "Check MAC",
    icon: MonitorPlay,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "switch",
    name: "Switch MAC",
    icon: RefreshCcw,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "multi",
    name: "Multi Apps Activation",
    icon: Layers,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "list",
    name: "Activated Apps List",
    icon: List,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "direct",
    name: "Direct Subscriptions",
    icon: UserCheck,
    roles: ["superadmin"],
  },
  {
    id: "add-playlist",
    name: "Add Playlist",
    icon: PlusCircle,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "reset-playlist",
    name: "Reset Playlist",
    icon: RotateCcw,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "domain",
    name: "Change Domain Url",
    icon: Globe,
    roles: ["superadmin"],
  },
];

export function DeviceManagement() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");

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
          {t("Device Management")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Manage device activations, switch MAC addresses, and configure playlists.",
          )}
        </p>
      </div>

      {/* Horizontal Tabs Navigation */}
      <div className="border-b border-border">
        <nav
          className="-mb-px flex space-x-8 overflow-x-auto pb-1 scrollbar-hide"
          aria-label="Tabs"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
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
                {t(tab.name)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content Area */}
      <div className="mt-6 flex flex-1 justify-center">
        <div className="w-full max-w-6xl">
          {activeTab === "check" && <CheckMac />}
          {activeTab === "switch" && <SwitchMac />}
          {activeTab === "multi" && <MultiAppsActivation />}
          {activeTab === "list" && <ActivatedAppsList />}
          {activeTab === "direct" && <DirectSubscriptions />}
          {activeTab === "add-playlist" && <AddPlaylist />}
          {activeTab === "reset-playlist" && <ResetPlaylist />}
          {activeTab === "domain" && <ChangeDomainUrl />}
        </div>
      </div>
    </motion.div>
  );
}
