import { useLocation } from "react-router";
import { Mascot, type MascotPage } from "./Mascot";
import { useMascot } from "../lib/mascot-context";

// ─── Route → MascotPage mapping ────────────────────────────────
// Pages where mascot should NOT appear (to avoid distraction):
//   - Auth pages (login, signup, forgot-password)
//   - Checkout flow (checkout, order-confirmation, order-success)
//   - Admin/kitchen pages
//   - Guest tracking

function getPageFromRoute(pathname: string): MascotPage | null {
  // Skip these routes entirely
  const skipPatterns = [
    "/login",
    "/signup",
    "/forgot-password",
    "/forgot-pin",
    "/checkout",
    "/order-confirmation",
    "/order-success",
    "/admin",
    "/debug",
    "/test-auth",
    "/guest-order-tracking",
    "/notifications",
  ];

  for (const pattern of skipPatterns) {
    if (pathname === pattern || pathname.startsWith(pattern + "/")) {
      return null;
    }
  }

  // Home page — handled inline in Home.tsx, skip global mascot
  if (pathname === "/") return null;

  // Menu pages
  if (
    pathname.startsWith("/menu/") ||
    pathname.startsWith("/regular-menu") ||
    pathname.startsWith("/todays-special") ||
    pathname.startsWith("/kids-menu") ||
    pathname.startsWith("/flash-sale")
  ) {
    return "menu";
  }

  // Cart
  if (pathname === "/cart") return "cart";

  // Rewards
  if (pathname === "/rewards") return "rewards";

  // Order history
  if (pathname === "/order-history" || pathname === "/orders") return "orderHistory";

  // Order tracking
  if (
    pathname.startsWith("/order-tracking/") ||
    pathname.startsWith("/orders/") ||
    pathname.startsWith("/track/") ||
    pathname === "/track-order"
  ) {
    return "orderTracking";
  }

  // Order page (placing order)
  if (pathname === "/order") return "cart";

  // Profile
  if (pathname === "/profile") return "profile";

  return null;
}

interface GlobalMascotProps {
  /** "mobile" uses fixed positioning, "desktop" uses absolute (inside phone frame) */
  variant?: "mobile" | "desktop";
}

export function GlobalMascot({ variant = "mobile" }: GlobalMascotProps) {
  const location = useLocation();
  const { isMascotVisible } = useMascot();

  if (!isMascotVisible) return null;

  const page = getPageFromRoute(location.pathname);
  if (!page) return null;

  return <Mascot page={page} positionMode={variant === "desktop" ? "absolute" : "fixed"} />;
}