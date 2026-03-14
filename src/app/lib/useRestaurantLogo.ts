import { useState, useEffect } from "react";
import fallbackLogo from "./logo";
import { APP_CONFIG } from "./config";

const CACHE_KEY = APP_CONFIG.keys.logoCacheKey;

/**
 * Returns the restaurant logo URL.
 * - Reads from localStorage cache first (instant, no flash)
 * - Falls back to the inline SVG data URI if no cached value exists
 * - The cache is populated by the Home page when it fetches restaurant-status
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
 * React hook that returns the current restaurant logo.
 * Reads from localStorage cache on mount (no flash on repeat visits).
 * Listens for storage events so all tabs stay in sync.
 */
export function useRestaurantLogo(): string {
  const [logo, setLogo] = useState<string>(getRestaurantLogo);

  useEffect(() => {
    // Listen for cross-tab or same-tab cache updates
    const handler = () => setLogo(getRestaurantLogo());
    window.addEventListener("restaurant-logo-updated", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === CACHE_KEY) handler();
    });
    return () => {
      window.removeEventListener("restaurant-logo-updated", handler);
      // storage listener cleanup is fine to skip (page-level)
    };
  }, []);

  return logo;
}

/** Notify same-tab listeners that the logo cache changed */
export function notifyLogoUpdate(): void {
  window.dispatchEvent(new Event("restaurant-logo-updated"));
}
