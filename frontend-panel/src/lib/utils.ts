import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMAC(value: string) {
  // Remove all non-hex characters
  const hex = value.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  // Limit to 12 characters
  const limited = hex.slice(0, 12);
  // Insert colons every 2 characters
  const formatted = limited.match(/.{1,2}/g)?.join(":") || limited;
  return formatted;
}

export function parseTransactionNoteObject(note: unknown) {
  if (typeof note !== "string") return null;

  const trimmed = note.trim();
  if (!trimmed) return null;

  const looksStructured =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!looksStructured) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function buildCreditsNotificationLink(
  tab?: string,
  requestId?: string | number,
) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", String(tab));
  if (requestId) params.set("requestId", String(requestId));
  const suffix = params.toString();
  return suffix ? `/credits?${suffix}` : "/credits";
}

export function isCreditsNotification(notification: any) {
  const type = (notification?.type || "").toString().toUpperCase();
  const link = (notification?.link || "").toString();

  return (
    link.startsWith("/credits") ||
    type.startsWith("REQUEST_") ||
    [
      "CREDITS_RECEIVED",
      "CREDITS_ADDED",
      "CREDITS_REVOKED",
      "CREDITS_SENT",
      "CREDITS_RETURNED",
    ].includes(type)
  );
}

export function resolveNotificationTarget(
  notification: any,
  currentUserRole?: string | null,
) {
  const fallbackLink = (notification?.link || "/notifications").toString();
  const role = (currentUserRole || "").toString().toLowerCase();
  const type = (notification?.type || "").toString().toUpperCase();
  const data =
    notification?.data && typeof notification.data === "object"
      ? notification.data
      : {};

  let existingTab = "";
  let existingRequestId = "";

  try {
    const url = new URL(
      fallbackLink,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    if (url.pathname === "/credits") {
      existingTab = url.searchParams.get("tab") || "";
      existingRequestId = url.searchParams.get("requestId") || "";
    }
  } catch {
    return fallbackLink;
  }

  const requestId = data.requestId || existingRequestId;
  const requestType = (data.requestType || "").toString().toUpperCase();
  const tab = (data.tab || existingTab || "").toString();

  if (tab) {
    return buildCreditsNotificationLink(tab, requestId);
  }

  if (type === "REQUEST_PENDING") {
    if (role === "superadmin" && requestType === "RECHARGE_REQUEST") {
      return buildCreditsNotificationLink("credit-logs", requestId);
    }
    return buildCreditsNotificationLink("pending-requests", requestId);
  }

  if (
    ["REQUEST_SUBMITTED", "REQUEST_APPROVED", "REQUEST_REJECTED"].includes(type)
  ) {
    if (requestType === "RECHARGE_REQUEST") {
      return buildCreditsNotificationLink("credit-logs", requestId);
    }
    return buildCreditsNotificationLink(
      role === "subreseller" ? "my-charge" : "pending-requests",
      requestId,
    );
  }

  if (isCreditsNotification(notification)) {
    if (role === "subreseller") {
      return buildCreditsNotificationLink("my-charge", requestId);
    }
    return buildCreditsNotificationLink("credit-logs", requestId);
  }

  return fallbackLink;
}

export function formatTransactionNote(note: unknown, type?: string) {
  if (note === null || note === undefined) return "—";
  if (typeof note !== "string") return String(note);

  const trimmed = note.trim();
  if (!trimmed) return "—";

  const parsed = parseTransactionNoteObject(trimmed);
  if (!parsed) return trimmed;

  const upperType = (type || "").toString().toUpperCase();
  const joinParts = (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(" • ");

  if (
    upperType === "PUBLIC_PLAN_PURCHASE" ||
    parsed.source === "public_landing_page"
  ) {
    return (
      joinParts([
        parsed.customerName
          ? `Client: ${parsed.customerName}`
          : "Direct client activation",
        parsed.customerEmail ? `Email: ${parsed.customerEmail}` : null,
        parsed.appName ? `App: ${parsed.appName}` : null,
        parsed.planName ? `Plan: ${parsed.planName}` : null,
        parsed.mac ? `MAC: ${parsed.mac}` : null,
        parsed.deviceKey ? `Key: ${parsed.deviceKey}` : null,
        parsed.paymentMethod ? `Payment: ${parsed.paymentMethod}` : null,
        parsed.paymentReference ? `Ref: ${parsed.paymentReference}` : null,
      ]) || "Direct client activation"
    );
  }

  if (Array.isArray(parsed.apps)) {
    const appsSummary = parsed.apps
      .map((app: any) => {
        if (!app || typeof app !== "object") return null;
        const name = app.name || app.appName || app.id;
        const duration = app.duration ? ` (${app.duration})` : "";
        return name ? `${name}${duration}` : null;
      })
      .filter(Boolean)
      .join(", ");

    return (
      joinParts([
        parsed.mac ? `MAC: ${parsed.mac}` : null,
        parsed.deviceKey ? `Key: ${parsed.deviceKey}` : null,
        appsSummary ? `Apps: ${appsSummary}` : null,
        parsed.remarks ? `Remarks: ${parsed.remarks}` : null,
      ]) || trimmed
    );
  }

  return (
    joinParts([
      parsed.message ? `Message: ${parsed.message}` : null,
      parsed.note ? `Note: ${parsed.note}` : null,
      parsed.mac ? `MAC: ${parsed.mac}` : null,
      parsed.deviceKey ? `Key: ${parsed.deviceKey}` : null,
      parsed.paymentReference ? `Ref: ${parsed.paymentReference}` : null,
    ]) || trimmed
  );
}
