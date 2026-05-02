import { Outlet } from "react-router";
import { StaffAuthProvider } from "../lib/staff-auth";
import { useEffect, Suspense } from "react";
import { APP_CONFIG } from "../lib/config";
import { cacheRestaurantLogo, notifyLogoUpdate, isBrandingFetched, notifyBrandingFetched } from "../lib/useRestaurantLogo";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { useFCMNotifications } from "../lib/useFCMNotifications.android";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const LOGO_URL = `${API_BASE}/public/logo`;

function StaffDocumentTitle() {
  useEffect(() => {
    document.title = `Staff Portal - ${APP_CONFIG.restaurant.name}`;
  }, []);
  return null;
}

/**
 * Inject a staff-specific PWA manifest so "Add to Home Screen" shows
 * "Tikka N Talk Staff" with start_url pointing to /staff.
 */
function StaffManifest() {
  useEffect(() => {
    let blobUrl: string | null = null;

    const manifest = {
      name: "Tikka N Talk Staff",
      short_name: "TNT Staff",
      description: "Staff portal for Tikka N Talk - AN INDIAN KITCHEN. Manage orders, kitchen, delivery, and more.",
      start_url: "/staff",
      display: "standalone",
      background_color: "#1e293b",
      theme_color: "#1e293b",
      orientation: "portrait-primary",
      scope: "/staff",
      icons: [
        { src: LOGO_URL, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: LOGO_URL, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-192.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: LOGO_URL, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      prefer_related_applications: false,
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    blobUrl = URL.createObjectURL(blob);

    const existingManifest = document.querySelector('link[rel="manifest"]');
    if (existingManifest) {
      existingManifest.setAttribute("href", blobUrl);
    }

    // Update apple-mobile-web-app-title for iOS
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleMeta) appleMeta.setAttribute("content", "TNT Staff");

    console.log("[Staff Branding] Staff manifest injected");

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);
  return null;
}

/** Prefetch logo for the staff login page */
function StaffBrandingPrefetch() {
  useEffect(() => {
    if (isBrandingFetched()) return;
    const fetchBranding = async () => {
      try {
        const response = await fetchWithRetry(`${API_BASE}/restaurant-status`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (response.ok) {
          const status = await response.json();
          cacheRestaurantLogo(status.restaurantLogoUrl || null);
          notifyLogoUpdate();
        }
      } catch { /* silent */ } finally {
        notifyBrandingFetched();
      }
    };
    fetchBranding();
  }, []);
  return null;
}

export default function StaffLayout() {
  useFCMNotifications();
  return (
    <StaffAuthProvider>
      <StaffDocumentTitle />
      <StaffBrandingPrefetch />
      <StaffManifest />
      <div className="min-h-screen bg-gray-50">
        <Suspense fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1e293b", borderTopColor: "transparent" }} />
          </div>
        }>
          <Outlet />
        </Suspense>
      </div>
    </StaffAuthProvider>
  );
}