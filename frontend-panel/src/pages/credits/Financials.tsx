import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Send,
  HandCoins,
  ListOrdered,
  ArrowLeftRight,
} from "lucide-react";
import { CreditLogs } from "./tabs/CreditLogs";
import { WithdrawLogs } from "./tabs/WithdrawLogs";
import { MyChargeRequests } from "./tabs/MyChargeRequests";
import { CreditRequest } from "./tabs/CreditRequest";
import { CreditReturn } from "./tabs/CreditReturn";
import { PendingRequests } from "./tabs/PendingRequests";
import { TransferCreditsModal } from "./TransferCreditsModal";
import { PurchasePlans } from "./PurchasePlans";
import { PricingPlans } from "../settings/tabs/PricingPlans";
import { motion } from "motion/react";
import { useI18n } from "../../contexts/I18nContext";
import api from "../../lib/api";

const allTabs = [
  {
    id: "purchase-plans",
    name: "Available Plans",
    icon: CreditCard,
    roles: ["reseller"],
  },
  {
    id: "plans-management",
    name: "Plans Management",
    icon: CreditCard,
    roles: ["superadmin"],
  },
  {
    id: "credit-logs",
    name: "Credit Point Share Logs",
    icon: History,
    roles: ["superadmin", "reseller", "subreseller"],
  },
  {
    id: "withdraw-logs",
    name: "Withdraw Point Share Logs",
    icon: HandCoins,
    roles: ["superadmin", "reseller"],
  },
  {
    id: "my-charge",
    name: "My Requests",
    icon: ListOrdered,
    roles: ["subreseller"],
  },
  {
    id: "request-credits",
    name: "Request Credits",
    icon: Send,
    roles: ["subreseller"],
  },
  {
    id: "return-credits",
    name: "Return Credits",
    icon: ArrowLeftRight,
    roles: ["subreseller"],
  },
  {
    id: "pending-requests",
    name: "Pending Requests",
    icon: ListOrdered,
    roles: ["reseller"],
  },
];

export function Financials() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [summary, setSummary] = useState({
    availableBalance: 0,
    incoming30d: 0,
    outgoing30d: 0,
  });

  useEffect(() => {
    let mounted = true;

    const loadSummary = async () => {
      try {
        const res = await api.getCreditSummary();
        if (!mounted || !res) return;
        setSummary({
          availableBalance: Number(res.availableBalance || 0),
          incoming30d: Number(res.incoming30d || 0),
          outgoing30d: Number(res.outgoing30d || 0),
        });
      } catch (error) {
        console.error("Failed to load financial summary", error);
        if (mounted) {
          setSummary({ availableBalance: 0, incoming30d: 0, outgoing30d: 0 });
        }
      }
    };

    loadSummary();
    const refreshHandler = () => loadSummary();
    window.addEventListener("credits:refresh", refreshHandler);

    return () => {
      mounted = false;
      window.removeEventListener("credits:refresh", refreshHandler);
    };
  }, []);

  const formatValue = (value: number) => value.toLocaleString(locale);

  const pageMeta =
    user?.role === "superadmin"
      ? {
          title: "Credit Management",
          description:
            "Manage pricing plans, monitor reseller credit activity, and review all system credit movements.",
        }
      : user?.role === "reseller"
        ? {
            title: "My Credits & Plans",
            description:
              "Review available recharge plans, purchase credits, and manage transfers with your sub-resellers.",
          }
        : {
            title: "My Credits",
            description:
              "Request or return credits and track your own credit activity in one place.",
          };

  // Filter tabs based on user role
  const tabs = useMemo(
    () =>
      allTabs.filter((tab) => {
        if (!user?.role || !tab.roles.includes(user.role)) return false;
        return true;
      }),
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 flex flex-col h-full"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t(pageMeta.title)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(pageMeta.description)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {user?.role !== "subreseller" && (
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors gap-2"
            >
              <Send className="h-4 w-4" />
              {user?.role === "superadmin"
                ? t("Manual Credit Action")
                : t("Transfer Credits")}
            </button>
          )}
          {user?.role === "superadmin" && activeTab !== "plans-management" && (
            <button
              onClick={() => setActiveTab("plans-management")}
              className="inline-flex items-center justify-center rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors gap-2"
            >
              <CreditCard className="h-4 w-4" />
              {t("Manage Plans")}
            </button>
          )}
          {user?.role === "reseller" && (
            <button
              onClick={() => setActiveTab("purchase-plans")}
              className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition-colors gap-2"
            >
              <CreditCard className="h-4 w-4" />
              {t("View & Purchase Plans")}
            </button>
          )}
          {user?.role === "subreseller" && (
            <button
              onClick={() => setActiveTab("request-credits")}
              className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors gap-2"
            >
              <Send className="h-4 w-4" />
              {t("Request Credits")}
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-card border border-border p-6 text-foreground">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-foreground/10 p-3">
              <CreditCard className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {user?.role === "superadmin"
                  ? t("System Credit Balance")
                  : t("Available Balance")}
              </p>
              <p className="text-3xl font-bold text-foreground">
                {user?.role === "superadmin" && summary.availableBalance === -1
                  ? t("Unlimited")
                  : formatValue(summary.availableBalance)}
              </p>
            </div>
          </div>
        </div>

        {user?.role === "superadmin" ? (
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <ArrowUpRight className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("Credits Issued (30d)")}
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {formatValue(summary.incoming30d)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <ArrowDownRight className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("Credits Received (30d)")}
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {formatValue(summary.incoming30d)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-rose-500/10 p-3">
              <ArrowUpRight className="h-6 w-6 text-rose-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {user?.role === "superadmin"
                  ? t("Credits Revoked (30d)")
                  : t("Credits Spent (30d)")}
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {formatValue(summary.outgoing30d)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Tabs Navigation */}
      {tabs.length > 0 && (
        <div className="border-b border-border mt-8">
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
      )}

      {/* Tab Content Area */}
      {tabs.length > 0 && (
        <div className="mt-6 flex flex-1 justify-center">
          <div className="w-full max-w-6xl">
            {activeTab === "plans-management" && <PricingPlans />}
            {activeTab === "purchase-plans" && <PurchasePlans embedded />}
            {activeTab === "credit-logs" && <CreditLogs />}
            {activeTab === "withdraw-logs" && <WithdrawLogs />}
            {activeTab === "my-charge" && <MyChargeRequests />}
            {activeTab === "request-credits" && <CreditRequest />}
            {activeTab === "return-credits" && <CreditReturn />}
            {activeTab === "pending-requests" && <PendingRequests />}
          </div>
        </div>
      )}

      <TransferCreditsModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
      />
    </motion.div>
  );
}
