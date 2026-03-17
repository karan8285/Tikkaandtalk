import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function CartDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    try {
      console.log("=== CART DEBUG: Checking backend ===");
      console.log("API Base URL:", API_BASE);
      console.log("Project ID:", projectId);
      
      // Check if backend is up
      const healthResponse = await fetchWithRetry(`${API_BASE}/health`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      
      if (!healthResponse.ok) {
        throw new Error(`Health check failed with status: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      console.log("Health check:", healthData);

      // Check special offers in database
      const debugResponse = await fetchWithRetry(`${API_BASE}/debug/special-offers`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      
      if (!debugResponse.ok) {
        throw new Error(`Debug endpoint failed with status: ${debugResponse.status}`);
      }
      
      const debugData = await debugResponse.json();
      console.log("Debug special offers:", debugData);

      // Check localStorage cart
      const cartString = localStorage.getItem("cart");
      const cart = cartString ? JSON.parse(cartString) : [];
      console.log("Cart in localStorage:", cart);

      setDebugInfo({
        backendHealth: healthData,
        offersInDatabase: debugData,
        cartInLocalStorage: cart,
        timestamp: new Date().toISOString(),
        status: "✅ Backend is running",
      });
    } catch (error) {
      console.error("Debug check failed:", error);
      
      // Check localStorage cart even if backend fails
      let cart = [];
      try {
        const cartString = localStorage.getItem("cart");
        cart = cartString ? JSON.parse(cartString) : [];
      } catch (e) {
        console.error("Failed to read cart from localStorage:", e);
      }
      
      setDebugInfo({
        error: error.message,
        cartInLocalStorage: cart,
        timestamp: new Date().toISOString(),
        status: "❌ Backend connection failed",
        message: "The Supabase Edge Function may not be deployed yet. Using default data.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border-2 border-blue-500 max-w-sm">
        <p className="text-sm font-mono">🔍 Checking backend...</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border-2 border-blue-500 max-w-sm max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold">🛒 Cart Debug Info</h3>
        <button
          onClick={checkBackend}
          className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
        >
          Refresh
        </button>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap">
        {JSON.stringify(debugInfo, null, 2)}
      </pre>
    </div>
  );
}