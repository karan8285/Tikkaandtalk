import { Outlet, useLocation } from "react-router";
import React from "react";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { usePresence } from "../lib/presence";
import { useDeviceSize } from "../lib/useDeviceSize";

function PresenceTracker() {
  usePresence();
  return null;
}

// Routes that should bypass the phone frame (admin/desktop tools)
const FULL_WIDTH_ROUTES = ["/admin", "/admin-debug", "/debug", "/test-auth"];

function AdaptiveShell({ children }: { children: React.ReactNode }) {
  const { isMobile } = useDeviceSize();
  const location = useLocation();

  // Check if current route should be full-width
  const isFullWidth = FULL_WIDTH_ROUTES.some(
    (route) => location.pathname === route || location.pathname.startsWith(route + "/")
  );

  // On mobile or full-width routes, render full-screen
  if (isMobile || isFullWidth) {
    return <>{children}</>;
  }

  // On tablet/desktop, show a phone-like frame centered on screen
  return (
    <div
      className="min-h-screen flex items-start justify-center py-6 sm:py-8 lg:py-10"
      style={{
        background: "linear-gradient(135deg, #FFF5F7 0%, #FCE4EC 30%, #F8BBD0 60%, #F48FB1 100%)",
      }}
    >
      {/* Branding text - desktop only */}
      <div className="hidden lg:flex fixed left-12 top-1/2 -translate-y-1/2 flex-col items-start gap-3 opacity-60 pointer-events-none select-none">
        <p className="text-2xl font-bold" style={{ color: "#D91A60" }}>
          Tikka N Talk
        </p>
        <p className="text-sm text-gray-500 max-w-[200px] leading-relaxed">
          AN INDIAN KITCHEN
        </p>
        <div className="w-12 h-0.5 rounded-full mt-1" style={{ backgroundColor: "#D91A60" }} />
        <p className="text-xs text-gray-400 mt-2">
          Order online for pickup or delivery
        </p>
      </div>

      {/* Phone frame */}
      <div
        className="relative w-full bg-white overflow-hidden flex flex-col"
        style={{
          maxWidth: "430px",
          minHeight: "min(100vh - 3rem, 860px)",
          maxHeight: "calc(100vh - 3rem)",
          borderRadius: "2rem",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Notch / status bar decoration */}
        <div className="flex justify-center pt-2 pb-0 bg-transparent pointer-events-none">
          <div
            className="w-28 h-1 rounded-full"
            style={{ backgroundColor: "#E0E0E0" }}
          />
        </div>

        {/* Scrollable app content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden phone-scroll" style={{ scrollbarWidth: "thin" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <PresenceTracker />
        <AdaptiveShell>
          <Outlet />
        </AdaptiveShell>
      </CartProvider>
    </AuthProvider>
  );
}

RootLayout.displayName = 'RootLayout';

export default RootLayout;
