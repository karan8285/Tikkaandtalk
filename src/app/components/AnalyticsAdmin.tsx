import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Analytics {
  customers: {
    total: number;
    withOrders: number;
    tierDistribution: {
      silver: number;
      gold: number;
      diamond: number;
    };
  };
  orders: {
    total: number;
    completed: number;
    paid: number;
    unpaid: number;
    typeBreakdown: {
      pickup: number;
      delivery: number;
    };
  };
  revenue: {
    realized: number;
    pending: number;
    total: number;
  };
  peakHours: Array<{ hour: number; count: number }>;
  points: {
    totalIssued: number;
    totalRedeemed: number;
    currentlyHeld: number;
  };
  revenueByDayOfWeek: Array<{
    day: string;
    revenue: number;
    orders: number;
  }>;
}

export function AnalyticsAdmin({ customToken }: { customToken: string | null }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    if (!customToken) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/analytics`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Analytics API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch analytics: ${response.status}`);
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      toast.error(`Failed to load analytics: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  if (!analytics) {
    return null;
  }

  const tierColors = {
    silver: "bg-gray-400",
    gold: "bg-yellow-500",
    diamond: "bg-cyan-500",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Advanced Analytics</h2>

      {/* Customer Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Customers</p>
              <p className="text-2xl font-bold">{analytics.customers.total}</p>
              <p className="text-xs text-muted-foreground">
                {analytics.customers.withOrders} with orders
              </p>
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <p className="text-sm font-semibold mb-2">Tier Distribution</p>
            {Object.entries(analytics.customers.tierDistribution).map(([tier, count]) => (
              <div key={tier} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${tierColors[tier as keyof typeof tierColors]}`}></div>
                  <span className="text-sm capitalize">{tier}</span>
                </div>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{analytics.orders.total}</p>
              <p className="text-xs text-muted-foreground">
                {analytics.orders.completed} completed
              </p>
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <p className="text-sm font-semibold mb-2">Order Type Breakdown</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">Pickup</span>
              <span className="font-semibold">{analytics.orders.typeBreakdown.pickup}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Delivery</span>
              <span className="font-semibold">{analytics.orders.typeBreakdown.delivery}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Revenue & Payment Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#FCE4EC' }}>
              <DollarSign className="w-6 h-6" style={{ color: APP_CONFIG.brand.primaryColor }} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue Overview</p>
              <p className="text-2xl font-bold" style={{ color: APP_CONFIG.brand.primaryColor }}>
                {formatIDR(analytics.revenue.realized)}
              </p>
              <p className="text-xs text-muted-foreground">Total Realized</p>
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pending Payment</span>
              <span className="font-semibold" style={{ color: APP_CONFIG.brand.primaryColor }}>
                {formatIDR(analytics.revenue.pending)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-semibold">Total Revenue</span>
              <span className="font-bold">{formatIDR(analytics.revenue.total)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-teal-100 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Status</p>
              <p className="text-2xl font-bold">{analytics.orders.completed}</p>
              <p className="text-xs text-muted-foreground">Completed Orders</p>
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Paid Orders</span>
              <span className="font-semibold text-green-600">{analytics.orders.paid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Unpaid Orders</span>
              <span className="font-semibold" style={{ color: APP_CONFIG.brand.primaryColor }}>{analytics.orders.unpaid}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Points Analytics */}
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Award className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Loyalty Points</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Issued</p>
            <p className="text-xl font-bold">{analytics.points.totalIssued.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Redeemed</p>
            <p className="text-xl font-bold">{analytics.points.totalRedeemed.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Currently Held</p>
            <p className="text-xl font-bold">{analytics.points.currentlyHeld.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Peak Hours */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Peak Hours</h3>
        <div className="space-y-2">
          {analytics.peakHours.map((item, index) => (
            <div key={index} className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-lg text-muted-foreground">#{index + 1}</span>
                <span className="text-sm">
                  {item.hour}:00 - {item.hour + 1}:00
                </span>
              </div>
              <span className="font-semibold">{item.count} orders</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue by Day of Week */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Revenue by Day of Week</h3>
        <div className="space-y-2">
          {analytics.revenueByDayOfWeek.map((item, index) => (
            <div key={index} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">{item.day}</p>
                <p className="text-sm text-muted-foreground">{item.orders} orders</p>
              </div>
              <p className="font-semibold text-green-600">{formatIDR(item.revenue)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}