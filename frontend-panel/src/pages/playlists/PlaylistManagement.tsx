import { useState } from "react";
import { PlaylistChecker } from "./tabs/PlaylistChecker";
import { PlaylistConverter } from "./tabs/PlaylistConverter";
import { CheckCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "../../contexts/I18nContext";

const tabs = [
  { id: "checker", name: "Playlist Checker", icon: CheckCircle },
  { id: "converter", name: "Playlist Converter", icon: RefreshCw },
];

export function PlaylistManagement() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("checker");

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
          {t("Playlist Checker/Converter")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Tools for checking, converting, and managing IPTV playlists.")}
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
          {activeTab === "checker" && <PlaylistChecker />}
          {activeTab === "converter" && <PlaylistConverter />}
        </div>
      </div>
    </motion.div>
  );
}
