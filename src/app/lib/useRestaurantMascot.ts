import { useState, useEffect } from "react";
import { isBrandingFetched } from "./useRestaurantLogo";

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
 * React hook that returns the current mascot image URL and loading state.
 * On first session visit (no cache, no fetch yet), returns { mascot: "", loading: true }
 * so components can defer rendering the mascot until branding is resolved.
 */
export function useRestaurantMascot(): { mascot: string; loading: boolean } {
  const hasCached = (() => {
    try { return !!localStorage.getItem(CACHE_KEY); } catch { return false; }
  })();
  const alreadyFetched = isBrandingFetched();

  const initialLoading = !hasCached && !alreadyFetched;

  const [mascot, setMascot] = useState<string>(getRestaurantMascot());
  const [loading, setLoading] = useState(initialLoading);

  useEffect(() => {
    const handler = () => {
      setMascot(getRestaurantMascot());
      setLoading(false);
    };
    window.addEventListener("restaurant-mascot-updated", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === CACHE_KEY) handler();
    });
    // Listen for branding-fetched event
    const fetchedHandler = () => {
      setLoading(false);
      setMascot(getRestaurantMascot());
    };
    window.addEventListener("restaurant-branding-fetched", fetchedHandler);
    return () => {
      window.removeEventListener("restaurant-mascot-updated", handler);
      window.removeEventListener("restaurant-branding-fetched", fetchedHandler);
    };
  }, []);

  return { mascot, loading };
}

/** Notify same-tab listeners that the mascot cache changed */
export function notifyMascotUpdate(): void {
  window.dispatchEvent(new Event("restaurant-mascot-updated"));
}