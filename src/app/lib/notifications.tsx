/**
 * Notification system context & hooks.
 * Provides real-time polling, unread count, and mascot-triggered alerts.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { useAuth } from "./auth";
import { APP_CONFIG } from "./config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export interface Notification {
  id: string;
  type: "order_update" | "admin_broadcast" | "admin_targeted" | "admin_message" | "order_modified" | "order_cancelled";
  title: string;
  message: string;
  url?: string;
  orderId?: string;
  orderNumber?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  /** Latest 5 for dropdown */
  recentNotifications: Notification[];
  /** True when a NEW notification arrived since last check (triggers mascot) */
  hasNewNotification: boolean;
  /** Dismiss the mascot new-notification alert */
  dismissNewAlert: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NOTIF_CTX_KEY = "__TIKKA_NOTIF_CTX__";
const NotificationContext = ((globalThis as any)[NOTIF_CTX_KEY] ??=
  createContext<NotificationContextValue | undefined>(undefined)) as React.Context<NotificationContextValue | undefined>;

const POLL_INTERVAL = 15_000; // 15 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const prevCountRef = useRef<number>(0);
  const initialFetchDone = useRef(false);

  const fetchNotifications = useCallback(async (silent = true) => {
    if (!user?.id) return;
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`${API_BASE}/notifications/${user.id}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const notifs: Notification[] = data.notifications || [];
        setNotifications(notifs);

        // Detect new notifications (only after initial fetch)
        const currentUnread = notifs.filter(n => !n.read).length;
        if (initialFetchDone.current && currentUnread > prevCountRef.current) {
          setHasNewNotification(true);
        }
        prevCountRef.current = currentUnread;
        initialFetchDone.current = true;
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Initial fetch + polling
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      prevCountRef.current = 0;
      initialFetchDone.current = false;
      return;
    }
    fetchNotifications(false);
    const interval = setInterval(() => fetchNotifications(true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user?.id, fetchNotifications]);

  const dismissNewAlert = useCallback(() => setHasNewNotification(false), []);

  const markAsRead = useCallback(async (id: string) => {
    if (!user?.id) return;
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch(`${API_BASE}/notifications/${user.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ notificationId: id }),
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch(`${API_BASE}/notifications/${user.id}/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [user?.id]);

  const clearAll = useCallback(async () => {
    if (!user?.id) return;
    setNotifications([]);
    prevCountRef.current = 0;
    try {
      await fetch(`${API_BASE}/notifications/${user.id}/clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
    } catch (err) {
      console.error("Failed to clear notifications:", err);
    }
  }, [user?.id]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const recentNotifications = notifications.slice(0, 5);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        recentNotifications,
        hasNewNotification,
        dismissNewAlert,
        markAsRead,
        markAllAsRead,
        clearAll,
        refresh: () => fetchNotifications(false),
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Return safe defaults when outside provider (e.g., staff pages)
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      recentNotifications: [],
      hasNewNotification: false,
      dismissNewAlert: () => {},
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      clearAll: async () => {},
      refresh: async () => {},
    } as NotificationContextValue;
  }
  return ctx;
}
