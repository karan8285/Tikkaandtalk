import React, { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { APP_CONFIG } from "./lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const LOGO_URL = `${API_BASE}/public/logo`;
const FAVICON_URL = `${API_BASE}/public/favicon`;

// Set document title immediately at module level to avoid flash of default title
document.title = `${APP_CONFIG.restaurant.name} - ${APP_CONFIG.restaurant.tagline}`;

// ── PWA Manifest & Meta Tags (critical for iOS push notifications) ──
// Inject these at module level so they're present before "Add to Home Screen"
(function injectPWAMeta() {
  const head = document.head;

  // Manifest link — initially points to static file, will be replaced dynamically
  if (!head.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.json";
    head.appendChild(manifest);
  }

  // Favicon — use the admin-uploaded logo (falls back to SVG on server side)
  if (!head.querySelector('link[rel="icon"]')) {
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.href = FAVICON_URL;
    head.appendChild(favicon);
  }

  // Apple-specific meta tags for proper PWA behavior
  const metaTags: Record<string, string> = {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": APP_CONFIG.restaurant.name,
    "theme-color": APP_CONFIG.brand.primaryColor,
  };

  for (const [name, content] of Object.entries(metaTags)) {
    if (!head.querySelector(`meta[name="${name}"]`)) {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      head.appendChild(meta);
    }
  }

  // Apple touch icon — use the public logo proxy so the home screen icon shows the real logo
  if (!head.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "apple-touch-icon";
    icon.href = LOGO_URL;
    head.appendChild(icon);
  }
})();

/**
 * Fetch admin-configured branding and dynamically update:
 * - document.title (browser tab title)
 * - Favicon
 * - PWA manifest (name, short_name, icons)
 * - apple-mobile-web-app-title
 */
function useDynamicBranding() {
  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;
    const controller = new AbortController();

    async function applyBranding(attempt = 1) {
      // Small delay to let the app settle and avoid racing with other startup fetches
      await new Promise((r) => setTimeout(r, attempt === 1 ? 1500 : 3000));
      if (cancelled) return;

      try {
        const res = await fetch(`${API_BASE}/restaurant-status`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const name = data.restaurantName || APP_CONFIG.restaurant.name;
        const tagline = data.restaurantTagline || APP_CONFIG.restaurant.tagline;
        const siteTitle = data.siteTitle || `${name} - ${tagline}`;
        const shortName = data.appShortName || name;

        // 1. Update document title
        document.title = siteTitle;

        // 2. Update apple-mobile-web-app-title
        const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (appleMeta) appleMeta.setAttribute("content", shortName);

        // 2b. Update favicon if custom favicon is set
        const faviconHref = data.faviconUrl || FAVICON_URL;
        const existingFavicon = document.querySelector('link[rel="icon"]');
        if (existingFavicon) {
          existingFavicon.setAttribute("href", faviconHref);
        }

        // 3. Generate dynamic manifest with admin-configured values
        const manifest = {
          name: siteTitle,
          short_name: shortName,
          description: `Order delicious food, track orders, and earn rewards with ${name}.`,
          start_url: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: APP_CONFIG.brand.primaryColor,
          orientation: "portrait-primary",
          scope: "/",
          categories: ["food", "restaurant", "shopping"],
          icons: [
            { src: LOGO_URL, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: LOGO_URL, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-192.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: LOGO_URL, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          prefer_related_applications: false,
        };

        // Revoke previous blob URL if any
        if (blobUrl) URL.revokeObjectURL(blobUrl);

        const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
        blobUrl = URL.createObjectURL(blob);

        const existingManifest = document.querySelector('link[rel="manifest"]');
        if (existingManifest) {
          existingManifest.setAttribute("href", blobUrl);
        }

        console.log("[Branding] Dynamic branding applied:", { siteTitle, shortName });
      } catch (err: any) {
        // Silently ignore abort errors (component unmounted)
        if (err?.name === "AbortError" || cancelled) return;
        // Retry once on transient network failure
        if (attempt < 2) {
          console.log("[Branding] Retrying dynamic branding fetch...");
          return applyBranding(attempt + 1);
        }
        // Non-critical — static defaults are already in place
        console.log("[Branding] Could not fetch dynamic branding (using defaults)");
      }
    }

    applyBranding();

    return () => {
      cancelled = true;
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);
}

export default function App() {
  useDynamicBranding();

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}