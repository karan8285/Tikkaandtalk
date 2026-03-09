import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import type { RouteObject } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Home from "./pages/Home";
import Menu from "./pages/Menu";
import RegularMenu from "./pages/RegularMenu";
import TodaysSpecial from "./pages/TodaysSpecial";
import KidsMenu from "./pages/KidsMenu";
import FlashSale from "./pages/FlashSale";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Order from "./pages/Order";
import OrderConfirmation from "./pages/OrderConfirmation";
import OrderSuccess from "./pages/OrderSuccess";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import OrderHistory from "./pages/OrderHistory";
import OrderTracking from "./pages/OrderTracking";
import Rewards from "./pages/Rewards";
import Admin from "./pages/Admin";
import CreateCustomOrder from "./pages/CreateCustomOrder";
import KitchenDisplay from "./pages/KitchenDisplay";
import ForgotPassword from "./pages/ForgotPassword";
import Debug from "./pages/Debug";
import AdminDebug from "./pages/AdminDebug";
import TestAuth from "./pages/TestAuth";
import TrackOrder from "./pages/TrackOrder";
import GuestOrderTracking from "./pages/GuestOrderTracking";

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
          path: "menu/:category",
          element: <Menu />,
        },
        {
          path: "regular-menu",
          element: <RegularMenu />,
        },
        {
          path: "todays-special",
          element: <TodaysSpecial />,
        },
        {
          path: "todays-special/:itemId",
          element: <TodaysSpecial />,
        },
        {
          path: "kids-menu",
          element: <KidsMenu />,
        },
        {
          path: "kids-menu/:itemId",
          element: <KidsMenu />,
        },
        {
          path: "flash-sale",
          element: <FlashSale />,
        },
        {
          path: "flash-sale/:itemId",
          element: <FlashSale />,
        },
        {
          path: "login",
          element: <Login />,
        },
        {
          path: "signup",
          element: <Signup />,
        },
        {
          path: "forgot-password",
          element: <ForgotPassword />,
        },
        {
          path: "profile",
          element: <Profile />,
        },
        {
          path: "cart",
          element: <Cart />,
        },
        {
          path: "checkout",
          element: <Checkout />,
        },
        {
          path: "order",
          element: <Order />,
        },
        {
          path: "order-confirmation",
          element: <OrderConfirmation />,
        },
        {
          path: "order-success/:orderId",
          element: <OrderSuccess />,
        },
        {
          path: "order-history",
          element: <OrderHistory />,
        },
        {
          path: "order-tracking/:orderId",
          element: <OrderTracking />,
        },
        // Alias /orders to /order-history
        {
          path: "orders",
          element: <Navigate to="/order-history" replace />,
        },
        // Support /orders/:orderId for order tracking
        {
          path: "orders/:orderId",
          element: <OrderTracking />,
        },
        {
          path: "rewards",
          element: <Rewards />,
        },
        {
          path: "admin",
          element: <Admin />,
        },
        {
          path: "admin/create-custom-order",
          element: <CreateCustomOrder />,
        },
        {
          path: "admin/kitchen",
          element: <KitchenDisplay />,
        },
        {
          path: "admin-debug",
          element: <AdminDebug />,
        },
        {
          path: "debug",
          element: <Debug />,
        },
        {
          path: "test-auth",
          element: <TestAuth />,
        },
        {
          path: "track/:orderNumber",
          element: <TrackOrder />,
        },
        {
          path: "track-order",
          element: <TrackOrder />,
        },
        {
          path: "guest-order-tracking",
          element: <GuestOrderTracking />,
        },
        // Catch-all route for 404s - redirect to home
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
  ]
);