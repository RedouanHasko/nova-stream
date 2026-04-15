const DEFAULT_API_BASE =
  typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "";

const API_BASE = import.meta.env.VITE_API_URL || DEFAULT_API_BASE;

export function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

async function request(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const nextOptions: RequestOptions = { ...options };

  if (nextOptions.body && !(nextOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    nextOptions.body = JSON.stringify(nextOptions.body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...nextOptions,
    headers,
  });

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
      text ||
      res.statusText ||
      "Request failed";
    throw new Error(message);
  }

  return json;
}

export type PublicApp = {
  id: number;
  name: string;
  logoUrl?: string | null;
  description?: string | null;
  downloadUrl?: string | null;
  status?: string;
};

export type PublicPricingPlan = {
  id: number;
  name: string;
  price: number;
  currency?: string;
  features?: string;
  duration?: string | null;
  planType?: string;
  active?: boolean;
};

export type ActivationCheckResponse = {
  activated: boolean;
  reason?: string;
  device?: {
    id?: number;
    mac?: string;
    deviceKey?: string;
    status?: string;
  };
  activations?: Array<{
    id?: number;
    applicationId?: number;
    appName?: string;
    duration?: string;
    activatedAt?: string;
    expiresAt?: string | null;
    status?: string;
  }>;
  playlists?: Array<{
    id?: number;
    name?: string;
    type?: string;
    url?: string | null;
    targetAppName?: string | null;
    targetApplicationId?: number | null;
    credentials?: {
      host?: string;
      username?: string;
      password?: string;
    } | null;
    rawContent?: string | null;
    updatedAt?: string;
  }>;
};

export async function getPublicApplications(): Promise<PublicApp[]> {
  const result = await request("/api/applications/public", { method: "GET" });
  return Array.isArray(result)
    ? result.map((app) => ({
        ...app,
        logoUrl: resolveImageUrl(app?.logoUrl),
      }))
    : [];
}

export async function getPublicPricingPlans(): Promise<PublicPricingPlan[]> {
  const result = await request("/api/pricing/public", { method: "GET" });
  return Array.isArray(result) ? result : [];
}

export async function verifyActivation(body: {
  mac: string;
  deviceKey: string;
  applicationId?: number | string;
  appName?: string;
}): Promise<ActivationCheckResponse> {
  return request("/api/devices/verify-activation", {
    method: "POST",
    body,
  });
}

export async function getDeviceFeed(body: {
  mac: string;
  deviceKey: string;
  applicationId?: number | string;
  appName?: string;
}) {
  return request("/api/playlists/device-feed", {
    method: "POST",
    body,
  });
}

export async function activatePublicPlan(
  planId: number,
  body: {
    mac: string;
    deviceKey: string;
    applicationId: number | string;
    customerName?: string;
    customerEmail?: string;
    paymentMethod?: string;
    duration?: string;
  },
) {
  return request(`/api/pricing/public/${planId}/activate`, {
    method: "POST",
    body,
  });
}

export type CheckoutResponse = {
  success?: boolean;
  mode: "redirect" | "simulation";
  provider?: string;
  checkoutUrl?: string;
  sessionId?: string;
  gatewayConfigured?: boolean;
  activated?: boolean;
  device?: Record<string, unknown>;
  activations?: unknown[];
};

export async function checkoutPublicPlan(
  planId: number,
  body: {
    mac: string;
    deviceKey: string;
    applicationId: number | string;
    customerName?: string;
    customerEmail?: string;
    duration?: string;
  },
): Promise<CheckoutResponse> {
  return request(`/api/pricing/public/${planId}/checkout`, {
    method: "POST",
    body,
  });
}

export async function confirmPublicCheckout(
  sessionId: string,
): Promise<CheckoutResponse> {
  return request("/api/pricing/public/confirm-checkout", {
    method: "POST",
    body: { sessionId },
  });
}

export async function getPublicPaymentConfig(): Promise<{
  provider: string;
  configured: boolean;
  mode: string;
  publishableKey: string | null;
}> {
  return request("/api/pricing/public/payment-config", { method: "GET" });
}
