import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import api from "../../../lib/api";
import {
  Filter,
  List,
  Loader2,
  PencilLine,
  Search,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { DataViewToggle } from "../../../components/common/DataViewToggle";
import { ConfirmModal } from "../../../components/common/ConfirmModal";
import { useAuth } from "../../../contexts/AuthContext";
import { useI18n } from "../../../contexts/I18nContext";
import { formatMAC } from "../../../lib/utils";

export function ActivatedAppsList() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get("search") || "";
  const isAdmin = user?.role === "superadmin";
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showFilters, setShowFilters] = useState(false);
  const [appFilter, setAppFilter] = useState("All");
  const [activations, setActivations] = useState<any[]>([]);
  const [editingActivation, setEditingActivation] = useState<any | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    mac: "",
    deviceKey: "",
    domainUrl: "",
    status: "ACTIVE",
  });
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [isDeletingDevice, setIsDeletingDevice] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadActivations = async () => {
    const res = await api.getActivations();
    setActivations(Array.isArray(res) ? res : []);
  };

  useEffect(() => {
    setSearchTerm(requestedSearch);
  }, [requestedSearch]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getActivations();
        if (mounted) setActivations(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error(e);
        if (mounted) {
          setFeedback({
            type: "error",
            message: t("Failed to load activated apps."),
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleOpenEdit = (act: any) => {
    setFeedback(null);
    setEditingActivation(act);
    setIsDeleteConfirmOpen(false);
    setDeviceForm({
      mac: act.device?.mac || "",
      deviceKey: act.device?.deviceKey || "",
      domainUrl: act.device?.domainUrl || "",
      status: (act.device?.status || "ACTIVE").toString().toUpperCase(),
    });
  };

  const handleCloseEdit = () => {
    if (isSavingDevice || isDeletingDevice) return;
    setEditingActivation(null);
    setDeviceForm({
      mac: "",
      deviceKey: "",
      domainUrl: "",
      status: "ACTIVE",
    });
    setIsDeleteConfirmOpen(false);
  };

  const handleSaveDeviceChanges = async (statusOverride?: string) => {
    const deviceId = Number(editingActivation?.device?.id || 0);
    const normalizedMac = formatMAC(deviceForm.mac);

    if (!deviceId) {
      setFeedback({
        type: "error",
        message: t("This row is missing a valid device record."),
      });
      return;
    }

    if (normalizedMac.replace(/[^A-F0-9]/g, "").length !== 12) {
      setFeedback({
        type: "error",
        message: t("Enter a valid MAC address before saving."),
      });
      return;
    }

    setIsSavingDevice(true);
    setFeedback(null);

    try {
      const nextStatus = (statusOverride || deviceForm.status || "ACTIVE")
        .toString()
        .toUpperCase();

      await api.updateDevice(deviceId, {
        mac: normalizedMac,
        deviceKey: deviceForm.deviceKey.trim() || null,
        domainUrl: deviceForm.domainUrl.trim() || null,
        ...(isAdmin ? { status: nextStatus } : {}),
      });

      await loadActivations();
      setEditingActivation(null);
      setFeedback({
        type: "success",
        message:
          nextStatus === "BLOCKED"
            ? t("Device {{mac}} has been blocked.", { mac: normalizedMac })
            : t("Device {{mac}} was updated successfully.", {
                mac: normalizedMac,
              }),
      });
    } catch (e: any) {
      setFeedback({
        type: "error",
        message: e?.message || t("Failed to update this device."),
      });
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async () => {
    const deviceId = Number(editingActivation?.device?.id || 0);
    if (!deviceId) {
      setFeedback({
        type: "error",
        message: t("This row is missing a valid device record."),
      });
      return;
    }

    setIsDeletingDevice(true);
    setFeedback(null);

    try {
      await api.deleteDevice(deviceId);
      await loadActivations();
      setIsDeleteConfirmOpen(false);
      setEditingActivation(null);
      setFeedback({
        type: "success",
        message: t("The device and its linked activations were deleted."),
      });
    } catch (e: any) {
      setFeedback({
        type: "error",
        message: e?.message || t("Failed to delete this device."),
      });
    } finally {
      setIsDeletingDevice(false);
    }
  };

  const availableApps = useMemo(
    () =>
      Array.from(
        new Set(activations.map((act) => act.appName).filter(Boolean)),
      ),
    [activations],
  );

  const filteredActivations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return activations.filter((act) => {
      const mac = (act.device?.mac || String(act.deviceId || "")).toLowerCase();
      const app = (act.appName || "").toLowerCase();
      const deviceKey = (act.device?.deviceKey || "").toLowerCase();

      const matchesSearch =
        !query ||
        mac.includes(query) ||
        app.includes(query) ||
        deviceKey.includes(query);
      const matchesApp =
        appFilter === "All" || (act.appName || "") === appFilter;

      return matchesSearch && matchesApp;
    });
  }, [activations, searchTerm, appFilter]);

  const getExpiryLabel = (act: any) => {
    if ((act.duration || "").toString().toLowerCase() === "lifetime") {
      return t("Lifetime");
    }
    if (act.expiresAt) {
      return new Date(act.expiresAt).toLocaleDateString(locale);
    }
    return "—";
  };

  const getStatusLabel = (act: any) => {
    const deviceStatus = (act.device?.status || "").toString().toUpperCase();
    if (deviceStatus === "BLOCKED") return "BLOCKED";
    if (act.status) return act.status.toString().toUpperCase();
    if (act.expiresAt && new Date(act.expiresAt).getTime() <= Date.now()) {
      return "EXPIRED";
    }
    return "ACTIVE";
  };

  const getStatusBadgeClasses = (status: string) => {
    if (status === "ACTIVE") {
      return "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20";
    }
    if (status === "EXPIRED" || status === "BLOCKED") {
      return "text-rose-500 bg-rose-500/10 ring-rose-500/20";
    }
    return "text-amber-500 bg-amber-500/10 ring-amber-500/20";
  };

  const getStatusDotClasses = (status: string) => {
    if (status === "ACTIVE") return "bg-emerald-500";
    if (status === "EXPIRED" || status === "BLOCKED") {
      return "bg-rose-500";
    }
    return "bg-amber-500";
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
              <List className="h-5 w-5 text-emerald-500" />
              {t("Activated Apps List")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "View and filter the active and expired app activations under your account.",
              )}
            </p>
          </div>

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
                className="block w-full rounded-xl border-0 bg-input py-2 pl-9 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("Search MAC, key, or app...")}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className="inline-flex items-center justify-center rounded-xl bg-foreground/5 px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-foreground/10 gap-2 transition-colors"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              {showFilters ? t("Hide Filters") : t("Filter")}
            </button>
            <DataViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {showFilters && (
          <div className="border-b border-border bg-foreground/5 px-6 py-4">
            <div className="max-w-xs">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {t("Application")}
              </label>
              <select
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
                aria-label={t("Filter activated apps by application")}
                title={t("Filter activated apps by application")}
                className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
              >
                <option value="All">{t("All Applications")}</option>
                {availableApps.map((app) => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`mx-6 mt-4 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                : "border-rose-500/20 bg-rose-500/10 text-rose-600"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-foreground/5">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-6 pr-3 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("MAC Address")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Device Key")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Application")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Activation Date")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Expiry Date")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-4 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t("Status")}
                  </th>
                  <th scope="col" className="relative py-4 pl-3 pr-6">
                    <span className="sr-only">{t("Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent">
                {filteredActivations.map((act) => (
                  <tr
                    key={act.id}
                    className="hover:bg-foreground/5 transition-colors"
                  >
                    <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-mono font-medium text-foreground">
                      {act.device?.mac || act.deviceId}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-muted-foreground">
                      {act.device?.deviceKey || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {act.appName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {new Date(act.activatedAt).toLocaleString(locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      {getExpiryLabel(act)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClasses(
                          getStatusLabel(act),
                        )}`}
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${getStatusDotClasses(
                            getStatusLabel(act),
                          )}`}
                        ></div>
                        {t(getStatusLabel(act))}
                      </span>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(act)}
                        disabled={!act.device?.mac}
                        className="inline-flex items-center gap-1.5 text-emerald-500 hover:text-emerald-600 transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("Manage Device")}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredActivations.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {t("No activated apps found matching your filters.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredActivations.length > 0 ? (
              filteredActivations.map((act) => (
                <div
                  key={act.id}
                  className="rounded-2xl border border-border bg-foreground/5 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("MAC Address")}
                      </div>
                      <div className="font-mono text-sm font-medium text-foreground">
                        {act.device?.mac || act.deviceId}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClasses(
                        getStatusLabel(act),
                      )}`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${getStatusDotClasses(
                          getStatusLabel(act),
                        )}`}
                      ></div>
                      {t(getStatusLabel(act))}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Device Key")}
                      </span>
                      <span className="font-mono text-foreground max-w-48 truncate">
                        {act.device?.deviceKey || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Application")}
                      </span>
                      <span className="font-medium text-foreground">
                        {act.appName || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Activated")}
                      </span>
                      <span className="text-foreground">
                        {new Date(act.activatedAt).toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("Expiry")}
                      </span>
                      <span className="text-foreground">
                        {getExpiryLabel(act)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(act)}
                      disabled={!act.device?.mac}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500 hover:text-emerald-600 transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      {t("Manage Device")}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3 py-10 text-center text-sm text-muted-foreground">
                {t("No activated apps found matching your filters.")}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-border bg-foreground/5 px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {t("Showing all")}
            <span className="font-medium text-foreground">
              {filteredActivations.length}
            </span>{" "}
            {t("results")}
          </p>
        </div>
      </div>

      {editingActivation && (
        <>
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("Manage Device")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      "Update the device info, block access, or delete the device.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("Close device management dialog")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="deviceMac"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    {t("MAC Address")}
                  </label>
                  <input
                    id="deviceMac"
                    type="text"
                    value={deviceForm.mac}
                    onChange={(e) =>
                      setDeviceForm((current) => ({
                        ...current,
                        mac: formatMAC(e.target.value),
                      }))
                    }
                    className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 font-mono uppercase text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
                    placeholder="XX:XX:XX:XX:XX:XX"
                  />
                </div>

                <div>
                  <label
                    htmlFor="deviceKey"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    {t("Device Key")}
                  </label>
                  <input
                    id="deviceKey"
                    type="text"
                    value={deviceForm.deviceKey}
                    onChange={(e) =>
                      setDeviceForm((current) => ({
                        ...current,
                        deviceKey: e.target.value,
                      }))
                    }
                    className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
                    placeholder={t("Player-generated device key")}
                  />
                </div>

                <div>
                  <label
                    htmlFor="domainUrl"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    {t("Domain URL")}
                  </label>
                  <input
                    id="domainUrl"
                    type="text"
                    value={deviceForm.domainUrl}
                    onChange={(e) =>
                      setDeviceForm((current) => ({
                        ...current,
                        domainUrl: e.target.value,
                      }))
                    }
                    className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm"
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="deviceStatus"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    {t("Device Status")}
                  </label>
                  <select
                    id="deviceStatus"
                    value={deviceForm.status}
                    onChange={(e) =>
                      setDeviceForm((current) => ({
                        ...current,
                        status: e.target.value,
                      }))
                    }
                    disabled={!isAdmin}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 px-3 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 disabled:opacity-70 sm:text-sm"
                  >
                    <option value="ACTIVE">{t("Active")}</option>
                    <option value="INACTIVE">{t("Inactive")}</option>
                    <option value="EXPIRED">{t("Expired")}</option>
                    <option value="BLOCKED">{t("Blocked")}</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-foreground/5 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("Application")}
                  </span>
                  <span className="font-medium text-foreground">
                    {editingActivation.appName || "—"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("Activation Status")}
                  </span>
                  <span className="font-medium text-foreground">
                    {t(getStatusLabel(editingActivation))}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("Activation Date")}
                  </span>
                  <span className="text-foreground">
                    {new Date(editingActivation.activatedAt).toLocaleString(
                      locale,
                    )}
                  </span>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveDeviceChanges(
                        deviceForm.status === "BLOCKED" ? "ACTIVE" : "BLOCKED",
                      );
                    }}
                    disabled={isSavingDevice || isDeletingDevice}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-500/25 disabled:opacity-60"
                  >
                    <ShieldOff className="h-4 w-4" />
                    {deviceForm.status === "BLOCKED"
                      ? t("Unblock Device")
                      : t("Block Device")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    disabled={isSavingDevice || isDeletingDevice}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-500/25 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("Delete Device")}
                  </button>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isSavingDevice || isDeletingDevice}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveDeviceChanges();
                  }}
                  disabled={isSavingDevice || isDeletingDevice}
                  className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
                >
                  {isSavingDevice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PencilLine className="h-4 w-4" />
                  )}
                  {isSavingDevice ? t("Saving...") : t("Save Changes")}
                </button>
              </div>
            </div>
          </div>

          <ConfirmModal
            isOpen={isDeleteConfirmOpen}
            onClose={() => {
              if (!isDeletingDevice) setIsDeleteConfirmOpen(false);
            }}
            onConfirm={() => {
              void handleDeleteDevice();
            }}
            title="Delete this device?"
            message="This will remove the device and its linked activations from the panel. This action cannot be undone."
            confirmLabel={isDeletingDevice ? "Deleting..." : "Delete Device"}
            cancelLabel="Cancel"
            variant="danger"
          />
        </>
      )}
    </div>
  );
}
