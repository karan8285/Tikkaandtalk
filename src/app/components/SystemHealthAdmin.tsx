import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { Activity, Database, ShoppingCart, Users, AlertCircle, CheckCircle } from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface SystemHealth {
  status: string;
  timestamp: string;
  database: {
    orders: number;
    users: number;
    menuItems: number;
    vouchers: number;
    estimatedSize: string;
  };
  activeOrders: number;
  serverUptime: string;
  recentErrors: any[];
}

export function SystemHealthAdmin({ customToken }: { customToken: string | null }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    if (!customToken) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/health`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Health API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch health metrics: ${response.status}`);
      }

      const data = await response.json();
      setHealth(data);
    } catch (error: any) {
      console.error("Error fetching health:", error);
      toast.error(`Failed to load system health: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!health) {
    return <div className="text-center py-8">Loading system health...</div>;
  }

  const isHealthy = health.status === "healthy";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Health</h2>
        <div className="flex items-center gap-2">
          <Badge variant={isHealthy ? "default" : "destructive"} className="flex items-center gap-1">
            {isHealthy ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Healthy
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4" />
                Unhealthy
              </>
            )}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Server Uptime</p>
              <p className="text-2xl font-bold">{health.serverUptime}</p>
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(health.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Orders</p>
              <p className="text-2xl font-bold">{health.activeOrders}</p>
              <p className="text-xs text-muted-foreground">
                Currently being processed
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Database Stats */}
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <Database className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-semibold">Database Statistics</p>
            <p className="text-sm text-muted-foreground">Total storage: {health.database.estimatedSize}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Orders</p>
            <p className="text-2xl font-bold">{health.database.orders}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Users</p>
            <p className="text-2xl font-bold">{health.database.users}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Menu Items</p>
            <p className="text-2xl font-bold">{health.database.menuItems}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Vouchers</p>
            <p className="text-2xl font-bold">{health.database.vouchers}</p>
          </div>
        </div>
      </Card>

      {/* Recent Errors */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Recent Errors
        </h3>
        {health.recentErrors.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <p>No recent errors detected</p>
          </div>
        ) : (
          <div className="space-y-2">
            {health.recentErrors.map((error, index) => (
              <div key={index} className="bg-red-50 border border-red-200 p-3 rounded-lg">
                <p className="text-sm text-red-800">{error.message}</p>
                <p className="text-xs text-red-600">{error.timestamp}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* System Information */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Environment:</span>
            <span className="font-medium">Production</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database Type:</span>
            <span className="font-medium">Supabase KV Store</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">API Version:</span>
            <span className="font-medium">v1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Updated:</span>
            <span className="font-medium">{new Date(health.timestamp).toLocaleString()}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}