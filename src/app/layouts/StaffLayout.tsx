import { Outlet } from "react-router";
import { StaffAuthProvider } from "../lib/staff-auth";
import { useEffect } from "react";
import { APP_CONFIG } from "../lib/config";
import { cacheRestaurantLogo, notifyLogoUpdate, isBrandingFetched, notifyBrandingFetched } from "../lib/useRestaurantLogo";
import { projectId, publicAnonKey } from "/utils/supabase/info";

function StaffDocumentTitle() {
  useEffect(() => {
    document.title = `Staff Portal - ${APP_CONFIG.restaurant.name}`;
  }, []);
  return null;
}

/** Prefetch logo for the staff login page */
function StaffBrandingPrefetch() {
  useEffect(() => {
    if (isBrandingFetched()) return;
    const fetchBranding = async () => {
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
        const response = await fetch(`${API_BASE}/restaurant-status`, {
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
  return (
    <StaffAuthProvider>
      <StaffDocumentTitle />
      <StaffBrandingPrefetch />
      <div className="min-h-screen bg-gray-50">
        <Outlet />
      </div>
    </StaffAuthProvider>
  );
}