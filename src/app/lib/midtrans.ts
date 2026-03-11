/**
 * Midtrans Payment Gateway Configuration
 * ========================================
 * SINGLE FILE to change when switching Sandbox -> Production
 *
 * Sandbox credentials (current):
 *   Merchant ID:  M715908735
 *   Client Key:   Mid-client-IgWwU833OVs1H8zC
 *   Server Key:   Mid-server-ucmhuhMZRuj9q0eSzRJ8pR06
 *
 * Production: Replace clientKey below and flip isProduction to true.
 * Server key is read from MIDTRANS_SERVER_KEY env var (set in Supabase secrets).
 */

// ===== CHANGE THESE WHEN GOING LIVE =====
export const MIDTRANS_CONFIG = {
  isProduction: false,
  clientKey: "Mid-client-IgWwU833OVs1H8zC",
  merchantId: "M715908735",
} as const;

// ===== Derived URLs (don't edit) =====
export const SNAP_JS_URL = MIDTRANS_CONFIG.isProduction
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";

export const SNAP_API_URL = MIDTRANS_CONFIG.isProduction
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

// ===== Snap.js Loader =====
let snapLoaded = false;
let snapLoadingPromise: Promise<void> | null = null;

/**
 * Dynamically load the Midtrans Snap.js script.
 * Safe to call multiple times — only loads once.
 */
export function loadSnapJs(): Promise<void> {
  if (snapLoaded && (window as any).snap) {
    return Promise.resolve();
  }

  if (snapLoadingPromise) {
    return snapLoadingPromise;
  }

  snapLoadingPromise = new Promise((resolve, reject) => {
    // Remove any existing snap script
    const existing = document.getElementById("midtrans-snap-js");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "midtrans-snap-js";
    script.src = SNAP_JS_URL;
    script.setAttribute("data-client-key", MIDTRANS_CONFIG.clientKey);
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
