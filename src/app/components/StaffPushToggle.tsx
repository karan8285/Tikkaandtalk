/**
 * StaffPushToggle — Compact push notification toggle for staff dashboards.
 * Staff subscribe with userId = "staff_<id>" to avoid collision with customer IDs.
 * Shows a banner-style card with enable/disable toggle.
 */
import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useStaffAuth } from "../lib/staff-auth";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  isCurrentlySubscribed,
  getPushPermissionStatus,
} from "../lib/pushNotifications";
import { toast } from "sonner";

const STAFF_PUSH_PREFIX = "staff_";

interface StaffPushToggleProps {
  variant?: "banner" | "card";
}

export function StaffPushToggle({ variant = "banner" }: StaffPushToggleProps) {
  const { staff, accessToken } = useStaffAuth();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      const sup = isPushSupported();
      setSupported(sup);
      setPermission(getPushPermissionStatus());
      setIsStandalone(
        window.matchMedia?.("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true
      );
      if (sup) {
        const subscribed = await isCurrentlySubscribed();
        setEnabled(subscribed);
      }
    };
    checkStatus();
  }, []);

  const staffUserId = staff ? `${STAFF_PUSH_PREFIX}${staff.id}` : null;

  const handleToggle = useCallback(async () => {
    if (!staffUserId || toggling) return;
    setToggling(true);
    try {
      if (enabled) {
        const ok = await unsubscribeFromPush(staffUserId, accessToken || undefined);
        if (ok) {
          setEnabled(false);
          toast.success("Push notifications disabled");
        } else {
          toast.error("Failed to disable push notifications");
        }
      } else {
        const ok = await subscribeToPush(staffUserId, accessToken || undefined);
        if (ok) {
          setEnabled(true);
          toast.success("Push notifications enabled! You'll receive alerts for new orders.");
        } else {
          // Check if permission was denied
          const perm = getPushPermissionStatus();
          setPermission(perm);
          if (perm === "denied") {
            toast.error("Push notifications blocked. Please allow in browser settings.");
          } else {
            toast.error("Could not enable push notifications. Try again later.");
          }
        }
      }
    } catch (err) {
      console.error("[StaffPush] Toggle error:", err);
      toast.error("Something went wrong");
    } finally {
      setToggling(false);
      setPermission(getPushPermissionStatus());
    }
  }, [staffUserId, enabled, toggling, accessToken]);

  // Don't show if not logged in
  if (!staff) return null;

  // If push is not supported at all, show minimal info
  if (!supported) {
    // In standalone/PWA mode with no push support, show hint
    if (isStandalone) return null;
    if (variant === "banner") return null;
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
            <BellOff className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500">Push Not Available</p>
            <p className="text-[10px] text-gray-400 leading-snug">
              {isStandalone
                ? "Reinstall the app for push support"
                : "Open in Safari/Chrome for push notifications"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Permission denied — show a locked state
  if (permission === "denied") {
    if (variant === "banner") {
      return (
        <div className="mx-4 mt-1 mb-1 rounded-xl p-2.5 flex items-center gap-2.5 bg-red-50 border border-red-200">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
            <BellOff className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-red-700">Push Blocked</p>
            <p className="text-[10px] text-red-500 leading-snug">
              Allow in browser settings to receive order alerts
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
            <BellOff className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-700">Push Notifications Blocked</p>
            <p className="text-[10px] text-red-500 leading-snug">
              Go to browser settings and allow notifications for this site
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── BANNER variant ──
  if (variant === "banner") {
    return (
      <div
        className={`mx-4 mt-1 mb-1 rounded-xl p-2.5 flex items-center gap-2.5 transition-all ${
          enabled
            ? "bg-emerald-50 border border-emerald-200"
            : "bg-slate-50 border border-slate-200"
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            enabled ? "bg-emerald-100" : "bg-slate-200"
          }`}
        >
          {enabled ? (
            <BellRing className="w-4 h-4 text-emerald-600" />
          ) : (
            <Bell className="w-4 h-4 text-slate-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-semibold ${enabled ? "text-emerald-700" : "text-slate-700"}`}>
            {enabled ? "Push Alerts On" : "Enable Push Alerts"}
          </p>
          <p className={`text-[10px] leading-snug ${enabled ? "text-emerald-500" : "text-slate-400"}`}>
            {enabled ? "You'll be notified of new orders" : "Get notified when new orders arrive"}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            enabled ? "bg-emerald-500" : "bg-slate-300"
          } ${toggling ? "opacity-60" : ""}`}
          aria-label={enabled ? "Disable push notifications" : "Enable push notifications"}
        >
          {toggling ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            </div>
          ) : (
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          )}
        </button>
      </div>
    );
  }

  // ── CARD variant ──
  return (
    <div className={`rounded-xl p-4 border ${enabled ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              enabled ? "bg-emerald-100" : "bg-slate-100"
            }`}
          >
            {enabled ? (
              <BellRing className="w-5 h-5 text-emerald-600" />
            ) : (
              <Bell className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div>
            <p className={`text-sm font-semibold ${enabled ? "text-emerald-700" : "text-gray-900"}`}>
              Push Notifications
            </p>
            <p className={`text-xs ${enabled ? "text-emerald-500" : "text-gray-500"}`}>
              {enabled
                ? "Receiving alerts for new orders & updates"
                : "Get real-time alerts on your device"}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative w-12 h-7 rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-slate-300"
          } ${toggling ? "opacity-60" : ""}`}
          aria-label={enabled ? "Disable push notifications" : "Enable push notifications"}
        >
          {toggling ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
          ) : (
            <div
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
}
