import { motion, AnimatePresence } from "motion/react";
import {
  List,
  Plus,
  Trash2,
  Save,
  Info,
  ShieldCheck,
  Zap,
  Smartphone,
  ArrowRight,
  Lock,
  LayoutGrid,
  Users,
  User,
  Settings,
  LogOut,
  Search,
  Check,
  X,
  Globe,
  Server,
  UserCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import {
  getDeviceFeed,
  verifyActivation,
  type ActivationCheckResponse,
} from "../lib/api";

export default function ManagePlaylists() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [macAddress, setMacAddress] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState("Manage Playlists");
  const [isAddPlaylistOpen, setIsAddPlaylistOpen] = useState(false);
  const [isAddXCPlaylistOpen, setIsAddXCPlaylistOpen] = useState(false);
  const [newMacAddress, setNewMacAddress] = useState("");
  const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activationResult, setActivationResult] =
    useState<ActivationCheckResponse | null>(null);
  const [deviceFeed, setDeviceFeed] = useState<ActivationCheckResponse | null>(
    null,
  );
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const formatMacAddress = (value: string) => {
    const hexOnly = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    const limited = hexOnly.slice(0, 12);
    const matches = limited.match(/.{1,2}/g);
    return matches ? matches.join(":") : limited;
  };

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMacAddress(formatMacAddress(e.target.value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCaptchaChecked) {
      alert(t("Please verify that you are not a robot."));
      return;
    }
    if (!macAddress || !deviceKey) {
      setNotice("MAC address and device key are required.");
      return;
    }

    setIsCheckingDevice(true);
    try {
      const verification = await verifyActivation({
        mac: macAddress,
        deviceKey,
      });
      setActivationResult(verification);

      if (!verification.activated) {
        const reason = (verification.reason || "not_activated").toLowerCase();
        const messages: Record<string, string> = {
          device_key_mismatch:
            "Device key mismatch. Please verify your MAC and key.",
          blocked: "This device is blocked. Please contact support.",
          expired: "This activation has expired. Please renew your plan.",
          not_activated:
            "This device is not activated yet. Please activate first.",
        };

        setNotice(
          messages[reason] ||
            "This device cannot access playlist management yet.",
        );
        return;
      }

      const feed = await getDeviceFeed({ mac: macAddress, deviceKey });
      setDeviceFeed(feed);
      setIsLoggedIn(true);
    } catch (error: any) {
      setNotice(error?.message || "Unable to verify this device right now.");
      setIsLoggedIn(false);
    } finally {
      setIsCheckingDevice(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setMacAddress("");
    setDeviceKey("");
    setNewMacAddress("");
    setIsCaptchaChecked(false);
    setActivationResult(null);
    setDeviceFeed(null);
  };

  const showNotice = (message: string) => {
    setNotice(message);
  };

  const playlists =
    (deviceFeed?.playlists && Array.isArray(deviceFeed.playlists)
      ? deviceFeed.playlists
      : activationResult?.playlists) || [];
  const activations =
    (activationResult?.activations &&
    Array.isArray(activationResult.activations)
      ? activationResult.activations
      : []) || [];
  const latestActivation = activations[0] || null;
  const deviceStatus = activationResult?.device?.status || "UNKNOWN";
  const expiryLabel = latestActivation?.expiresAt
    ? new Date(latestActivation.expiresAt).toLocaleDateString()
    : latestActivation?.status === "ACTIVE"
      ? "Lifetime"
      : "-";

  const renderContent = () => {
    switch (activeTab) {
      case "Manage Playlists":
        return (
          <div className="p-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-16">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full bg-[#f3f4f6] border-none rounded-lg px-6 py-3.5 text-sm text-gray-600 placeholder:text-gray-400 focus:ring-0 transition-all"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-black text-white px-8 py-3 rounded-lg text-sm font-mono font-bold tracking-wider shadow-lg">
                  {macAddress}
                </div>
                <button
                  onClick={() =>
                    showNotice(
                      "Add playlist requires reseller-authenticated endpoint. Use panel for creation, then refresh here.",
                    )
                  }
                  className="bg-[#c82333] hover:bg-[#bd2130] text-white px-8 py-3 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95"
                >
                  Add Playlist
                </button>
                <button
                  onClick={() =>
                    showNotice(
                      "Add XC playlist requires reseller-authenticated endpoint. Use panel for creation, then refresh here.",
                    )
                  }
                  className="bg-[#c82333] hover:bg-[#bd2130] text-white px-8 py-3 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95"
                >
                  Add XC Playlist
                </button>
              </div>
            </div>
            {playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-40">
                <p className="text-lg font-bold text-gray-900 opacity-80">
                  No playlists found for this device.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {playlists.map((playlist, index) => (
                  <div
                    key={`${playlist.id || "playlist"}-${index}`}
                    className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h4 className="text-base font-bold text-gray-900">
                        {playlist.name || "Unnamed playlist"}
                      </h4>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 uppercase">
                        {(playlist.type || "m3u").toString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Target app: {playlist.targetAppName || "Any app"}
                    </p>
                    <p className="text-xs text-gray-500 mb-2 break-all">
                      URL: {playlist.url || "Stored via credentials/content"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Last update:{" "}
                      {playlist.updatedAt
                        ? new Date(playlist.updatedAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "Activate Device":
        return (
          <div className="p-10 max-w-4xl">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm mb-8">
              <h3 className="text-xl font-bold mb-6">Activate Your Device</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border-2 border-red-500 bg-red-50/30">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-bold text-lg">Lifetime</h4>
                    <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                      Best Value
                    </span>
                  </div>
                  <p className="text-3xl font-black mb-4">€4.99</p>
                  <ul className="text-sm text-gray-600 space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-red-500" /> Unlimited
                      Access
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-red-500" /> All Future
                      Updates
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate("/device/activate?plan=lifetime")}
                    className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
                  >
                    Activate Lifetime
                  </button>
                </div>
                <div className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50">
                  <h4 className="font-bold text-lg mb-4">Yearly</h4>
                  <p className="text-3xl font-black mb-4">€1.99</p>
                  <ul className="text-sm text-gray-600 space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-red-500" /> 1 Year Access
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-red-500" /> Standard
                      Support
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate("/device/activate?plan=yearly")}
                    className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all"
                  >
                    Activate Yearly
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case "Device Key":
        return (
          <div className="p-10 max-w-2xl">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold mb-2">Device Security</h3>
              <p className="text-gray-500 text-sm mb-8">
                Your device key is required to manage your playlists securely.
              </p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Current Device Key
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deviceKey}
                      onChange={(e) => setDeviceKey(e.target.value)}
                      className="flex-1 bg-gray-50 border-none rounded-xl px-5 py-3.5 font-mono text-gray-600 focus:ring-2 focus:ring-red-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        showNotice(
                          "Device key saving will be connected to the backend in the next step.",
                        )
                      }
                      aria-label="Save current device key"
                      title="Save current device key"
                      className="bg-gray-100 text-gray-600 px-4 rounded-xl hover:bg-gray-200 transition-all"
                    >
                      <Save size={18} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    New Device Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter new key"
                    className="w-full bg-gray-50 border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    showNotice(
                      "Device key updates are ready in the UI and will be persisted after backend wiring.",
                    )
                  }
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Update Device Key
                </button>
              </div>
            </div>
          </div>
        );
      case "Parent PIN":
        return (
          <div className="p-10 max-w-2xl">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold mb-2">Parental Control</h3>
              <p className="text-gray-500 text-sm mb-8">
                Set a PIN to lock specific categories or channels on your
                device.
              </p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    New 4-Digit PIN
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="0000"
                    className="w-full bg-gray-50 border-none rounded-xl px-5 py-3.5 text-center text-2xl font-bold tracking-[1em] focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    showNotice(
                      "Parental PIN saving will be enabled when the account backend is linked.",
                    )
                  }
                  className="w-full bg-black text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg"
                >
                  Set Parental PIN
                </button>
              </div>
            </div>
          </div>
        );
      case "Account Details":
        return (
          <div className="p-10 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-xl font-bold mb-6">Device Information</h3>
                <div className="space-y-4">
                  <div className="flex justify-between py-3 border-b border-gray-50">
                    <span className="text-gray-500 text-sm">MAC Address</span>
                    <span className="font-mono font-bold text-sm">
                      {macAddress}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-gray-50">
                    <span className="text-gray-500 text-sm">Status</span>
                    <span className="text-red-500 font-bold text-sm">
                      {deviceStatus}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-gray-50">
                    <span className="text-gray-500 text-sm">Expiry Date</span>
                    <span className="font-bold text-sm">{expiryLabel}</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-gray-500 text-sm">Activated App</span>
                    <span className="font-bold text-sm">
                      {latestActivation?.appName || "-"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-xl font-bold mb-6">Usage Statistics</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">Playlist Storage</span>
                      <span className="font-bold">{playlists.length} / 10</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width: `${Math.min((playlists.length / 10) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Backend sync is live. Playlist and activation data shown
                    here come from verify and device-feed endpoints.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case "Switch MAC":
        return (
          <div className="p-10 max-w-2xl">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold mb-2">Switch Device</h3>
              <p className="text-gray-500 text-sm mb-8">
                Transfer your playlists and settings from your current MAC to a
                new device.
              </p>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Current MAC Address
                  </label>
                  <input
                    type="text"
                    value={macAddress}
                    onChange={handleMacChange}
                    className="w-full bg-gray-50 border-none rounded-xl px-5 py-3.5 font-mono text-gray-600 focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    New MAC Address
                  </label>
                  <input
                    type="text"
                    value={newMacAddress}
                    onChange={(e) =>
                      setNewMacAddress(formatMacAddress(e.target.value))
                    }
                    placeholder="00:1A:2B:3C:4D:5E"
                    className="w-full bg-gray-50 border-none rounded-xl px-5 py-3.5 font-mono focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                  <Info className="text-amber-600 shrink-0" size={20} />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Warning:</strong> Switching your MAC address will
                    transfer all your data to the new device. This action cannot
                    be undone easily.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    showNotice(
                      "MAC transfer submission will be connected to the backend next.",
                    )
                  }
                  className="w-full bg-black text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-3 shadow-lg"
                >
                  <Settings size={20} />
                  Transfer to New MAC
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-400 font-bold">
                      Or
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full bg-gray-100 text-gray-600 py-4 rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-3"
                >
                  <LogOut size={20} />
                  Logout and Switch Manually
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const sidebarItems = [
    { name: "Manage Playlists", icon: <LayoutGrid size={20} /> },
    { name: "Activate Device", icon: <Zap size={20} /> },
    { name: "Device Key", icon: <Lock size={20} /> },
    { name: "Parent PIN", icon: <Users size={20} />, separator: true },
    { name: "Account Details", icon: <User size={20} />, separator: true },
    { name: "Switch MAC", icon: <Settings size={20} /> },
    { name: "Logout", icon: <LogOut size={20} />, action: handleLogout },
  ];

  if (isLoggedIn) {
    return (
      <div className="pt-20 min-h-screen bg-white flex">
        {notice && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] rounded-2xl border border-red-500/20 bg-white px-5 py-3 text-sm font-medium text-gray-900 shadow-2xl">
            {notice}
          </div>
        )}
        {/* Sidebar */}
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col pt-8">
          <div className="px-6 space-y-1">
            {sidebarItems.map((item, index) => (
              <React.Fragment key={item.name}>
                <button
                  onClick={() =>
                    item.action ? item.action() : setActiveTab(item.name)
                  }
                  className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl text-[13px] font-bold transition-all ${
                    activeTab === item.name && !item.action
                      ? "bg-black text-white shadow-[0_10px_20px_rgba(0,0,0,0.1)]"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={
                      activeTab === item.name && !item.action
                        ? "text-white"
                        : "text-gray-400"
                    }
                  >
                    {item.icon}
                  </span>
                  {item.name}
                </button>
                {item.separator && (
                  <div className="my-4 border-t border-gray-100 mx-5" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-[#fcfcfc]">
          {/* Content Header */}
          <div className="bg-white px-10 py-5 border-b border-gray-100 flex items-center shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
              {activeTab}
            </h2>
          </div>

          {renderContent()}
        </div>

        {/* Modals */}
        <AnimatePresence>
          {isAddPlaylistOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddPlaylistOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                        <Plus className="text-white" size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Add New Playlist
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddPlaylistOpen(false)}
                      aria-label="Close add playlist dialog"
                      title="Close add playlist dialog"
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <form className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Playlist Name
                      </label>
                      <input
                        type="text"
                        placeholder="My Awesome Playlist"
                        className="w-full bg-gray-50 border-none rounded-xl px-5 py-4 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Playlist URL (M3U)
                      </label>
                      <div className="relative">
                        <Globe
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                          size={18}
                        />
                        <input
                          type="url"
                          placeholder="http://example.com/playlist.m3u"
                          className="w-full bg-gray-50 border-none rounded-xl pl-12 pr-5 py-4 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddPlaylistOpen(false);
                        showNotice(
                          "Playlist form captured. Saving will be enabled when the playlist API is connected.",
                        );
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-[0.98]"
                    >
                      Save Playlist
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          )}

          {isAddXCPlaylistOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddXCPlaylistOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                        <Zap className="text-white" size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Add XC Playlist
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddXCPlaylistOpen(false)}
                      aria-label="Close add XC playlist dialog"
                      title="Close add XC playlist dialog"
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <form className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Playlist Name
                      </label>
                      <input
                        type="text"
                        placeholder="My XC Service"
                        className="w-full bg-gray-50 border-none rounded-xl px-5 py-3.5 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Server URL
                      </label>
                      <div className="relative">
                        <Server
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                          size={18}
                        />
                        <input
                          type="url"
                          placeholder="http://provider.com:8080"
                          className="w-full bg-gray-50 border-none rounded-xl pl-12 pr-5 py-3.5 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                          Username
                        </label>
                        <div className="relative">
                          <UserCircle
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                            size={18}
                          />
                          <input
                            type="text"
                            placeholder="User"
                            className="w-full bg-gray-50 border-none rounded-xl pl-12 pr-5 py-3.5 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                          Password
                        </label>
                        <div className="relative">
                          <Lock
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                            size={18}
                          />
                          <input
                            type="password"
                            placeholder="••••••"
                            className="w-full bg-gray-50 border-none rounded-xl pl-12 pr-5 py-3.5 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddXCPlaylistOpen(false);
                        showNotice(
                          "XC playlist form captured. Saving will be enabled when the playlist API is connected.",
                        );
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-[0.98] mt-4"
                    >
                      Save XC Playlist
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="pt-24 min-h-screen bg-black selection:bg-red-500/30 selection:text-red-200">
      {notice && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[120] rounded-2xl border border-red-500/30 bg-black/90 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-red-600/10">
          {notice}
        </div>
      )}
      {/* Login Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-600/10 blur-[120px] rounded-full" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                {t("Manage")}{" "}
                <span className="text-red-600">{t("Playlists")}</span>
              </h1>
              <p className="text-gray-400 max-w-xl mx-auto">
                {t(
                  "Add, remove or update your M3U playlists for your NOVA PLAYER device.",
                )}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md p-8 md:p-10 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl relative"
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/40">
                <List className="text-white" size={24} />
              </div>

              <form onSubmit={handleLogin} className="space-y-6 mt-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                    {t("MAC Address")}
                  </label>
                  <input
                    type="text"
                    value={macAddress}
                    onChange={handleMacChange}
                    placeholder="00:1A:2B:3C:4D:5E"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all font-mono"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                      {t("Device Key")}
                    </label>
                  </div>
                  <input
                    type="password"
                    value={deviceKey}
                    onChange={(e) => setDeviceKey(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all font-mono"
                    required
                  />
                </div>

                {/* High-Fidelity Simulated reCAPTCHA (Works in Preview) */}
                <div
                  onClick={() => setIsCaptchaChecked(!isCaptchaChecked)}
                  className="flex justify-center py-2 select-none"
                >
                  <div className="w-[302px] h-[76px] bg-[#222] border border-[#333] rounded-[3px] flex items-center px-3 gap-3 cursor-pointer hover:bg-[#252525] transition-colors">
                    <div
                      className={`w-6 h-6 border-2 rounded-[2px] flex items-center justify-center transition-all ${
                        isCaptchaChecked
                          ? "border-[#009688] bg-[#009688]"
                          : "border-[#555] bg-[#333]"
                      }`}
                    >
                      {isCaptchaChecked && (
                        <Check
                          size={16}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </div>
                    <span className="text-[14px] text-white font-sans flex-1">
                      {t("I'm not a robot")}
                    </span>
                    <div className="flex flex-col items-center gap-1">
                      <img
                        src="https://www.gstatic.com/recaptcha/api2/logo_48.png"
                        alt="reCAPTCHA"
                        className="w-8 h-8"
                      />
                      <div className="flex flex-col items-center -space-y-1">
                        <span className="text-[8px] text-[#999] font-sans">
                          reCAPTCHA
                        </span>
                        <div className="flex gap-1 text-[7px] text-[#999] font-sans">
                          <Link to="/legal/privacy" className="hover:underline">
                            Privacy
                          </Link>
                          <span>-</span>
                          <Link to="/legal/terms" className="hover:underline">
                            Terms
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {!isCaptchaChecked && (
                  <p className="text-[10px] text-gray-600 text-center mt-1">
                    Note: Real reCAPTCHA requires allowlisting the preview
                    domain in your Google Console.
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCheckingDevice}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] shadow-lg shadow-red-600/20 group"
                  >
                    {isCheckingDevice
                      ? "Checking device..."
                      : t("MANAGE PLAYLISTS")}
                    <ArrowRight
                      size={18}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-[#050505] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Plus className="text-red-500" size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">
                Add Playlist
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Easily add your M3U URL or upload your file to start watching
                your favorite content.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">
                Delete Playlist
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Remove old or expired playlists from your device with a single
                click.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Save className="text-red-500" size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">
                Update Playlist
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Keep your content fresh by updating your existing playlist links
                anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-24 bg-black border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600/10 mb-8">
            <Info className="text-red-600" size={32} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-6">
            {t("How it works?")}
          </h2>
          <div className="space-y-6 text-gray-400 text-sm leading-relaxed text-left">
            <p>
              1. Enter your <strong>MAC Address</strong> and{" "}
              <strong>Device Key</strong> from the app.
            </p>
            <p>
              2. Click on "Manage Playlists" to enter your device dashboard.
            </p>
            <p>3. Add your M3U URL or upload your file and click "Save".</p>
            <p>
              4. Restart the NOVA PLAYER app on your device to see the changes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
