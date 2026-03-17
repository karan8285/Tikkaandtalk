import { type ReactNode, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { MascotProvider } from "../lib/mascot-context";
import { usePresence } from "../lib/presence";
import { useDeviceSize } from "../lib/useDeviceSize";
import { APP_CONFIG } from "../lib/config";
import { GlobalMascot } from "../components/GlobalMascot";
import { NotificationProvider } from "../lib/notifications";
import { NotificationMascot } from "../components/NotificationMascot";
import { cacheRestaurantLogo, notifyLogoUpdate, notifyBrandingFetched, isBrandingFetched } from "../lib/useRestaurantLogo";
import { cacheRestaurantMascot, notifyMascotUpdate } from "../lib/useRestaurantMascot";
import { setWhatsAppConfig } from "../lib/whatsapp";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";

function PresenceTracker() {
  usePresence();
  return null;
}

/**
 * Prefetch branding assets (logo, mascot) from restaurant-status.
 * Fires once per session at the layout level so it works regardless
 * of which page the user lands on — eliminating the SVG fallback flash.
 */
function BrandingPrefetch() {
  useEffect(() => {
    // Skip if already fetched this session
    if (isBrandingFetched()) return;

    const fetchBranding = async () => {
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
        const response = await fetchWithRetry(`${API_BASE}/restaurant-status`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });

        if (response.ok) {
          const status = await response.json();
          // Cache logo
          cacheRestaurantLogo(status.restaurantLogoUrl || null);
          notifyLogoUpdate();
          // Cache mascot
          cacheRestaurantMascot(status.mascotImageUrl || null);
          notifyMascotUpdate();
          // Update WhatsApp config
          if (status.whatsappNumber) {
            setWhatsAppConfig(status.whatsappNumber, status.whatsappDisplay);
          }
        }
      } catch {
        // Silently fail — fallbacks will be used
      } finally {
        // Always mark as fetched so we don't re-fetch and hooks resolve loading state
        notifyBrandingFetched();
      }
    };

    fetchBranding();
  }, []);

  return null;
}

function DocumentTitle() {
  useEffect(() => {
    document.title = `${APP_CONFIG.restaurant.name} - ${APP_CONFIG.restaurant.tagline}`;
  }, []);
  return null;
}

// Routes that should bypass the phone frame (admin/desktop tools)
const FULL_WIDTH_ROUTES = ["/admin", "/admin-debug", "/debug", "/test-auth"];

function AdaptiveShell({ children }: { children: ReactNode }) {
  const { isMobile } = useDeviceSize();
  const location = useLocation();

  // Check if current route should be full-width
  const isFullWidth = FULL_WIDTH_ROUTES.some(
    (route) => location.pathname === route || location.pathname.startsWith(route + "/")
  );

  // On mobile or full-width routes, render full-screen
  if (isMobile || isFullWidth) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  // On desktop, wrap in a phone-sized frame for the mobile app experience
  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center py-8">
      <div
        className="relative bg-background rounded-[2.5rem] shadow-2xl border-[8px] border-gray-800 overflow-hidden"
        style={{
          width: "390px",
          minHeight: "844px",
          maxHeight: "90vh",
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-800 rounded-b-2xl z-50" />
        <div className="overflow-y-auto h-full" style={{ maxHeight: "90vh" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <MascotProvider>
          <NotificationProvider>
            <DocumentTitle />
            <PresenceTracker />
            <BrandingPrefetch />
            <AdaptiveShell>
              <Outlet />
              <GlobalMascot />
              <NotificationMascot />
            </AdaptiveShell>
          </NotificationProvider>
        </MascotProvider>
      </CartProvider>
    </AuthProvider>
  );
}