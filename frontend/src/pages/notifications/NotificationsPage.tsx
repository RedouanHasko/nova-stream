import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../lib/api";
import {
  isCreditsNotification,
  resolveNotificationTarget,
} from "../../lib/utils";

function formatNotificationTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Just now";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const pageSize = 20;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({
        page,
        pageSize,
        read: showUnreadOnly ? "unread" : "all",
      });
      const items = Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res)
          ? res
          : [];
      setNotifications(items);
      setUnreadCount(Number(res?.unreadCount || 0));
      setTotal(Number(res?.total || items.length || 0));
      setHasMore(Boolean(res?.hasMore));
    } catch (error) {
      console.error("Failed to load notifications", error);
      setNotifications([]);
      setUnreadCount(0);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, showUnreadOnly]);

  useEffect(() => {
    loadNotifications();
    const refresh = () => {
      loadNotifications().catch(() => {
        /* ignore */
      });
    };

    const unsubscribe = api.subscribeToNotifications(() => {
      refresh();
    });

    window.addEventListener("notifications:refresh", refresh);
    return () => {
      window.removeEventListener("notifications:refresh", refresh);
      unsubscribe();
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification: any) => {
    try {
      if (!notification.read) {
        await api.markNotificationRead(Number(notification.id));
        setNotifications((current) =>
          current.map((item) =>
            Number(item.id) === Number(notification.id)
              ? { ...item, read: true, readAt: new Date().toISOString() }
              : item,
          ),
        );
        setUnreadCount((current) => Math.max(current - 1, 0));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }

    if (isCreditsNotification(notification)) {
      window.dispatchEvent(new Event("credits:refresh"));
    }

    navigate(resolveNotificationTarget(notification, user?.role));
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review all account and system updates in one simple place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setShowUnreadOnly((current) => !current);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors"
          >
            {showUnreadOnly ? "Show all" : "Unread only"}
          </button>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <p className="text-sm font-semibold text-foreground">
            All notifications
          </p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "Everything is up to date"}
            {total > 0 ? ` • ${total} total` : ""}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="rounded-full bg-foreground/5 p-3">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                No notifications yet
              </p>
              <p className="text-sm text-muted-foreground">
                New updates will appear here as your account activity grows.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors sm:px-6 hover:bg-foreground/5 ${
                  notification.read ? "opacity-85" : "bg-foreground/5"
                }`}
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    notification.read ? "bg-border" : "bg-rose-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {notification.title}
                    </p>
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {formatNotificationTime(notification.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {notification.message}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm sm:px-6">
            <span className="text-muted-foreground">Page {page}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                className="rounded-lg bg-foreground/5 px-3 py-1.5 text-foreground ring-1 ring-inset ring-border disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg bg-foreground/5 px-3 py-1.5 text-foreground ring-1 ring-inset ring-border disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default NotificationsPage;
