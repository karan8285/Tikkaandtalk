import React, { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { APP_CONFIG } from "./lib/config";
import RootLayout from "./layouts/RootLayout";

// Only eagerly load Home (first page users see)
import Home from "./pages/Home";

// Lazy load everything else - splits the bundle so users only download what they visit
// Each lazy() call creates a separate chunk that loads on-demand
const RegularMenu = React.lazy(() => import("./pages/RegularMenu"));
const TodaysSpecial = React.lazy(() => import("./pages/TodaysSpecial"));
const KidsMenu = React.lazy(() => import("./pages/KidsMenu"));
const FlashSale = React.lazy(() => import("./pages/FlashSale"));
const Cart = React.lazy(() => import("./pages/Cart"));
const Checkout = React.lazy(() => import("./pages/Checkout"));
const Order = React.lazy(() => import("./pages/Order"));
const OrderConfirmation = React.lazy(() => import("./pages/OrderConfirmation"));
const OrderSuccess = React.lazy(() => import("./pages/OrderSuccess"));
const Login = React.lazy(() => import("./pages/Login"));
const Signup = React.lazy(() => import("./pages/Signup"));
const Profile = React.lazy(() => import("./pages/Profile"));
const OrderHistory = React.lazy(() => import("./pages/OrderHistory"));
const OrderTracking = React.lazy(() => import("./pages/OrderTracking"));
const Rewards = React.lazy(() => import("./pages/Rewards"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const TrackOrder = React.lazy(() => import("./pages/TrackOrder"));
const GuestOrderTracking = React.lazy(() => import("./pages/GuestOrderTracking"));
const CelebrationsHub = React.lazy(() => import("./pages/CelebrationsHub"));
const PartyPackages = React.lazy(() => import("./pages/PartyPackages"));
const CustomMenuPage = React.lazy(() => import("./pages/CustomMenuPage"));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const MyVouchers = React.lazy(() => import("./pages/MyVouchers"));

// Staff pages (completely separate from customer app)
const StaffLayout = React.lazy(() => import("./layouts/StaffLayout"));
const StaffLogin = React.lazy(() => import("./pages/StaffLogin"));
const StaffAdmin = React.lazy(() => import("./pages/StaffAdmin"));
const StaffKitchen = React.lazy(() => import("./pages/StaffKitchen"));
const StaffDelivery = React.lazy(() => import("./pages/StaffDelivery"));
const StaffCashier = React.lazy(() => import("./pages/StaffCashier"));
const CreateCustomOrder = React.lazy(() => import("./pages/CreateCustomOrder"));

const BRAND = APP_CONFIG.brand.primaryColor;

// Minimal loading spinner matching brand color
function LazyFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div
        className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: BRAND, borderTopColor: "transparent" }}
      />
    </div>
  );
}

// Wrapper that adds Suspense boundary around lazy components
function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LazyFallback />}>{children}</Suspense>;
}

// Error Fallback Component
function ErrorFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
        <p className="text-gray-600 mb-4">Something went wrong. Please try again.</p>
        <a 
          href="/" 
          className="inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

export const router = createBrowserRouter(
  [
    // ─── Customer App ─────────────────────────────────────────────
    {
      path: "/",
      element: <RootLayout />,
      errorElement: <ErrorFallback />,
      children: [
        {
          index: true,
          element: <Home />,
        },
        {
          path: "menu/:slug",
          element: <Lazy><CustomMenuPage /></Lazy>,
        },
        {
          path: "regular-menu",
          element: <Lazy><RegularMenu /></Lazy>,
        },
        {
          path: "todays-special",
          element: <Lazy><TodaysSpecial /></Lazy>,
        },
        {
          path: "todays-special/:itemId",
          element: <Lazy><TodaysSpecial /></Lazy>,
        },
        {
          path: "kids-menu",
          element: <Lazy><KidsMenu /></Lazy>,
        },
        {
          path: "kids-menu/:itemId",
          element: <Lazy><KidsMenu /></Lazy>,
        },
        {
          path: "flash-sale",
          element: <Lazy><FlashSale /></Lazy>,
        },
        {
          path: "flash-sale/:itemId",
          element: <Lazy><FlashSale /></Lazy>,
        },
        {
          path: "login",
          element: <Lazy><Login /></Lazy>,
        },
        {
          path: "signup",
          element: <Lazy><Signup /></Lazy>,
        },
        {
          path: "forgot-password",
          element: <Lazy><ForgotPassword /></Lazy>,
        },
        {
          path: "forgot-pin",
          element: <Lazy><ForgotPassword /></Lazy>,
        },
        {
          path: "profile",
          element: <Lazy><Profile /></Lazy>,
        },
        {
          path: "cart",
          element: <Lazy><Cart /></Lazy>,
        },
        {
          path: "checkout",
          element: <Lazy><Checkout /></Lazy>,
        },
        {
          path: "order",
          element: <Lazy><Order /></Lazy>,
        },
        {
          path: "order-confirmation",
          element: <Lazy><OrderConfirmation /></Lazy>,
        },
        {
          path: "order-success/:orderId",
          element: <Lazy><OrderSuccess /></Lazy>,
        },
        {
          path: "order-history",
          element: <Lazy><OrderHistory /></Lazy>,
        },
        {
          path: "order-tracking/:orderId",
          element: <Lazy><OrderTracking /></Lazy>,
        },
        // Alias /orders to /order-history
        {
          path: "orders",
          element: <Navigate to="/order-history" replace />,
        },
        // Support /orders/:orderId for order tracking
        {
          path: "orders/:orderId",
          element: <Lazy><OrderTracking /></Lazy>,
        },
        {
          path: "rewards",
          element: <Lazy><Rewards /></Lazy>,
        },
        {
          path: "my-vouchers",
          element: <Lazy><MyVouchers /></Lazy>,
        },
        {
          path: "track/:orderNumber",
          element: <Lazy><TrackOrder /></Lazy>,
        },
        {
          path: "track-order",
          element: <Lazy><TrackOrder /></Lazy>,
        },
        {
          path: "guest-order-tracking",
          element: <Lazy><GuestOrderTracking /></Lazy>,
        },
        {
          path: "celebrations",
          element: <Lazy><CelebrationsHub /></Lazy>,
        },
        {
          path: "celebrations/:categoryId",
          element: <Lazy><CelebrationsHub /></Lazy>,
        },
        {
          path: "notifications",
          element: <Lazy><Notifications /></Lazy>,
        },
        {
          path: "party-packages",
          element: <Lazy><PartyPackages /></Lazy>,
        },
        // Old /admin route redirects to /staff (no customer-side admin access)
        {
          path: "admin",
          element: <Navigate to="/staff" replace />,
        },
        {
          path: "admin/*",
          element: <Navigate to="/staff" replace />,
        },
        // Catch-all route for 404s - redirect to home
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },

    // ─── Staff Portal (Completely separate from customer app) ─────
    {
      path: "/staff",
      element: <Lazy><StaffLayout /></Lazy>,
      errorElement: <ErrorFallback />,
      children: [
        {
          index: true,
          element: <Lazy><StaffLogin /></Lazy>,
        },
        {
          path: "admin",
          element: <Lazy><StaffAdmin /></Lazy>,
        },
        {
          path: "kitchen",
          element: <Lazy><StaffKitchen /></Lazy>,
        },
        {
          path: "delivery",
          element: <Lazy><StaffDelivery /></Lazy>,
        },
        {
          path: "cashier",
          element: <Lazy><StaffCashier /></Lazy>,
        },
        {
          path: "create-order",
          element: <Lazy><CreateCustomOrder /></Lazy>,
        },
        // Catch-all for staff routes
        {
          path: "*",
          element: <Navigate to="/staff" replace />,
        },
      ],
    },
  ]
);