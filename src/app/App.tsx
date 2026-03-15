import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { APP_CONFIG } from "./lib/config";

// Set document title immediately at module level to avoid flash of default title
document.title = `${APP_CONFIG.restaurant.name} - ${APP_CONFIG.restaurant.tagline}`;

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}