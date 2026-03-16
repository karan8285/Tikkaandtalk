/**
 * Notifications — Full-page notification center.
 * Shows all notifications with mark-as-read, mark-all, and clear-all actions.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck, Trash2, Package, MessageCircle, Megaphone, AlertCircle, ExternalLink, ChevronRight } from "lucide-react";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { useNotifications, type Notification } from "../lib/notifications";
import { useAuth } from "../lib/auth";
import { APP_CONFIG } from "../lib/config";

const BRAND = APP_CONFIG.brand.primaryColor;

function getNotifIcon(type: Notification["type"]) {
  switch (type) {
    case "order_update": return <Package className="w-5 h-5 text-blue-500" />;
    case "admin_message": return <MessageCircle className="w-5 h-5" style={{ color: BRAND }} />;
    case "admin_broadcast": return <Megaphone className="w-5 h-5 text-purple-500" />;
    case "admin_targeted": return <Megaphone className="w-5 h-5 text-indigo-500" />;
    case "order_modified": return <AlertCircle className="w-5 h-5 text-amber-500" />;
    case "order_cancelled": return <AlertCircle className="w-5 h-5 text-red-500" />;
    default: return <Bell className="w-5 h-5 text-gray-500" />;
  }
}

function getNotifBg(type: Notification["type"], read: boolean) {
  if (read) return "bg-white";
  switch (type) {
    case "order_update": return "bg-blue-50/50";
    case "admin_message": return "bg-pink-50/40";
    case "admin_broadcast": return "bg-purple-50/40";
    case "admin_targeted": return "bg-indigo-50/40";
    case "order_modified": return "bg-amber-50/40";
    case "order_cancelled": return "bg-red-50/40";
    default: return "bg-gray-50";
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, loading } = useNotifications();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  const handleNotifClick = (notif: Notification) => {
    if (!notif.read) markAsRead(notif.id);
    if (notif.orderId && (notif.type === "order_update" || notif.type === "order_modified" || notif.type === "order_cancelled" || notif.type === "admin_message")) {
      navigate(`/order-tracking/${notif.orderId}`);
    } else if (notif.url) {
      window.open(notif.url, "_blank", "noopener,noreferrer");
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        showBack
        title="Notifications"
        showCart={false}
        rightContent={
          notifications.length > 0 ? (
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => clearAll()}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ) : undefined
        }
      />

      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        {/* Unread count badge */}
        {unreadCount > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              You have <span className="font-bold" style={{ color: BRAND }}>{unreadCount}</span> unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => markAllAsRead()}
              className="text-xs font-semibold px-3 py-1 rounded-full border transition-colors hover:bg-gray-50"
              style={{ color: BRAND, borderColor: `${BRAND}40` }}
            >
              Mark all read
            </button>
          </div>
        )}

        {/* Notification List */}
        {loading && notifications.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: BRAND, borderTopColor: "transparent" }}
            />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-600 mb-1">No notifications</h3>
            <p className="text-sm text-gray-400">
              We'll notify you about order updates and special offers
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notif => (
              <button
                key={notif.id}
                onClick={() => handleNotifClick(notif)}
                className={`w-full text-left rounded-xl p-4 shadow-sm border transition-all active:scale-[0.98] ${getNotifBg(notif.type, notif.read)} ${
                  !notif.read ? "border-l-4" : "border-gray-100"
                }`}
                style={!notif.read ? { borderLeftColor: BRAND } : {}}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    !notif.read ? "bg-white shadow-sm" : "bg-gray-100"
                  }`}>
                    {getNotifIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${!notif.read ? "text-gray-900" : "text-gray-600"}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: BRAND }} />
                      )}
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${!notif.read ? "text-gray-700" : "text-gray-500"}`}>
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-400">{formatDate(notif.createdAt)}</span>
                      {notif.orderNumber && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                          {notif.orderNumber}
                        </span>
                      )}
                      {notif.url && (
                        <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
                          <ExternalLink className="w-3 h-3" /> Link
                        </span>
                      )}
                      {(notif.orderId || notif.url) && (
                        <ChevronRight className="w-3 h-3 text-gray-300 ml-auto" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Clear All Button (bottom) */}
        {notifications.length > 5 && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearAll()}
              className="text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear All Notifications
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
