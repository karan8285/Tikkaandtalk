import { useState, useEffect } from "react";

const CACHE_KEY = "tikka_mascot_url";

/**
 * Returns the restaurant mascot image URL from localStorage cache.
 * Returns empty string if no mascot is uploaded.
 */
export function getRestaurantMascot(): string {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return cached;
  } catch {
    // localStorage unavailable
  }
  return "";
}

/** Save/update the cached mascot URL (called after fetching restaurant-status) */
export function cacheRestaurantMascot(url: string | undefined | null): void {
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
 * React hook that returns the current mascot image URL.
 * Reads from localStorage cache on mount (no flash on repeat visits).
 * Listens for custom events so all components stay in sync.
 */
export function useRestaurantMascot(): string {
  const [mascot, setMascot] = useState<string>(getRestaurantMascot);

  useEffect(() => {
    const handler = () => setMascot(getRestaurantMascot());
    window.addEventListener("restaurant-mascot-updated", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === CACHE_KEY) handler();
    });
    return () => {
      window.removeEventListener("restaurant-mascot-updated", handler);
    };
  }, []);

  return mascot;
}

/** Notify same-tab listeners that the mascot cache changed */
export function notifyMascotUpdate(): void {
  window.dispatchEvent(new Event("restaurant-mascot-updated"));
}
