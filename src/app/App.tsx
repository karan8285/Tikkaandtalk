import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { APP_CONFIG } from "./lib/config";
import { projectId } from "/utils/supabase/info";

// Set document title immediately at module level to avoid flash of default title
document.title = `${APP_CONFIG.restaurant.name} - ${APP_CONFIG.restaurant.tagline}`;

// ── PWA Manifest & Meta Tags (critical for iOS push notifications) ──
// Inject these at module level so they're present before "Add to Home Screen"
(function injectPWAMeta() {
  const head = document.head;

  // Manifest link
  if (!head.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.json";
    head.appendChild(manifest);
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
    icon.href = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb/public/logo`;
    head.appendChild(icon);
  }
})();

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}