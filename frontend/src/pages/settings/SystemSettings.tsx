import {
  Settings,
  User,
  Lock,
  Bell,
  Shield,
  Tag,
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useState } from "react";
import { ProfileSettings } from "./tabs/ProfileSettings";
import { SecuritySettings } from "./tabs/SecuritySettings";
import { NotificationSettings } from "./tabs/NotificationSettings";
import { ApiIntegrations } from "./tabs/ApiIntegrations";
import { PricingPlans } from "./tabs/PricingPlans";
import { GlobalSettings } from "./tabs/GlobalSettings";
import { ResellerBranding } from "./tabs/ResellerBranding";
import { SecurityPolicies } from "./tabs/SecurityPolicies";
import { motion } from "motion/react";
import { useI18n } from "../../contexts/I18nContext";

type SettingsTab =
  | "profile"
  | "security"
  | "notifications"
  | "api"
  | "pricing"
  | "global"
  | "branding"
  | "policies";

export function SystemSettings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileSettings />;
      case "security":
        return <SecuritySettings />;
      case "notifications":
        return <NotificationSettings />;
      case "api":
        return <ApiIntegrations />;
      case "pricing":
        return <PricingPlans />;
      case "global":
        return <GlobalSettings />;
      case "branding":
        return <ResellerBranding />;
      case "policies":
        return <SecurityPolicies />;
      default:
        return <ProfileSettings />;
    }
  };

  const navItems = [
    { id: "profile" as SettingsTab, name: "Profile Settings", icon: User },
    { id: "security" as SettingsTab, name: "Security & Password", icon: Lock },
    { id: "notifications" as SettingsTab, name: "Notifications", icon: Bell },
  ];

  const resellerNavItems = [
    { id: "branding" as SettingsTab, name: "Reseller Branding", icon: Palette },
  ];

  const adminNavItems = [
    {
      id: "policies" as SettingsTab,
      name: "Security Policies",
      icon: ShieldCheck,
    },
    { id: "api" as SettingsTab, name: "API & Integrations", icon: Shield },
    { id: "pricing" as SettingsTab, name: "Pricing Plans", icon: Tag },
    {
      id: "global" as SettingsTab,
      name: "Global App Settings",
      icon: Settings,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {user?.role === "superadmin"
            ? t("System Settings")
            : t("Account Settings")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user?.role === "superadmin"
            ? t(
                "Manage global system configurations, security policies, and administrative tools.",
              )
            : t(
                "Manage your personal account settings, branding, and notification preferences.",
              )}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <nav className="flex flex-col gap-1">
            <div className="pb-2">
              <p className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {t("General")}
              </p>
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                  activeTab === item.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <item.icon
                  className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors ${
                    activeTab === item.id
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
                {t(item.name)}
              </button>
            ))}

            {(user?.role === "reseller" || user?.role === "subreseller") && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    {t("Business")}
                  </p>
                </div>
                {resellerNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                      activeTab === item.id
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    <item.icon
                      className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors ${
                        activeTab === item.id
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                    {item.name}
                  </button>
                ))}
              </>
            )}

            {user?.role === "superadmin" && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    {t("Administration")}
                  </p>
                </div>
                {adminNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                      activeTab === item.id
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    <item.icon
                      className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors ${
                        activeTab === item.id
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                    {item.name}
                  </button>
                ))}
              </>
            )}
          </nav>
        </aside>

        {/* Settings Content */}
        <div className="flex-1 space-y-6 w-full max-w-5xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </motion.div>
  );
}
