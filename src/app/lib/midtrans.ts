/**
 * Midtrans Payment Gateway — Dynamic Configuration
 * ==================================================
 * All configuration is managed from the Admin Portal (Payment Gateway tab).
 * The frontend fetches clientKey + mode from the server at runtime.
 * Server key is NEVER exposed to the frontend.
 */

import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "./fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

// ===== Cached config (fetched once from server) =====
interface MidtransRuntimeConfig {
  clientKey: string;
  isProduction: boolean;
  enabled: boolean;
}

let cachedConfig: MidtransRuntimeConfig | null = null;
let configFetchPromise: Promise<MidtransRuntimeConfig> | null = null;

/**
 * Fetch Midtrans config from the server (cached after first call).
 * Config is managed by admin via the Payment Gateway settings tab.
 */
export async function getMidtransConfig(): Promise<MidtransRuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  if (configFetchPromise) return configFetchPromise;

  configFetchPromise = (async () => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/midtrans-config`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
      const data = await res.json();
      cachedConfig = {
        clientKey: data.clientKey || "",
        isProduction: data.isProduction ?? false,
        enabled: data.enabled ?? true,
      };
      return cachedConfig;
    } catch (error) {
      configFetchPromise = null;
      console.error("Failed to fetch Midtrans config:", error);
      // Return a disabled config if server is unreachable
      return { clientKey: "", isProduction: false, enabled: false };
    }
  })();

  return configFetchPromise;
}

/** Clear cached config (call after admin saves new settings) */
export function clearMidtransConfigCache() {
  cachedConfig = null;
  configFetchPromise = null;
}

// ===== Snap.js Loader =====
let snapLoaded = false;
let snapLoadingPromise: Promise<void> | null = null;

/**
 * Dynamically load the Midtrans Snap.js script.
 * Safe to call multiple times — only loads once.
 * Fetches config from server to determine sandbox vs production URL.
 */
export async function loadSnapJs(): Promise<void> {
  if (snapLoaded && (window as any).snap) {
    return;
  }

  if (snapLoadingPromise) {
    return snapLoadingPromise;
  }

  const config = await getMidtransConfig();

  if (!config.enabled) {
    throw new Error("Online payments are currently disabled by the restaurant.");
  }

  if (!config.clientKey) {
    throw new Error("Payment gateway is not configured. Please contact the restaurant.");
  }

  const snapJsUrl = config.isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

  snapLoadingPromise = new Promise((resolve, reject) => {
    // Remove any existing snap script
    const existing = document.getElementById("midtrans-snap-js");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "midtrans-snap-js";
    script.src = snapJsUrl;
    script.setAttribute("data-client-key", config.clientKey);
    script.async = true;

    script.onload = () => {
      snapLoaded = true;
      console.log("Midtrans Snap.js loaded successfully");
      resolve();
    };

    script.onerror = () => {
      snapLoadingPromise = null;
      console.error("Failed to load Midtrans Snap.js");
      reject(new Error("Failed to load Midtrans payment gateway"));
    };

    document.head.appendChild(script);
  });

  return snapLoadingPromise;
}

/**
 * Open the Midtrans Snap payment popup.
 * Returns a promise that resolves with the payment result.
 */
export interface SnapPaymentResult {
  status: "success" | "pending" | "error" | "close";
  result?: any;
}

export function openSnapPayment(snapToken: string): Promise<SnapPaymentResult> {
  return new Promise((resolve, reject) => {
    const snap = (window as any).snap;
    if (!snap) {
      reject(new Error("Snap.js not loaded. Call loadSnapJs() first."));
      return;
    }

    snap.pay(snapToken, {
      onSuccess: (result: any) => {
        console.log("Midtrans payment success:", result);
        resolve({ status: "success", result });
      },
      onPending: (result: any) => {
        console.log("Midtrans payment pending:", result);
        resolve({ status: "pending", result });
      },
      onError: (result: any) => {
        console.error("Midtrans payment error:", result);
        resolve({ status: "error", result });
      },
      onClose: () => {
        console.log("Midtrans popup closed by user");
        resolve({ status: "close" });
      },
    });
  });
}