/**
 * NotificationBell — Bell icon with red dot for unread notifications.
 * Shows a dropdown with the 5 most recent notifications.
 * "See All" navigates to /notifications.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck, Package, MessageCircle, Megaphone, AlertCircle, ExternalLink } from "lucide-react";
import { useNotifications, type Notification } from "../lib/notifications";
import { APP_CONFIG } from "../lib/config";

const BRAND = APP_CONFIG.brand.primaryColor;

function getNotifIcon(type: Notification["type"]) {
  switch (type) {
    case "order_update": return <Package className="w-4 h-4 text-blue-500" />;
    case "admin_message": return <MessageCircle className="w-4 h-4" style={{ color: BRAND }} />;
    case "admin_broadcast": return <Megaphone className="w-4 h-4 text-purple-500" />;
    case "admin_targeted": return <Megaphone className="w-4 h-4 text-indigo-500" />;
    case "order_modified": return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case "order_cancelled": return <AlertCircle className="w-4 h-4 text-red-500" />;
    default: return <Bell className="w-4 h-4 text-gray-500" />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { recentNotifications, unreadCount, markAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNotifClick = (notif: Notification) => {
    if (!notif.read) markAsRead(notif.id);
    setOpen(false);
    // Navigate based on type
    if (notif.orderId && (notif.type === "order_update" || notif.type === "order_modified" || notif.type === "order_cancelled" || notif.type === "admin_message")) {
      navigate(`/order-tracking/${notif.orderId}`);
    } else if (notif.url) {
      window.open(notif.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-secondary animate-pulse" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-gray-50/80 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: BRAND }}>
                {unreadCount} new
              </span>
            )}
          </div>

          {/* Notification Items */}
          <div className="max-h-[320px] overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              recentNotifications.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                    !notif.read ? "bg-blue-50/40" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    !notif.read ? "bg-blue-100" : "bg-gray-100"
                  }`}>
                    {getNotifIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${!notif.read ? "text-gray-900" : "text-gray-600"}`}>
                      {notif.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">{timeAgo(notif.createdAt)}</span>
                      {notif.url && <ExternalLink className="w-3 h-3 text-blue-400" />}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: BRAND }} />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {recentNotifications.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-gray-50/50">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/notifications");
                }}
                className="w-full text-center text-xs font-semibold py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                style={{ color: BRAND }}
              >
                See All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
