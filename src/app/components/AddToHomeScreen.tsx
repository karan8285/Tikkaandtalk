/**
 * Add to Home Screen prompt component.
 * - Android/Chrome: intercepts `beforeinstallprompt` event for native install
 * - iOS Safari: shows manual step-by-step guide
 * - Already standalone: shows a green "Installed" badge
 * 
 * Variants:
 *   "card"   → full card for Profile page
 *   "banner" → compact dismissable banner for home/menu pages
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Download, Share, CheckCircle2, X, Smartphone, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { APP_CONFIG } from "../lib/config";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;
const DISMISS_KEY = "tikka_a2hs_dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari =
    /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge|OPR/.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  const isInAppBrowser = /FBAN|FBAV|Instagram|Twitter|Line|KAKAOTALK/.test(ua);
  return { isIOS, isSafari, isAndroid, isChrome, isStandalone, isInAppBrowser };
}

interface AddToHomeScreenProps {
  variant?: "card" | "banner";
  onDismiss?: () => void;
}

export function AddToHomeScreen({ variant = "card", onDismiss }: AddToHomeScreenProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform] = useState(() => detectPlatform());
  const [showGuide, setShowGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Track standalone detection (manual install) — only once per device
  useEffect(() => {
    if (platform.isStandalone) {
      const tracked = localStorage.getItem("tikka_a2hs_standalone_tracked");
      if (!tracked) {
        const platformStr = platform.isIOS ? "iOS Safari" : platform.isAndroid ? "Android" : "Desktop";
        trackA2HSInstall("manual_standalone", platformStr);
        localStorage.setItem("tikka_a2hs_standalone_tracked", String(Date.now()));
      }
    }
  }, [platform]);

  // Capture the beforeinstallprompt event (Chrome/Edge/Android)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      promptRef.current = evt;
      setDeferredPrompt(evt);
      console.log("[A2HS] beforeinstallprompt captured");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Check if banner was recently dismissed
  useEffect(() => {
    if (variant === "banner") {
      try {
        const ts = localStorage.getItem(DISMISS_KEY);
        if (ts && Date.now() - Number(ts) < DISMISS_DURATION) {
          setDismissed(true);
        }
      } catch {}
    }
  }, [variant]);

  const handleNativeInstall = useCallback(async () => {
    const prompt = promptRef.current || deferredPrompt;
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        toast.success("App installed! Find it on your home screen.");
        setDeferredPrompt(null);
        promptRef.current = null;
        trackA2HSInstall("native", `${platform.isIOS ? "iOS" : "Android"} ${platform.isChrome ? "Chrome" : "Edge"}`);
      }
    } catch (err) {
      console.error("[A2HS] Install prompt error:", err);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, platform]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    onDismiss?.();
  };

  // ── Already installed as PWA ──
  if (platform.isStandalone) {
    if (variant === "banner") return null;
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-green-800">Installed as App</p>
            <p className="text-xs text-green-600">
              You're running Tikka N Talk from your home screen
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── In-app browser (Instagram, Facebook, etc.) ──
  if (platform.isInAppBrowser) {
    if (variant === "banner") return null;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-amber-800">Open in Browser</p>
            <p className="text-xs text-amber-600 mt-0.5 mb-2">
              You're in an in-app browser. For the best experience, open this page in {platform.isIOS ? "Safari" : "Chrome"}.
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                toast.success("Link copied! Paste it in your browser.");
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-white active:scale-95 transition-transform"
            >
              Copy Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dismissed banner
  if (variant === "banner" && dismissed) return null;

  // ── BANNER variant ──
  if (variant === "banner") {
    return (
      <div
        className="mx-4 mt-2 mb-1 rounded-xl p-3 flex items-center gap-3 relative shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${BRAND}12 0%, ${BRAND}06 100%)`,
          border: `1.5px solid ${BRAND}25`,
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: BRAND }}
        >
          <Download className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900">Install {APP_CONFIG.restaurant.name}</p>
          <p className="text-[10px] text-gray-500 leading-snug">
            Add to home screen for quick access & notifications
          </p>
        </div>
        {deferredPrompt ? (
          <button
            onClick={handleNativeInstall}
            disabled={installing}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0 active:scale-95 transition-all disabled:opacity-60"
            style={{ backgroundColor: BRAND }}
          >
            {installing ? "..." : "Install"}
          </button>
        ) : (
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0 active:scale-95 transition-all"
            style={{ backgroundColor: BRAND }}
          >
            How?
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Expandable guide inside banner */}
        {showGuide && !deferredPrompt && (
          <div className="absolute left-0 right-0 top-full mt-1 mx-0 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50">
            <IOSGuide compact />
            <button
              onClick={() => setShowGuide(false)}
              className="mt-2 w-full text-center text-[10px] text-gray-400 underline"
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── CARD variant (Profile page) ──
  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5" style={{ color: BRAND }} />
          <div>
            <p className="font-medium text-sm">Install App</p>
            <p className="text-xs text-muted-foreground">
              Add to your home screen for quick access
            </p>
          </div>
        </div>
      </div>

      {/* Native install button (Chrome/Edge/Android) */}
      {deferredPrompt ? (
        <button
          onClick={handleNativeInstall}
          disabled={installing}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-60"
          style={{ backgroundColor: BRAND }}
        >
          <Download className="w-4 h-4" />
          {installing ? "Installing..." : "Install App"}
        </button>
      ) : (
        <>
          {/* Manual guide for iOS or browsers without beforeinstallprompt */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 active:scale-95 transition-all"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            <Smartphone className="w-4 h-4" />
            {showGuide ? "Hide Instructions" : "How to Install"}
            {showGuide ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {showGuide && (
            <div className="mt-3">
              {platform.isIOS ? <IOSGuide /> : <AndroidGuide />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Step-by-step guide for iOS Safari */
function IOSGuide({ compact = false }: { compact?: boolean }) {
  const stepClass = compact ? "text-[10px]" : "text-xs";
  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs text-gray-500 mb-2">
          On iPhone/iPad, follow these steps in <strong>Safari</strong>:
        </p>
      )}
      <div className="bg-blue-50 rounded-lg p-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            1
          </span>
          <p className={`${stepClass} text-blue-800`}>
            Tap the <strong>Share</strong> button{" "}
            <Share className="w-3.5 h-3.5 text-blue-600 inline align-middle" /> at the
            bottom of Safari
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            2
          </span>
          <p className={`${stepClass} text-blue-800`}>
            Scroll down and tap{" "}
            <strong>
              <Plus className="w-3 h-3 inline align-middle" /> Add to Home Screen
            </strong>
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            3
          </span>
          <p className={`${stepClass} text-blue-800`}>
            Tap <strong>Add</strong> — the app icon will appear on your home screen
          </p>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        Opening from the home screen enables full-screen mode and push notifications (iOS 16.4+)
      </p>
    </div>
  );
}

/** Step-by-step guide for Android Chrome when beforeinstallprompt didn't fire */
function AndroidGuide() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">
        In Chrome, follow these steps:
      </p>
      <div className="bg-blue-50 rounded-lg p-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            1
          </span>
          <p className="text-xs text-blue-800">
            Tap the <strong>three-dot menu</strong> (⋮) in the top right corner
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            2
          </span>
          <p className="text-xs text-blue-800">
            Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            3
          </span>
          <p className="text-xs text-blue-800">
            Tap <strong>Install</strong> — the app icon will appear on your home screen
          </p>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        This enables full-screen mode and push notifications for order updates
      </p>
    </div>
  );
}

/** Track A2HS install event to the server */
async function trackA2HSInstall(method: "native" | "manual_standalone", platformInfo: string) {
  try {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return; // Only track logged-in users
    await fetchWithRetry(`${API_BASE}/track-a2hs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Custom-Auth": accessToken,
      },
      body: JSON.stringify({ method, platform: platformInfo }),
    });
    console.log("[A2HS] Install tracked:", method, platformInfo);
  } catch (err) {
    console.error("[A2HS] Failed to track install:", err);
  }
}

/**
 * Hook to check if the A2HS banner should be shown.
 * Returns false if: already standalone, recently dismissed, or no user.
 */
export function useShowA2HSBanner(): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const platform = detectPlatform();
    if (platform.isStandalone || platform.isInAppBrowser) {
      setShow(false);
      return;
    }
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (ts && Date.now() - Number(ts) < DISMISS_DURATION) {
        setShow(false);
        return;
      }
    } catch {}
    setShow(true);
  }, []);

  return show;
}