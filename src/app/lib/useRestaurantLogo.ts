import { useState, useEffect } from "react";
import fallbackLogo from "./logo";
import { APP_CONFIG } from "./config";

const CACHE_KEY = APP_CONFIG.keys.logoCacheKey;
const FETCHED_FLAG = "__tikka_branding_fetched__";

/**
 * Returns the restaurant logo URL.
 * - Reads from localStorage cache first (instant, no flash)
 * - Falls back to the inline SVG data URI if no cached value exists
 * - The cache is populated by the RootLayout branding prefetch
 */
export function getRestaurantLogo(): string {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return cached;
  } catch {
    // localStorage unavailable
  }
  return fallbackLogo;
}

/** Save/update the cached logo URL (called after fetching restaurant-status) */
export function cacheRestaurantLogo(url: string | undefined | null): void {
  try {
    if (url) {
      localStorage.setItem(CACHE_KEY, url);
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Returns true if the branding has been fetched at least once this session.
 * This prevents showing the SVG fallback flash on first visit.
 */
export function isBrandingFetched(): boolean {
  try {
    return sessionStorage.getItem(FETCHED_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Mark branding as fetched for this session */
export function markBrandingFetched(): void {
  try {
    sessionStorage.setItem(FETCHED_FLAG, "1");
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * React hook that returns the current restaurant logo and loading state.
 * On first session visit (no cache, no fetch yet), returns { logo: "", loading: true }
 * so components can show a placeholder instead of the SVG fallback flash.
 * Listens for storage events so all tabs stay in sync.
 */
export function useRestaurantLogo(): { logo: string; loading: boolean } {
  const hasCached = (() => {
    try { return !!localStorage.getItem(CACHE_KEY); } catch { return false; }
  })();
  const alreadyFetched = isBrandingFetched();

  // If we have a cache or already fetched this session, we're not loading
  const initialLoading = !hasCached && !alreadyFetched;

  const [logo, setLogo] = useState<string>(hasCached ? getRestaurantLogo() : (alreadyFetched ? fallbackLogo : ""));
  const [loading, setLoading] = useState(initialLoading);

  useEffect(() => {
    const handler = () => {
      setLogo(getRestaurantLogo());
      setLoading(false);
    };
    window.addEventListener("restaurant-logo-updated", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === CACHE_KEY) handler();
    });
    // Also listen for branding-fetched event (even if logo is null/fallback)
    const fetchedHandler = () => {
      setLoading(false);
      setLogo(getRestaurantLogo());
    };
    window.addEventListener("restaurant-branding-fetched", fetchedHandler);
    return () => {
      window.removeEventListener("restaurant-logo-updated", handler);
      window.removeEventListener("restaurant-branding-fetched", fetchedHandler);
    };
  }, []);

  return { logo, loading };
}

/** Notify same-tab listeners that the logo cache changed */
export function notifyLogoUpdate(): void {
  window.dispatchEvent(new Event("restaurant-logo-updated"));
}

/** Notify that branding fetch completed (even if no logo was returned) */
export function notifyBrandingFetched(): void {
  markBrandingFetched();
  window.dispatchEvent(new Event("restaurant-branding-fetched"));
}