/**
 * Reusable Push Notification Permission Prompt
 * ALWAYS shows a prominent "Allow Notifications" button for logged-in users.
 * On tap: if supported → triggers browser permission dialog.
 *         if not supported → shows platform-specific guidance.
 */
import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Smartphone, Share, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import {
  isPushSupported,
  subscribeToPush,
  isCurrentlySubscribed,
  getPushPermissionStatus,
} from "../lib/pushNotifications";

const BRAND = APP_CONFIG.brand.primaryColor;

/** Detect platform details for helpful guidance */
function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);
  const isChromeiOS = /CriOS/.test(ua);
  const isFirefoxiOS = /FxiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isStandalone = (window.matchMedia?.("(display-mode: standalone)").matches) || (window.navigator as any).standalone === true;
  return { isIOS, isSafari, isChromeiOS, isFirefoxiOS, isAndroid, isStandalone };
}

type PromptState =
  | "loading"
  | "show_button"          // Always show the big button (default + not_supported)
  | "subscribing"
  | "subscribed"
  | "granted_not_subscribed"
  | "denied"
  | "show_ios_guide";      // After tapping button on unsupported iOS browser

interface PushNotificationPromptProps {
  userId?: string;
  accessToken?: string | null;
  compact?: boolean;
}

export function PushNotificationPrompt({
  userId,
  accessToken,
  compact = false,
}: PushNotificationPromptProps) {
  const [state, setState] = useState<PromptState>("loading");
  const [pushSupported, setPushSupported] = useState(true);

  const checkPushStatus = useCallback(async () => {
    if (!userId) {
      setState("loading");
      return;
    }

    const supported = isPushSupported();
    setPushSupported(supported);

    if (!supported) {
      // Still show the button — we'll handle the unsupported case on tap
      console.log("[PushPrompt] Push not supported, but still showing button");
      setState("show_button");
      return;
    }

    const permission = getPushPermissionStatus();
    console.log("[PushPrompt] Browser notification permission:", permission);

    if (permission === "granted") {
      const subscribed = await isCurrentlySubscribed();
      setState(subscribed ? "subscribed" : "granted_not_subscribed");
    } else if (permission === "denied") {
      setState("denied");
    } else {
      setState("show_button");
    }
  }, [userId]);

  useEffect(() => {
    checkPushStatus();
  }, [checkPushStatus]);

  const handleEnableClick = async () => {
    if (!userId) {
      toast.info("Please log in to enable notifications.");
      return;
    }

    const platform = detectPlatform();

    // If push is NOT natively supported BUT we're in standalone/PWA mode,
    // try anyway — iOS 16.4+ PWA should support it even if detection fails
    if (!pushSupported && !platform.isStandalone) {
      if (platform.isIOS) {
        setState("show_ios_guide");
        return;
      }
      toast.error("Your browser doesn't support notifications. Try Chrome, Firefox, or Edge.");
      return;
    }

    // Always attempt — even if isPushSupported() returned false in standalone mode
    setState("subscribing");

    try {
      console.log("[PushPrompt] User tapped Enable — attempting subscribe (pushSupported:", pushSupported, ", standalone:", platform.isStandalone, ")");
      
      // Try direct approach first if normal path isn't available
      let success = false;
      
      if (pushSupported) {
        // Normal path — isPushSupported() is true
        success = await subscribeToPush(userId, accessToken || undefined);
      } else {
        // Standalone PWA but isPushSupported() returned false
        // Try requesting permission directly
        console.log("[PushPrompt] Attempting direct Notification.requestPermission()...");
        try {
          if ("Notification" in window) {
            const permission = await Notification.requestPermission();
            console.log("[PushPrompt] Direct permission result:", permission);
            if (permission === "granted") {
              // Now try subscribing — the API might actually work
              success = await subscribeToPush(userId, accessToken || undefined);
            } else if (permission === "denied") {
              setState("denied");
              toast.error("Notifications blocked. Please enable in Settings → Notifications → Safari.");
              return;
            } else {
              setState("show_button");
              toast.info("Notification permission not granted. Please try again.");
              return;
            }
          } else if ("serviceWorker" in navigator) {
            // Notification API not available but SW is — try subscribing anyway
            success = await subscribeToPush(userId, accessToken || undefined);
          } else {
            // Truly not supported even in standalone
            setState("show_ios_guide");
            return;
          }
        } catch (directErr) {
          console.error("[PushPrompt] Direct permission attempt failed:", directErr);
          // Show the iOS-specific update guidance for standalone
          setState("show_ios_guide");
          return;
        }
      }

      if (success) {
        setState("subscribed");
        toast.success("Notifications enabled! You'll get alerts for order updates.");
      } else {
        const perm = getPushPermissionStatus();
        console.log("[PushPrompt] subscribeToPush returned false, permission now:", perm);
        if (perm === "denied") {
          setState("denied");
          toast.error("Notifications blocked. Please enable them in your browser settings.");
        } else {
          setState("show_button");
          toast.info("Notifications not enabled. Tap the button to try again.");
        }
      }
    } catch (err) {
      console.error("[PushPrompt] Subscribe error:", err);
      const perm = getPushPermissionStatus();
      setState(perm === "denied" ? "denied" : "show_button");
      toast.error("Failed to enable notifications. Please try again.");
    }
  };

  const handleResubscribe = async () => {
    if (!userId) return;
    setState("subscribing");
    try {
      const success = await subscribeToPush(userId, accessToken || undefined);
      if (success) {
        setState("subscribed");
        toast.success("Notifications re-enabled!");
      } else {
        setState("granted_not_subscribed");
        toast.error("Failed to subscribe. Please try again.");
      }
    } catch (err) {
      console.error("[PushPrompt] Re-subscribe error:", err);
      setState("granted_not_subscribed");
      toast.error("Failed to subscribe. Please try again.");
    }
  };

  // Don't render for guests
  if (!userId) return null;

  const pad = compact ? "p-2.5" : "p-3 sm:p-4";

  // ── Loading ──
  if (state === "loading") {
    return (
      <div className={`w-full bg-gray-50 border border-gray-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium">Checking notification status...</p>
          </div>
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  // ── Subscribing (spinner) ──
  if (state === "subscribing") {
    return (
      <div className={`w-full border-2 rounded-xl ${pad} mb-3 sm:mb-4`}
        style={{ borderColor: BRAND, backgroundColor: `${BRAND}08` }}>
        <div className="flex items-center justify-center gap-2.5 py-1">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND }} />
          <p className="text-sm font-semibold" style={{ color: BRAND }}>
            Requesting permission...
          </p>
        </div>
        <p className="text-[10px] text-center text-gray-500 mt-1">
          Please tap <strong>"Allow"</strong> on the browser popup
        </p>
      </div>
    );
  }

  // ── Subscribed ──
  if (state === "subscribed") {
    return (
      <div className={`w-full bg-green-50 border border-green-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-green-800">Notifications Enabled</p>
            <p className="text-[10px] text-green-600 leading-snug mt-0.5">
              You'll receive alerts when your order is confirmed, prepared, or delivered.
            </p>
          </div>
          <BellRing className="w-5 h-5 text-green-500 flex-shrink-0" />
        </div>
      </div>
    );
  }

  // ── Denied ──
  if (state === "denied") {
    return (
      <div className={`w-full bg-red-50 border border-red-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellOff className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-800">Notifications Blocked</p>
            <p className="text-[10px] text-red-600 leading-snug mt-0.5 mb-2">
              You previously blocked notifications. To enable them:
            </p>
            <ol className="text-[10px] text-red-600 list-decimal list-inside space-y-0.5 mb-2">
              <li>Tap the lock icon in your browser's address bar</li>
              <li>Find <strong>Notifications</strong> and change to <strong>Allow</strong></li>
              <li>Refresh this page</li>
            </ol>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="h-7 px-3 text-[10px] font-semibold text-red-700 border-red-300 rounded-lg"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Granted but not subscribed ──
  if (state === "granted_not_subscribed") {
    return (
      <div className={`w-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${BRAND}15` }}
          >
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-gray-900 mb-0.5">
              Notifications Not Active
            </p>
            <p className="text-[11px] text-gray-600 mb-2.5 leading-relaxed">
              Permission is granted but notifications aren't active. Tap below to activate.
            </p>
            <button
              onClick={handleResubscribe}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all"
              style={{ backgroundColor: BRAND }}
            >
              <Bell className="w-4 h-4" />
              Activate Notifications
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS Guide (shown after tapping button on unsupported iOS browser) ──
  if (state === "show_ios_guide") {
    const platform = detectPlatform();
    const browserName = platform.isChromeiOS ? "Chrome" : platform.isFirefoxiOS ? "Firefox" : "This browser";

    // User is already in standalone/PWA mode but push still not supported
    // This means iOS version is too old (< 16.4) or there's a manifest issue
    if (platform.isStandalone) {
      return (
        <div className={`w-full bg-amber-50 border border-amber-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
          <div className="flex items-start gap-2.5">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-900 mb-1">
                iOS Update Required
              </p>
              <p className="text-[10px] text-amber-700 leading-snug mb-2">
                You're running the app from your Home Screen — great! But push notifications require <strong>iOS 16.4 or later</strong>.
              </p>
              <div className="bg-white/80 rounded-lg p-2.5 space-y-1.5 mb-2">
                <p className="text-[10px] text-amber-800 font-medium">To check your iOS version:</p>
                <p className="text-[10px] text-amber-700">
                  Go to <strong>Settings</strong> → <strong>General</strong> → <strong>About</strong> → check <strong>iOS Version</strong>
                </p>
                <p className="text-[10px] text-amber-700">
                  If below 16.4, go to <strong>Settings</strong> → <strong>General</strong> → <strong>Software Update</strong>
                </p>
              </div>
              <p className="text-[10px] text-amber-600 leading-snug mb-2">
                After updating, <strong>remove this app</strong> from your Home Screen and <strong>re-add it</strong> from Safari to activate push notifications.
              </p>
              <button
                onClick={() => setState("show_button")}
                className="w-full text-center text-[10px] text-amber-600 underline py-1"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`w-full bg-blue-50 border border-blue-200 rounded-xl ${pad} mb-3 sm:mb-4`}>
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Smartphone className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-900 mb-1">
              {platform.isSafari ? "Add to Home Screen Required" : `${browserName} on iPhone Can't Send Notifications`}
            </p>
            <p className="text-[10px] text-blue-700 leading-snug mb-2">
              {platform.isSafari
                ? "On iPhone, notifications only work when this site is added to your Home Screen."
                : `On iPhone, notifications only work in Safari after adding this site to your Home Screen.`}
            </p>
            <div className="bg-white/80 rounded-lg p-2.5 space-y-2 mb-2.5">
              {!platform.isSafari && (
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                  <p className="text-[10px] text-blue-800">
                    Open this page in <strong>Safari</strong> browser
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">{platform.isSafari ? "1" : "2"}</span>
                <p className="text-[10px] text-blue-800">
                  Tap the <strong>Share</strong> button <span className="inline-block align-middle"><Share className="w-3.5 h-3.5 text-blue-600 inline" /></span> at the bottom
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">{platform.isSafari ? "2" : "3"}</span>
                <p className="text-[10px] text-blue-800">
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">{platform.isSafari ? "3" : "4"}</span>
                <p className="text-[10px] text-blue-800">
                  Open from <strong>Home Screen</strong> and enable notifications
                </p>
              </div>
            </div>

            {/* Copy link button for non-Safari users */}
            {!platform.isSafari && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  toast.success("Link copied! Paste it in Safari");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-white border border-blue-300 active:scale-95 transition-all mb-2"
              >
                <span>📋</span> Copy Link to Open in Safari
              </button>
            )}

            <button
              onClick={() => setState("show_button")}
              className="w-full text-center text-[10px] text-blue-500 underline py-1"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DEFAULT: Big "Allow Notifications" button — ALWAYS shown ──
  return (
    <div className={`w-full rounded-xl ${pad} mb-3 sm:mb-4 overflow-hidden relative`}
      style={{
        background: `linear-gradient(135deg, ${BRAND}10 0%, ${BRAND}05 50%, #EEF2FF 100%)`,
        border: `1.5px solid ${BRAND}30`,
      }}
    >
      {/* Decorative ring */}
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-10"
        style={{ backgroundColor: BRAND }} />

      <div className="relative flex items-start gap-3">
        {/* Bell icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ backgroundColor: BRAND }}
        >
          <Bell className="w-5 h-5 text-white animate-[wiggle_2s_ease-in-out_infinite]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900 mb-0.5">
            Enable Order Notifications
          </p>
          <p className="text-[11px] text-gray-600 mb-3 leading-relaxed">
            Get instant alerts when your order is <strong>confirmed</strong>, <strong>being prepared</strong>, or <strong>delivered</strong>.
          </p>

          {/* ★ THE BIG BUTTON — always visible, always tappable ★ */}
          <button
            onClick={handleEnableClick}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white shadow-lg active:scale-95 transition-all hover:shadow-xl"
            style={{ backgroundColor: BRAND }}
          >
            <Bell className="w-4.5 h-4.5" />
            Allow Notifications
          </button>

          <p className="text-[9px] text-gray-400 mt-2 text-center">
            Tap the button above to enable order alerts
          </p>
        </div>
      </div>

      {/* CSS for wiggle animation */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(12deg); }
          20% { transform: rotate(-10deg); }
          30% { transform: rotate(8deg); }
          40% { transform: rotate(-6deg); }
          50% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}