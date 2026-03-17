/**
 * Browser Push Notifications utility.
 * Manages service worker registration, push subscription,
 * and syncing subscriptions with the server.
 */
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "./fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

/** Check if the browser supports push notifications */
export function isPushSupported(): boolean {
  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  const hasNotif = "Notification" in window;
  
  console.log("[Push] Support check:", {
    serviceWorker: hasSW,
    PushManager: hasPush,
    Notification: hasNotif,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone === true,
    userAgent: navigator.userAgent.substring(0, 100),
  });

  return hasSW && hasPush && hasNotif;
}

/** Get current permission status */
export function getPushPermissionStatus(): NotificationPermission | "unsupported" {
  if ("Notification" in window) {
    return Notification.permission;
  }
  return "unsupported";
}

/** Fetch the VAPID public key from the server */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/push/vapid-key`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.vapidPublicKey || null;
  } catch (err) {
    console.error("[Push] Failed to fetch VAPID key:", err);
    return null;
  }
}

/** Convert a URL-safe base64 VAPID key to a Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Clean the input: remove whitespace, newlines, quotes, and any wrapping
  let cleaned = base64String.trim().replace(/^["']+|["']+$/g, '').trim();
  // Remove any whitespace/newlines within the string
  cleaned = cleaned.replace(/\s+/g, '');
  // Remove any trailing base64 padding (we'll re-add the correct amount)
  cleaned = cleaned.replace(/=+$/, '');
  // Strip any characters that aren't valid base64url
  cleaned = cleaned.replace(/[^A-Za-z0-9_-]/g, '');

  console.log("[Push] VAPID key cleaned length:", cleaned.length, "preview:", cleaned.substring(0, 20) + "...");

  // Add correct padding
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  // Convert URL-safe base64 to standard base64
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");

  let rawData: string;
  try {
    rawData = atob(base64);
  } catch (e) {
    console.error("[Push] atob failed. base64 length:", base64.length, "base64 preview:", base64.substring(0, 30));
    throw e;
  }

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Register the service worker (idempotent) */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    // Check if we already have a registered SW — reuse it
    const existingReg = await navigator.serviceWorker.getRegistration("/");
    if (existingReg?.active) {
      console.log("[Push] Reusing existing service worker registration");
      return existingReg;
    }

    // Probe /sw.js to check if host serves it with correct MIME type
    // SPA hosts like figma.site return text/html for all paths (catch-all rewrite)
    console.log("[Push] Probing /sw.js MIME type...");
    try {
      const swRes = await fetch("/sw.js", { method: "HEAD" });
      const ct = swRes.headers.get("content-type") || "";
      if (!ct.includes("javascript")) {
        console.warn(
          `[Push] /sw.js returned MIME type "${ct}" instead of application/javascript. ` +
          "This host uses SPA catch-all rewrites that prevent service worker registration. " +
          "Browser push notifications are unavailable on this host — in-app notifications still work."
        );
        return null;
      }
    } catch {
      console.warn("[Push] Could not probe /sw.js — assuming unavailable");
      return null;
    }

    console.log("[Push] Registering service worker from /sw.js...");
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    console.log("[Push] Service worker registered successfully");
    return registration;
  } catch (err) {
    console.error("[Push] Service worker registration failed:", err);
    return null;
  }
}

/**
 * Subscribe the user to browser push notifications.
 * 1. Registers the service worker
 * 2. Requests notification permission
 * 3. Creates a push subscription
 * 4. Sends the subscription to the server
 *
 * Returns true if successful, false otherwise.
 */
export async function subscribeToPush(userId: string, customToken?: string): Promise<boolean> {
  // Don't hard-block on isPushSupported() — in iOS standalone PWA mode
  // the APIs may exist but isPushSupported() can return false due to timing
  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  const hasNotif = "Notification" in window;

  console.log("[Push] subscribeToPush called. SW:", hasSW, "PushManager:", hasPush, "Notification:", hasNotif);

  if (!hasSW) {
    console.warn("[Push] No service worker support — cannot subscribe");
    return false;
  }

  try {
    // 1. Register SW
    const registration = await registerServiceWorker();
    if (!registration) return false;

    // 2. Request permission (may not exist on very old browsers)
    if (hasNotif) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("[Push] Notification permission denied:", permission);
        return false;
      }
    }

    // 3. Get VAPID key
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.error("[Push] Could not retrieve VAPID public key from server");
      return false;
    }

    console.log("[Push] Raw VAPID key from server:", JSON.stringify(vapidKey), "length:", vapidKey.length);

    // 4. Subscribe to push (PushManager must exist)
    if (!hasPush && !registration.pushManager) {
      console.error("[Push] PushManager not available on registration");
      return false;
    }

    const appServerKey = urlBase64ToUint8Array(vapidKey);
    console.log("[Push] Decoded applicationServerKey byte length:", appServerKey.length, "(should be 65 for P-256)");

    if (appServerKey.length !== 65) {
      console.error("[Push] INVALID VAPID key! Decoded to", appServerKey.length, "bytes but expected 65. Your VAPID_PUBLIC_KEY secret is likely wrong. Visit /functions/v1/make-server-e5e192fb/push/vapid-diagnose to generate fresh keys.");
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });

    // 5. Send subscription to server
    const res = await fetchWithRetry(`${API_BASE}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        ...(customToken && { "X-Custom-Auth": customToken }),
      },
      body: JSON.stringify({
        userId,
        subscription: subscription.toJSON(),
      }),
    });

    if (!res.ok) {
      console.error("[Push] Server rejected subscription:", await res.text());
      return false;
    }

    console.log("[Push] Successfully subscribed to push notifications");
    return true;
  } catch (err) {
    console.error("[Push] Subscribe failed:", err);
    return false;
  }
}

/**
 * Unsubscribe from browser push notifications.
 * Removes the push subscription and notifies the server.
 */
export async function unsubscribeFromPush(userId: string, customToken?: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Tell server to remove this subscription
      try {
        await fetchWithRetry(`${API_BASE}/push/unsubscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            ...(customToken && { "X-Custom-Auth": customToken }),
          },
          body: JSON.stringify({
            userId,
            endpoint: subscription.endpoint,
          }),
        });
      } catch (e) {
        console.warn("[Push] Failed to notify server of unsubscribe:", e);
      }

      await subscription.unsubscribe();
    }

    console.log("[Push] Successfully unsubscribed from push notifications");
    return true;
  } catch (err) {
    console.error("[Push] Unsubscribe failed:", err);
    return false;
  }
}

/**
 * Check if the user currently has an active push subscription.
 */
export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    // Check if there's an active service worker registration first
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}