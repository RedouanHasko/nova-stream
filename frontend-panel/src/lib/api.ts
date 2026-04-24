const DEFAULT_API_BASE =
  typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "";

const API_BASE = import.meta.env.VITE_API_URL || DEFAULT_API_BASE;
const LEGACY_TOKEN_KEY = "auth_token";

export function setToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return;
  }

  // Sessions are maintained by the server through a secure httpOnly cookie.
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getToken(): string | null {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return null;
}

export function clearToken() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

function buildQueryString(params: Record<string, any> = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

async function request(path: string, options: any = {}) {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers || {}) };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const fetchOptions = { credentials: "include", ...options, headers };
  const res = await fetch(`${API_BASE}${path}`, fetchOptions);
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      json?.error ||
      json?.message ||
      (Array.isArray(json?.errors) ? json.errors[0]?.msg : null) ||
      text ||
      res.statusText;
    const error = new Error(message || "Request failed");
    if (json && typeof json === "object") {
      Object.assign(error, json);
    }
    throw error;
  }

  return json;
}

export async function login(
  email: string,
  password: string,
  captchaToken?: string | null,
) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password, captchaToken },
  });
  // Server sets httpOnly cookie; do not persist token in localStorage for security.
  if (data && data.token) setToken(data.token);
  return data;
}

export async function requestPasswordResetCode(
  email: string,
  phone: string,
  captchaToken?: string | null,
) {
  return request("/api/auth/request-verification-code", {
    method: "POST",
    body: { email, phone, purpose: "PASSWORD_RESET", captchaToken },
  });
}

export async function requestSignupVerificationCode(
  email: string,
  phone: string,
  signupKey?: string,
  captchaToken?: string | null,
) {
  return request("/api/auth/request-verification-code", {
    method: "POST",
    headers: signupKey ? { "x-signup-key": signupKey } : undefined,
    body: { email, phone, purpose: "SIGNUP", signupKey, captchaToken },
  });
}

export async function registerPublicReseller(body: {
  name: string;
  email: string;
  phone: string;
  password: string;
  verificationCode?: string;
  signupKey?: string;
  captchaToken?: string | null;
}) {
  return request("/api/auth/register", {
    method: "POST",
    headers: body.signupKey ? { "x-signup-key": body.signupKey } : undefined,
    body: {
      ...body,
      role: "reseller",
      signupKey: body.signupKey,
    },
  });
}

export async function requestPasswordReset(
  email: string,
  phone: string,
  verificationCode: string,
  newPassword: string,
) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: { email, phone, verificationCode, newPassword },
  });
}

export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (e) {
    // ignore
  }
  clearToken();
}

export async function me() {
  return request("/api/auth/me", { method: "GET" });
}

export async function getPricingPlans(planType?: string) {
  const search = new URLSearchParams();
  if (planType) {
    search.set("type", planType);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return request(`/api/pricing${suffix}`, { method: "GET" });
}

export async function getPublicPricingPlans() {
  return request("/api/pricing/public", { method: "GET" });
}

export async function getPublicPaymentConfig() {
  return request("/api/pricing/public/payment-config", { method: "GET" });
}

export async function purchasePublicPlan(planId: number, body: any = {}) {
  return request(`/api/pricing/public/${planId}/checkout`, {
    method: "POST",
    body,
  });
}

export async function confirmPublicPlanCheckout(sessionId: string) {
  return request("/api/pricing/public/confirm-checkout", {
    method: "POST",
    body: { sessionId },
  });
}

export async function createPricingPlan(data: any) {
  return request("/api/pricing", { method: "POST", body: data });
}

export async function updatePricingPlan(id: number, data: any) {
  return request(`/api/pricing/${id}`, { method: "PUT", body: data });
}

export async function deletePricingPlan(id: number) {
  return request(`/api/pricing/${id}`, { method: "DELETE" });
}

export async function purchasePlan(planId: number, body: any = {}) {
  return request(`/api/pricing/${planId}/purchase`, {
    method: "POST",
    body,
  });
}

// Devices & activations
export async function getDevices(params: Record<string, any> = {}) {
  return request(`/api/devices${buildQueryString(params)}`, {
    method: "GET",
  });
}

export async function getDevice(id: number) {
  return request(`/api/devices/${id}`, { method: "GET" });
}

export async function createDevice(data: any) {
  return request("/api/devices", { method: "POST", body: data });
}

export async function updateDevice(id: number, data: any) {
  return request(`/api/devices/${id}`, { method: "PUT", body: data });
}

export async function deleteDevice(id: number) {
  return request(`/api/devices/${id}`, { method: "DELETE" });
}

export async function checkMac(
  mac: string,
  deviceKey?: string,
  applicationId?: string | number,
) {
  return request("/api/devices/check-mac", {
    method: "POST",
    body: { mac, deviceKey, applicationId },
  });
}

export async function verifyActivation(body: {
  mac: string;
  deviceKey: string;
  applicationId?: string | number;
  appName?: string;
}) {
  return request("/api/devices/verify-activation", {
    method: "POST",
    body,
  });
}

export async function activateDevice(
  mac: string,
  deviceKey: string,
  apps: any[],
  ownerResellerId?: number,
  payerResellerId?: number,
  remarks?: string,
) {
  return request("/api/devices/activate", {
    method: "POST",
    body: { mac, deviceKey, apps, ownerResellerId, payerResellerId, remarks },
  });
}

export async function getActivations() {
  return request("/api/devices/activations", { method: "GET" });
}

// Resellers
export async function getResellers(params: Record<string, any> = {}) {
  return request(`/api/resellers${buildQueryString(params)}`, {
    method: "GET",
  });
}

export async function getResellerFull(id: number) {
  return request(`/api/resellers/${id}/full`, { method: "GET" });
}

export async function createReseller(data: any) {
  return request("/api/resellers", { method: "POST", body: data });
}

export async function updateReseller(id: number, data: any) {
  return request(`/api/resellers/${id}`, { method: "PUT", body: data });
}

export async function deleteReseller(id: number) {
  return request(`/api/resellers/${id}`, { method: "DELETE" });
}

// Parent change requests
export async function getParentChangeRequests() {
  return request("/api/parent-change-requests", { method: "GET" });
}

export async function createParentChangeRequest(body: any) {
  return request(`/api/parent-change-requests`, { method: "POST", body });
}

export async function approveParentChangeRequest(id: number) {
  return request(`/api/parent-change-requests/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectParentChangeRequest(id: number) {
  return request(`/api/parent-change-requests/${id}/reject`, {
    method: "POST",
  });
}

// Credits
export async function transferCredits(body: any) {
  return request("/api/credits/transfer", { method: "POST", body });
}

export async function getCreditLogs(params: Record<string, any> = {}) {
  return request(`/api/credits/logs${buildQueryString(params)}`, {
    method: "GET",
  });
}

export async function getTransactionDetail(id: number) {
  return request(`/api/credits/transactions/${id}`, { method: "GET" });
}

export async function getCreditSummary() {
  return request("/api/credits/summary", { method: "GET" });
}

// Audit Logs (superadmin only)
export async function getAuditLogs(params: Record<string, any> = {}) {
  return request(`/api/audit-logs${buildQueryString(params)}`, { method: "GET" });
}

export async function getAuditLogEvents() {
  return request("/api/audit-logs/events", { method: "GET" });
}

export async function getDashboardSummary() {
  return request("/api/dashboard/summary", { method: "GET" });
}

export async function downloadDashboardReportPdf() {
  const res = await fetch(`${API_BASE}/api/dashboard/summary/report`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to download report");
  }

  return res.blob();
}

export async function getGlobalSearch(params: Record<string, any> = {}) {
  return request(`/api/search/global${buildQueryString(params)}`, {
    method: "GET",
  });
}

export async function getCreditRequests() {
  return request("/api/credits/requests", { method: "GET" });
}

export async function createCreditRequest(body: any) {
  return request("/api/credits/requests", { method: "POST", body });
}

export async function approveCreditRequest(id: number) {
  return request(`/api/credits/requests/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectCreditRequest(id: number) {
  return request(`/api/credits/requests/${id}/reject`, {
    method: "POST",
  });
}

// Users
export async function getUsers() {
  return request("/api/users", { method: "GET" });
}

export async function createUser(data: any) {
  return request("/api/users", { method: "POST", body: data });
}

export async function updateProfile(data: any) {
  return request("/api/users/me", { method: "PATCH", body: data });
}

// App catalog
export async function getAppCatalog() {
  return request("/api/devices/catalog", { method: "GET" });
}

// System settings
export async function getSettings() {
  return request("/api/settings", { method: "GET" });
}

export async function updateSetting(key: string, value: string) {
  return request(`/api/settings/${key}`, { method: "PUT", body: { value } });
}

export async function getIntegrations() {
  return request("/api/integrations", { method: "GET" });
}

export async function getWhatsAppGatewayStatus() {
  return request("/api/whatsapp-gateway/status", { method: "GET" });
}

export async function startWhatsAppGateway() {
  return request("/api/whatsapp-gateway/start", { method: "POST" });
}

export async function createIntegration(data: any) {
  return request("/api/integrations", { method: "POST", body: data });
}

export async function updateIntegration(id: number, data: any) {
  return request(`/api/integrations/${id}`, { method: "PUT", body: data });
}

export async function updateDeviceDomain(mac: string, domainUrl: string) {
  return request("/api/devices/change-domain", {
    method: "POST",
    body: { mac, domainUrl },
  });
}

export async function adminChangeDeviceKey(mac: string, newDeviceKey: string) {
  return request("/api/devices/admin-change-key", {
    method: "POST",
    body: { mac, newDeviceKey },
  });
}

export async function resetPlaylists(mac: string) {
  return request("/api/devices/reset-playlists", {
    method: "POST",
    body: { mac },
  });
}

export async function switchMac(oldMac: string, newMac: string) {
  return request("/api/devices/switch-mac", {
    method: "POST",
    body: { oldMac, newMac },
  });
}

export async function assignPlaylistToDevice(payload: any) {
  return request("/api/playlists/assign-to-device", {
    method: "POST",
    body: payload,
  });
}

// Applications
export async function getApplications() {
  return request("/api/applications", { method: "GET" });
}

export async function getPublicApplications() {
  return request("/api/applications/public", { method: "GET" });
}

export async function createApplication(data: any) {
  return request("/api/applications", { method: "POST", body: data });
}

export async function updateApplication(id: number, data: any) {
  return request(`/api/applications/${id}`, { method: "PUT", body: data });
}

export async function deleteApplication(id: number) {
  return request(`/api/applications/${id}`, { method: "DELETE" });
}

// Uploads
export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return request("/api/upload", {
    method: "POST",
    body: formData,
  });
}

// Notifications
export async function getNotifications(params: Record<string, any> = {}) {
  return request(`/api/notifications${buildQueryString(params)}`, {
    method: "GET",
  });
}

export async function markNotificationRead(id: number) {
  return request(`/api/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  return request("/api/notifications/read-all", { method: "POST" });
}

export function subscribeToNotifications(
  onEvent: (payload: any) => void,
  onError?: (error: Event) => void,
) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const streamUrl = `${API_BASE}/api/notifications/stream`;
  const source = new EventSource(streamUrl, { withCredentials: true });
  const handler = (event: MessageEvent) => {
    try {
      onEvent(event.data ? JSON.parse(event.data) : null);
    } catch {
      onEvent(null);
    }
  };

  source.addEventListener("notification", handler);
  source.addEventListener("notification-sync", handler);
  source.onerror = (error) => {
    onError?.(error);
  };

  return () => {
    source.close();
  };
}

// Image Resolver
export function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export default {
  login,
  requestPasswordResetCode,
  requestSignupVerificationCode,
  registerPublicReseller,
  requestPasswordReset,
  logout,
  me,
  getPricingPlans,
  getPublicPricingPlans,
  getPublicPaymentConfig,
  purchasePublicPlan,
  confirmPublicPlanCheckout,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  purchasePlan,
  // devices
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  checkMac,
  verifyActivation,
  activateDevice,
  getActivations,
  // resellers
  getResellers,
  getResellerFull,
  createReseller,
  updateReseller,
  deleteReseller,
  // parent change requests
  getParentChangeRequests,
  createParentChangeRequest,
  approveParentChangeRequest,
  rejectParentChangeRequest,
  // credits
  transferCredits,
  getCreditLogs,
  getTransactionDetail,
  getCreditSummary,
  getDashboardSummary,
  getGlobalSearch,
  getCreditRequests,
  createCreditRequest,
  approveCreditRequest,
  rejectCreditRequest,
  // users
  getUsers,
  createUser,
  updateProfile,
  // app catalog
  getAppCatalog,
  // settings
  getSettings,
  updateSetting,
  getIntegrations,
  getWhatsAppGatewayStatus,
  startWhatsAppGateway,
  createIntegration,
  updateIntegration,
  updateDeviceDomain,
  adminChangeDeviceKey,
  resetPlaylists,
  switchMac,
  assignPlaylistToDevice,
  getApplications,
  getPublicApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  uploadImage,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  resolveImageUrl,
  setToken,
  getToken,
  clearToken,
  getAuditLogs,
  getAuditLogEvents,
};
