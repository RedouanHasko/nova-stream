import { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import {
  Users,
  MonitorPlay,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  Search,
  Filter,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import api from "../lib/api";
import { formatTransactionNote } from "../lib/utils";
import { useTheme } from "../contexts/ThemeContext";

// `recentTransactions` state and its loading effect must live inside the component
// to abide by the Rules of Hooks. They were previously declared at module
// scope which caused the "Invalid hook call" runtime error.

export function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [activationDevices, setActivationDevices] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [computedStats, setComputedStats] = useState<any[] | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState("");
  const [deviceStateFilter, setDeviceStateFilter] = useState("All");
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const handleDownloadReport = async () => {
    try {
      setIsDownloadingReport(true);
      const blob = await api.downloadDashboardReportPdf();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const fileDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `dashboard-report-${fileDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download dashboard report", error);
      window.alert(t("Failed to download report. Please try again."));
    } finally {
      setIsDownloadingReport(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadDashboardSummary = async () => {
      try {
        const summary = await api.getDashboardSummary();
        if (!mounted) return;

        const nextTransactions = Array.isArray(summary?.recentTransactions)
          ? summary.recentTransactions
          : [];
        const nextActivationDevices = Array.isArray(summary?.activationDevices)
          ? summary.activationDevices
          : [];
        const nextChartData = Array.isArray(summary?.chartData)
          ? summary.chartData
          : [];
        const totalDevices = Number(summary?.totalDevices || 0);
        const totalResellers = Number(summary?.totalResellers || 0);
        const directSubscriptions = Number(summary?.directSubscriptions || 0);
        const mySubResellers = Number(summary?.mySubResellers || 0);
        const availableBalanceVal = Number(summary?.availableBalance ?? 0);
        const creditsSpent30d = Number(summary?.outgoing30d ?? 0);
        const monthlyRevenue = Number(summary?.monthlyRevenue ?? 0);

        const computed =
          user?.role === "superadmin"
            ? [
                {
                  name: "Total Active Devices",
                  value: totalDevices.toLocaleString(),
                  icon: MonitorPlay,
                  change: "+0",
                  changeType: "positive",
                },
                {
                  name: "Direct Subscriptions",
                  value: directSubscriptions.toLocaleString(),
                  icon: UserCheck,
                  change: "+0",
                  changeType: "positive",
                },
                {
                  name: "Total Resellers",
                  value: totalResellers.toLocaleString(),
                  icon: Users,
                  change: "+0",
                  changeType: "positive",
                },
                {
                  name: "Monthly Revenue",
                  value: `$${monthlyRevenue.toLocaleString()}`,
                  icon: TrendingUp,
                  change: "+0",
                  changeType: "positive",
                },
                {
                  name: "System Credit Balance",
                  value: "Unlimited",
                  icon: CreditCard,
                  change: "∞",
                  changeType: "positive",
                },
              ]
            : user?.role === "reseller"
              ? [
                  {
                    name: "My Active Devices",
                    value: totalDevices.toLocaleString(),
                    icon: MonitorPlay,
                    change: "+0",
                    changeType: "positive",
                  },
                  {
                    name: "My Sub-Resellers",
                    value: mySubResellers.toLocaleString(),
                    icon: Users,
                    change: "+0",
                    changeType: "positive",
                  },
                  {
                    name: "Available Credits",
                    value: String(availableBalanceVal),
                    icon: CreditCard,
                    change: "-0",
                    changeType: "negative",
                  },
                  {
                    name: "Credits Spent (30d)",
                    value: creditsSpent30d.toLocaleString(),
                    icon: TrendingUp,
                    change: "+0",
                    changeType: "positive",
                  },
                ]
              : [
                  {
                    name: "My Active Devices",
                    value: totalDevices.toLocaleString(),
                    icon: MonitorPlay,
                    change: "+0",
                    changeType: "positive",
                  },
                  {
                    name: "Available Credits",
                    value: String(availableBalanceVal),
                    icon: CreditCard,
                    change: "-0",
                    changeType: "negative",
                  },
                  {
                    name: "Credits Spent (30d)",
                    value: creditsSpent30d.toLocaleString(),
                    icon: TrendingUp,
                    change: "+0",
                    changeType: "positive",
                  },
                ];

        setRecentTransactions(nextTransactions);
        setActivationDevices(nextActivationDevices);
        setChartData(nextChartData);
        setAvailableBalance(availableBalanceVal);
        setComputedStats(computed as any[]);
      } catch (error) {
        console.error("Failed to load dashboard summary", error);
        if (!mounted) return;
        setRecentTransactions([]);
        setActivationDevices([]);
        setChartData([]);
        setAvailableBalance(0);
        setComputedStats(null);
      }
    };

    loadDashboardSummary();
    window.addEventListener("credits:refresh", loadDashboardSummary);
    window.addEventListener("resellers:refresh", loadDashboardSummary);

    return () => {
      mounted = false;
      window.removeEventListener("credits:refresh", loadDashboardSummary);
      window.removeEventListener("resellers:refresh", loadDashboardSummary);
    };
  }, [user?.role, user?.resellerId]);

  const filteredTransactions = useMemo(() => {
    return recentTransactions.filter((tx) => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch =
        String(tx.id || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(tx.notes || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(tx.type || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(tx.fromResellerId || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(tx.toResellerId || "")
          .toLowerCase()
          .includes(searchStr);

      const matchesType =
        typeFilter === "All" || (tx.type || "").toUpperCase() === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [searchTerm, typeFilter, recentTransactions]);

  const filteredActivationDevices = useMemo(() => {
    return activationDevices.filter((device) => {
      const searchStr = deviceSearchTerm.toLowerCase();
      const apps = Array.isArray(device.activations) ? device.activations : [];
      const matchesSearch =
        String(device.mac || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(device.deviceKey || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(device.deviceName || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(device.platform || "")
          .toLowerCase()
          .includes(searchStr) ||
        String(device.ownerResellerName || "")
          .toLowerCase()
          .includes(searchStr) ||
        apps.some((activation: any) =>
          `${activation.appName || ""} ${activation.activationKind || ""} ${activation.status || ""}`
            .toLowerCase()
            .includes(searchStr),
        );

      const matchesState =
        deviceStateFilter === "All" || device.accessState === deviceStateFilter;

      return matchesSearch && matchesState;
    });
  }, [activationDevices, deviceSearchTerm, deviceStateFilter]);

  const getAccessStateClassName = (state: string) => {
    if (state === "PAID_ACTIVE") {
      return "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20";
    }
    if (state === "TRIAL_ACTIVE") {
      return "bg-sky-500/10 text-sky-400 ring-sky-500/20";
    }
    if (state === "BLOCKED") {
      return "bg-rose-500/10 text-rose-500 ring-rose-500/20";
    }
    return "bg-amber-500/10 text-amber-400 ring-amber-500/20";
  };

  const formatAccessState = (state: string) => {
    if (state === "PAID_ACTIVE") return "Paid Active";
    if (state === "TRIAL_ACTIVE") return "Trial Active";
    if (state === "BLOCKED") return "Blocked";
    if (state === "EXPIRED") return "Expired";
    return "Inactive";
  };

  // Define stats based on role
  const getStats = () => {
    // Loading state: show placeholder stats while API data loads
    const loadingStats = [
      {
        name: "Loading...",
        value: "—",
        icon: MonitorPlay,
        change: "+0",
        changeType: "positive" as const,
      },
    ];
    return loadingStats;
  };

  const stats = computedStats ?? getStats();

  const chartColor = theme === "dark" ? "#ffffff" : "#000000";
  const gridColor = theme === "dark" ? "#374151" : "#e5e7eb";
  const textColor = theme === "dark" ? "#9ca3af" : "#6b7280";
  const tooltipBg = theme === "dark" ? "#141414" : "#ffffff";
  const tooltipBorder = theme === "dark" ? "#374151" : "#e5e7eb";

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 transition-colors duration-300"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {t("Dashboard Overview")}
        </h1>
        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={handleDownloadReport}
            disabled={isDownloadingReport}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-input px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-foreground hover:bg-ring transition-colors"
          >
            {isDownloadingReport ? t("Generating report...") : t("Download Report")}
          </button>
          <Link
            to="/devices"
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-foreground px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-background hover:opacity-90 transition-colors"
          >
            {t("Activate Device")}
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={itemVariants}
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${user?.role === "subreseller" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.name}
            whileHover={{ y: -5 }}
            className="relative overflow-hidden rounded-2xl bg-card p-6 border border-border shadow-sm transition-colors duration-300"
          >
            <dt>
              <div className="absolute rounded-xl bg-input p-3">
                <stat.icon
                  className="h-6 w-6 text-foreground"
                  aria-hidden="true"
                />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-muted-foreground">
                {t(stat.name)}
              </p>
            </dt>
            <dd className="ml-16 flex items-baseline pb-1 sm:pb-2">
              <p className="text-2xl font-semibold text-foreground">
                {stat.value}
              </p>
              <p
                className={`ml-2 flex items-baseline text-sm font-semibold ${
                  stat.changeType === "positive"
                    ? "text-emerald-500"
                    : "text-rose-500"
                }`}
              >
                {stat.changeType === "positive" ? (
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 self-center text-emerald-500"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowDownRight
                    className="h-4 w-4 shrink-0 self-center text-rose-500"
                    aria-hidden="true"
                  />
                )}
                <span className="ml-1">{stat.change}</span>
              </p>
            </dd>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        {/* Chart Section */}
        <div className="col-span-1 lg:col-span-2 rounded-2xl bg-card p-6 border border-border shadow-sm transition-colors duration-300">
          <h2 className="text-base font-semibold leading-6 text-foreground mb-4">
            {user?.role === "superadmin"
              ? t("Activations & Revenue")
              : t("My Activations")}{" "}
            {t("Last 6 Months")}
          </h2>
          <div className="h-75 w-full min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorActivations"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={chartColor}
                      stopOpacity={0.2}
                    />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  stroke={textColor}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={textColor}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={gridColor}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderRadius: "12px",
                    border: `1px solid ${tooltipBorder}`,
                    color: chartColor,
                  }}
                  itemStyle={{ color: chartColor }}
                />
                <Area
                  type="monotone"
                  dataKey="activations"
                  stroke={chartColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorActivations)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions / Info */}
        <div className="col-span-1 rounded-2xl bg-card p-6 border border-border shadow-sm transition-colors duration-300">
          {user?.role === "superadmin" && (
            <>
              <h2 className="text-base font-semibold leading-6 text-foreground mb-4">
                {t("System Status")}
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-input p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm font-medium text-foreground">
                      {t("API Servers")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Operational
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-input p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm font-medium text-foreground">
                      {t("Database")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Operational
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-input p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm font-medium text-foreground">
                      {t("Auth Service")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Operational
                  </span>
                </div>
              </div>
            </>
          )}

          {user?.role !== "superadmin" && (
            <>
              <h2 className="text-base font-semibold leading-6 text-foreground mb-4">
                {t("Account Status")}
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-input p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm font-medium text-foreground">
                      {t("Account")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {t("Active")}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-input p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-foreground"></div>
                    <span className="text-sm font-medium text-foreground">
                      {t("Credit Limit")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {user?.role === "reseller"
                      ? availableBalance.toLocaleString(locale)
                      : t("Unlimited")}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-medium text-foreground mb-3">
              {t("Quick Links")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {user?.role === "superadmin" && (
                <Link
                  to="/resellers"
                  className="rounded-xl bg-input px-3 py-2 text-sm font-medium text-center text-muted-foreground hover:bg-ring hover:text-foreground transition-colors"
                >
                  {t("Add Reseller")}
                </Link>
              )}
              {user?.role !== "subreseller" && (
                <Link
                  to="/credits"
                  className="rounded-xl bg-input px-3 py-2 text-sm font-medium text-center text-muted-foreground hover:bg-ring hover:text-foreground transition-colors"
                >
                  {user?.role === "superadmin"
                    ? t("Manage Credits")
                    : t("Transfer Credits")}
                </Link>
              )}
              <Link
                to="/devices"
                className="rounded-xl bg-input px-3 py-2 text-sm font-medium text-center text-muted-foreground hover:bg-ring hover:text-foreground transition-colors"
              >
                {t("Check MAC")}
              </Link>
              <Link
                to="/credits"
                className="rounded-xl bg-input px-3 py-2 text-sm font-medium text-center text-muted-foreground hover:bg-ring hover:text-foreground transition-colors"
              >
                {t("View Logs")}
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="rounded-2xl bg-card border border-border overflow-hidden transition-colors duration-300"
      >
        <div className="border-b border-border px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold leading-6 text-foreground">
              Activated & Trial Devices
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All visible devices that currently have trial or paid app activations.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <input
                type="text"
                value={deviceSearchTerm}
                onChange={(e) => setDeviceSearchTerm(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-1.5 pl-9 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder="Search MAC, app, platform..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={deviceStateFilter}
                onChange={(e) => setDeviceStateFilter(e.target.value)}
                title="Filter devices by activation state"
                aria-label="Filter devices by activation state"
                className="block rounded-xl border-0 bg-input py-1.5 pl-3 pr-8 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="All">All states</option>
                <option value="PAID_ACTIVE">Paid Active</option>
                <option value="TRIAL_ACTIVE">Trial Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-input">
              <tr>
                <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-muted-foreground">
                  Device
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground">
                  Apps
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground">
                  Access
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground">
                  Owner
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground">
                  Last Activation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-transparent">
              {filteredActivationDevices.map((device) => (
                <tr key={device.deviceId} className="hover:bg-input transition-colors align-top">
                  <td className="py-4 pl-6 pr-3 text-sm text-foreground min-w-65">
                    <div className="font-semibold">{device.mac || "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {device.deviceName || device.platform || "Unknown device"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Key: {device.deviceKey || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-muted-foreground min-w-[320px]">
                    <div className="flex flex-wrap gap-2">
                      {(device.activations || []).map((activation: any) => (
                        <span
                          key={activation.id}
                          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-input text-foreground ring-border"
                        >
                          {activation.appName} • {activation.activationKind} • {activation.status}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-muted-foreground whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getAccessStateClassName(device.accessState)}`}
                    >
                      {formatAccessState(device.accessState)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm text-muted-foreground whitespace-nowrap">
                    {device.ownerResellerName ||
                      (device.ownerResellerId ? `#${device.ownerResellerId}` : "Direct")}
                  </td>
                  <td className="px-3 py-4 text-sm text-muted-foreground whitespace-nowrap">
                    {device.latestActivationAt
                      ? new Date(device.latestActivationAt).toLocaleString(locale)
                      : "—"}
                  </td>
                </tr>
              ))}
              {filteredActivationDevices.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    No activated or trial devices matched this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Recent Transactions Table */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl bg-card border border-border overflow-hidden transition-colors duration-300"
      >
        <div className="border-b border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-base font-semibold leading-6 text-foreground">
            {t("Recent Transactions")}
          </h2>

          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-1.5 pl-9 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("Search transactions...")}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                title="Filter transactions by type"
                aria-label="Filter transactions by type"
                className="block rounded-xl border-0 bg-input py-1.5 pl-3 pr-8 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="All">{t("All")}</option>
                <option>TOPUP</option>
                <option>TRANSFER</option>
                <option>ACTIVATION_PURCHASE</option>
                <option>ADMIN_ACTIVATION</option>
                <option>REVOKE</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-input">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Transaction ID")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {user?.role === "superadmin" ? t("Reseller") : t("User")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Type")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Amount")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Notes / Details")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Date")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                >
                  {t("Status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-transparent">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-input transition-colors">
                  <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-foreground">
                    TRX-{tx.id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                    {[
                      tx.fromResellerId ? `From #${tx.fromResellerId}` : null,
                      tx.toResellerId ? `To #${tx.toResellerId}` : null,
                    ]
                      .filter(Boolean)
                      .join(" → ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        (tx.type || "").includes("ACTIVATION")
                          ? "bg-input text-foreground ring-border"
                          : (tx.type || "").includes("TRANSFER") ||
                              (tx.type || "").includes("TOPUP")
                            ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                            : (tx.type || "").includes("REVOKE")
                              ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                      }`}
                    >
                      {tx.type || "—"}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-4 text-sm font-medium ${
                      Number(tx.amount) >= 0
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }`}
                  >
                    {Number(tx.amount) > 0 ? "+" : ""}
                    {tx.amount}
                  </td>
                  <td className="max-w-[320px] px-3 py-4 text-sm text-muted-foreground whitespace-normal">
                    {formatTransactionNote(tx.notes, tx.type)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                    {tx.createdAt
                      ? new Date(tx.createdAt).toLocaleString(locale)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        (tx.status || "").toUpperCase() === "COMPLETED"
                          ? "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20"
                          : (tx.status || "").toUpperCase() === "PENDING"
                            ? "text-amber-500 bg-amber-500/10 ring-amber-500/20"
                            : "text-rose-500 bg-rose-500/10 ring-rose-500/20"
                      }`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${
                          (tx.status || "").toUpperCase() === "COMPLETED"
                            ? "bg-emerald-500"
                            : (tx.status || "").toUpperCase() === "PENDING"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                      ></div>
                      {tx.status || "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("No transactions found matching your filters.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
