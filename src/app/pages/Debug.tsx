import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export default function Debug() {
  const { user, accessToken } = useAuth();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>({});

  const runTests = async () => {
    setTesting(true);
    const newResults: any = {};

    // Test 1: Health Check
    try {
      const healthResponse = await fetch(`${API_BASE}/health`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      });
      newResults.health = {
        status: healthResponse.ok ? "success" : "error",
        statusCode: healthResponse.status,
        message: healthResponse.ok ? "Backend is accessible" : `HTTP ${healthResponse.status}`,
      };
    } catch (error) {
      newResults.health = {
        status: "error",
        message: `Connection failed: ${error.message}`,
      };
    }

    // Test 2: Check Auth
    if (user && accessToken) {
      try {
        const profileResponse = await fetch(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profileData = await profileResponse.json();
        newResults.auth = {
          status: profileResponse.ok ? "success" : "error",
          statusCode: profileResponse.status,
          message: profileResponse.ok
            ? `Authenticated as ${user.name} (${user.id})`
            : profileData.error,
        };
      } catch (error) {
        newResults.auth = {
          status: "error",
          message: `Auth check failed: ${error.message}`,
        };
      }
    } else {
      newResults.auth = {
        status: "warning",
        message: "Not logged in",
      };
    }

    // Test 3: Get Special Offers
    try {
      const offersResponse = await fetch(`${API_BASE}/special-offers`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      });
      const offersData = await offersResponse.json();
      newResults.offers = {
        status: offersResponse.ok ? "success" : "error",
        statusCode: offersResponse.status,
        message: offersResponse.ok
          ? `Found ${offersData.offers?.length || 0} special offers`
          : offersData.error,
      };
    } catch (error) {
      newResults.offers = {
        status: "error",
        message: `Offers fetch failed: ${error.message}`,
      };
    }

    // Test 4: Get Orders (if logged in)
    if (user && accessToken) {
      try {
        const ordersResponse = await fetch(`${API_BASE}/orders`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const ordersData = await ordersResponse.json();
        newResults.orders = {
          status: ordersResponse.ok ? "success" : "error",
          statusCode: ordersResponse.status,
          message: ordersResponse.ok
            ? `Found ${ordersData.orders?.length || 0} orders`
            : ordersData.error,
          data: ordersData.orders,
        };
      } catch (error) {
        newResults.orders = {
          status: "error",
          message: `Orders fetch failed: ${error.message}`,
        };
      }
    }

    setResults(newResults);
    setTesting(false);
  };

  useEffect(() => {
    runTests();
  }, []);

  const getIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning":
        return <XCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
    }
  };

  const handleClearStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
    alert("All local storage cleared! Please refresh the page.");
    window.location.reload();
  };

  const refreshTests = () => {
    runTests();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24">
      <h1 className="text-2xl font-bold mb-6">Connection Tests</h1>
      
      <button
        onClick={refreshTests}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition mr-2"
      >
        Refresh
      </button>
      
      <button
        onClick={handleClearStorage}
        className="mb-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
      >
        Clear Storage & Reload
      </button>

      <div className="space-y-3">
        {Object.entries(results).map(([key, result]: [string, any]) => (
          <Card key={key} className="p-4">
            <div className="flex items-start gap-3">
              {getIcon(result.status)}
              <div className="flex-1">
                <p className="font-medium capitalize">{key}</p>
                <p className="text-sm text-muted-foreground">
                  {result.message}
                </p>
                {result.statusCode && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Status: {result.statusCode}
                  </p>
                )}
                {result.data && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Show data
                    </summary>
                    <pre className="text-xs mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-40">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 space-y-2">
        <h3 className="font-semibold mb-2">Backend Configuration</h3>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Project ID:</span>{" "}
            {projectId}
          </p>
          <p>
            <span className="text-muted-foreground">API Base:</span>{" "}
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
              {API_BASE}
            </code>
          </p>
          <p>
            <span className="text-muted-foreground">User:</span>{" "}
            {user ? `${user.name} (${user.id})` : "Not logged in"}
          </p>
          <p>
            <span className="text-muted-foreground">Access Token:</span>{" "}
            {accessToken ? "Present" : "Missing"}
          </p>
        </div>
      </div>

      {user && accessToken && (
        <Button
          onClick={async () => {
            try {
              toast.info("Creating test order...");
              const response = await fetch(`${API_BASE}/orders`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  itemTitle: "Test Order",
                  itemPrice: 10.99,
                  orderType: "pickup",
                  phone: user.phone,
                  specialInstructions: "Test order from debug page",
                  subtotal: 10.99,
                  tax: 0.88,
                  deliveryFee: 0,
                  total: 11.87,
                }),
              });

              const data = await response.json();

              if (response.ok) {
                toast.success("Test order created successfully!");
                console.log("Test order:", data);
                runTests(); // Refresh to show new order
              } else {
                toast.error(`Failed: ${data.error}`);
                console.error("Test order failed:", data);
              }
            } catch (error) {
              toast.error(`Error: ${error.message}`);
              console.error("Test order exception:", error);
            }
          }}
          className="w-full"
          variant="outline"
        >
          Create Test Order
        </Button>
      )}
    </div>
  );
}