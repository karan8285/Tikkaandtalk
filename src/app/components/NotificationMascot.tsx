/**
 * NotificationMascot — Shows the mascot with a notification alert bubble
 * when a new notification arrives. Auto-dismisses after 6 seconds.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { X, Bell } from "lucide-react";
import { useNotifications } from "../lib/notifications";
import { useRestaurantMascot } from "../lib/useRestaurantMascot";
import { APP_CONFIG } from "../lib/config";

const BRAND = APP_CONFIG.brand.primaryColor;
const AUTO_DISMISS_MS = 6000;

export function NotificationMascot() {
  const navigate = useNavigate();
  const { hasNewNotification, dismissNewAlert, recentNotifications } = useNotifications();
  const { mascot: mascotUrl } = useRestaurantMascot();
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  useEffect(() => {
    if (hasNewNotification) {
      setVisible(true);
      setAnimatingOut(false);

      const timer = setTimeout(() => handleDismiss(), AUTO_DISMISS_MS);
      return () => clearTimeout(timer);
    }
  }, [hasNewNotification]);

  const handleDismiss = () => {
    setAnimatingOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimatingOut(false);
      dismissNewAlert();
    }, 300);
  };

  const handleTap = () => {
    handleDismiss();
    navigate("/notifications");
  };

  if (!visible) return null;

  const mascotSrc = mascotUrl || APP_CONFIG.mascot.customImageUrl || "";
  const hasMascotImage = !!mascotSrc;
  const latestNotif = recentNotifications[0];

  return (
    <>
      <div
        className="fixed z-[90] bottom-20 right-3 flex flex-col items-end"
        style={{
          opacity: !animatingOut ? 1 : 0,
          transform: !animatingOut ? "translateY(0) scale(1)" : "translateY(20px) scale(0.8)",
          transition: "opacity 0.35s ease-out, transform 0.35s ease-out",
          pointerEvents: !animatingOut ? "auto" : "none",
        }}
      >
        {/* Speech Bubble */}
        <div
          onClick={handleTap}
          role="button"
          tabIndex={0}
          className="relative rounded-xl px-3.5 py-3 shadow-lg mb-1.5 max-w-[220px] text-left active:scale-95 transition-transform cursor-pointer"
          style={{
            backgroundColor: "white",
            border: `2px solid ${BRAND}30`,
          }}
        >
          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm bg-white border border-gray-200 hover:bg-gray-100 transition-colors z-10"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>

          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
              <Bell className="w-3 h-3" style={{ color: BRAND }} />
            </div>
            <p className="text-xs font-bold" style={{ color: BRAND }}>
              New Notification!
            </p>
          </div>

          {latestNotif ? (
            <p className="text-[11px] text-gray-600 leading-snug line-clamp-2">
              {latestNotif.message}
            </p>
          ) : (
            <p className="text-[11px] text-gray-600 leading-snug">
              You have a new notification! Tap to check it out.
            </p>
          )}

          <p className="text-[10px] mt-1.5 font-medium" style={{ color: BRAND }}>
            Tap to view &rarr;
          </p>

          {/* Bubble arrow */}
          <div
            className="absolute -bottom-[7px] right-8 w-0 h-0"
            style={{
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "7px solid white",
              filter: `drop-shadow(0 1px 0 ${BRAND}20)`,
            }}
          />
        </div>

        {/* Mascot Image */}
        <div className="flex justify-end notif-mascot-bounce">
          {hasMascotImage ? (
            <img
              src={mascotSrc}
              alt="Mascot notification"
              className="object-contain"
              style={{
                width: "80px",
                height: "80px",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))",
              }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: "80px",
                height: "80px",
                fontSize: "48px",
                background: `linear-gradient(135deg, ${BRAND}15, ${BRAND}30)`,
                border: `2px solid ${BRAND}30`,
              }}
            >
              👨‍🍳
            </div>
          )}
        </div>
      </div>

      <style>{`
        .notif-mascot-bounce {
          animation: notifBounce 0.6s ease-out 0.2s both, mascotFloat 3s ease-in-out 0.8s infinite;
        }
        @keyframes notifBounce {
          0% { transform: scale(0) translateY(20px); }
          50% { transform: scale(1.15) translateY(-5px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes mascotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}