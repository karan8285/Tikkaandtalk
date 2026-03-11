import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import {
  ShoppingCart, Users, AlertTriangle, Clock,
  ShoppingBag, RefreshCw, ChevronDown, ChevronUp, Phone, UserX,
  ArrowUpRight, ArrowDownRight, Minus, Timer, Truck,
  BarChart3, UserCheck, UserMinus, ShieldBan, Eye, Globe, Monitor
} from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface CartInfo {
  userId: string;
  userName: string;
  phone: string;
  itemCount: number;
  cartValue: number;
  items: Array<{ title: string; quantity: number; price: number }>;
  hoursSinceLastOrder: number;
}

interface CustomerInfo {
  userId: string;
  name: string;
  phone: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: string;
  daysSinceLastOrder?: number;
}

interface ActiveUserInfo {
  sessionId: string;
  page: string;
  userId: string | null;
  userName: string | null;
  userPhone: string | null;
  isGuest: boolean;
  secondsAgo: number;
}

interface ActiveUsersData {
  totalActive: number;
  loggedIn: number;
  guests: number;
  users: ActiveUserInfo[];
  pageDistribution: Record<string, number>;
}

interface InsightsData {
  carts: {
    active: CartInfo[];
    abandoned: CartInfo[];
    activeCount: number;
    abandonedCount: number;
    totalActiveValue: number;
    totalAbandonedValue: number;
  };
  funnel: {
    totalOrders: number;
    guestOrders: number;
    registeredOrders: number;
    uniqueCustomers: number;
    repeatCustomers: number;
    repeatRate: number;
    cancelledOrders: number;
    cancellationRate: number;
    statusPipeline: Record<string, number>;
    avgOrdersPerCustomer: number;
  };
  customers: {
    total: number;
    withOrders: number;
    withoutOrders: number;
    blocked: number;
    newThisWeek: number;
    topBySpend: CustomerInfo[];
    topByFrequency: CustomerInfo[];
    atRisk: CustomerInfo[];
  };
  operations: {
    avgPrepTimeMin: number | null;
    avgDeliveryTimeMin: number | null;
    avgTotalOrderTimeMin: number | null;
    prepTimeSamples: number;
    deliveryTimeSamples: number;
    totalTimeSamples: number;
    ordersPerHourToday: Array<{ hour: number; count: number }>;
  };
  revenue: {
    todayRevenue: number;
    yesterdayRevenue: number;
    todayVsYesterday: number;
    thisWeekRevenue: number;
    lastWeekRevenue: number;
    weekOverWeek: number;
    todayOrders: number;
    yesterdayOrders: number;
    collectionRate: number;
    outstandingDebt: number;
    avgOrderValue: number;
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cooking: "Cooking",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#00AA99",
  cooking: "#EA580C",
  ready: "#8B5CF6",
  out_for_delivery: "#F59E0B",
  delivered: "#00AA99",
  closed: "#22C55E",
  cancelled: "#EF4444",
};

const PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/menu": "Menu",
  "/cart": "Cart",
  "/checkout": "Checkout",
  "/order": "Order",
  "/login": "Login",
  "/signup": "Registration",
  "/profile": "Profile",
  "/admin": "Admin",
  "/order-success": "Order Success",
};

function getPageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (path.startsWith("/menu/")) return "Menu - " + path.split("/menu/")[1];
  if (path.startsWith("/order/")) return "Order Tracking";
  if (path.startsWith("/order-confirmation")) return "Confirmation";
  return path;
}

function TrendArrow({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" /> No change</span>;
  if (value > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" /> +{value.toFixed(1)}{suffix}</span>;
  return <span className="text-xs text-red-500 flex items-center gap-0.5"><ArrowDownRight className="w-3 h-3" /> {value.toFixed(1)}{suffix}</span>;
}

function CollapsibleSection({ title, icon, defaultOpen = false, badge, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-semibold text-base">{title}</h3>
          {badge}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 border-t">{children}</div>}
    </Card>
  );
}

export function BusinessInsightsAdmin({ customToken }: { customToken: string | null }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUsersData | null>(null);
  const activeUsersIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActiveUsers = useCallback(async () => {
    if (!customToken) return;
    try {
      const response = await fetch(`${API_BASE}/admin/active-users`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (response.ok) {
        const result = await response.json();
        setActiveUsers(result);
      }
    } catch {
      // Silently fail - don't interrupt the dashboard
    }
  }, [customToken]);

  useEffect(() => {
    fetchInsights();
    fetchActiveUsers();

    // Auto-refresh active users every 15 seconds
    activeUsersIntervalRef.current = setInterval(fetchActiveUsers, 15000);
    return () => {
      if (activeUsersIntervalRef.current) {
        clearInterval(activeUsersIntervalRef.current);
      }
    };
  }, [fetchActiveUsers]);

  const fetchInsights = async () => {
    if (!customToken) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/business-insights`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Business insights API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch insights: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (error: any) {
      console.error("Error fetching business insights:", error);
      toast.error(`Failed to load insights: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading business insights...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No data available</p>
        <Button variant="outline" size="sm" onClick={fetchInsights} className="mt-3">
          Load Insights
        </Button>
      </div>
    );
  }

  const maxHourlyOrders = Math.max(...data.operations.ordersPerHourToday.map(h => h.count), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Business Insights</h2>
        <Button variant="outline" size="sm" onClick={() => { fetchInsights(); fetchActiveUsers(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ============ LIVE ACTIVE USERS BANNER ============ */}
      <Card className="overflow-hidden" style={{ borderLeft: "4px solid #22C55E" }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Eye className="w-5 h-5 text-green-600" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <h3 className="font-semibold text-base">Live Activity</h3>
              <span className="text-[10px] text-muted-foreground">Auto-refreshes every 15s</span>
            </div>
            {activeUsers && (
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-bold text-green-600">{activeUsers.totalActive}</span>
                <span className="text-xs text-muted-foreground">online now</span>
              </div>
            )}
          </div>

          {activeUsers && activeUsers.totalActive > 0 ? (
            <div className="space-y-3">
              {/* Summary row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-lg p-2.5 text-center">
                  <Users className="w-4 h-4 mx-auto text-green-600 mb-0.5" />
                  <p className="text-lg font-bold text-green-700">{activeUsers.loggedIn}</p>
                  <p className="text-[10px] text-green-600">Logged In</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <Globe className="w-4 h-4 mx-auto text-gray-500 mb-0.5" />
                  <p className="text-lg font-bold text-gray-700">{activeUsers.guests}</p>
                  <p className="text-[10px] text-gray-500">Guests</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                  <Monitor className="w-4 h-4 mx-auto text-blue-500 mb-0.5" />
                  <p className="text-lg font-bold text-blue-700">
                    {Object.keys(activeUsers.pageDistribution).length}
                  </p>
                  <p className="text-[10px] text-blue-500">Pages Active</p>
                </div>
              </div>

              {/* Page distribution */}
              {Object.keys(activeUsers.pageDistribution).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Where Users Are</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(activeUsers.pageDistribution)
                      .sort(([, a], [, b]) => b - a)
                      .map(([page, count]) => (
                        <span
                          key={page}
                          className="inline-flex items-center gap-1 text-[11px] bg-gray-100 px-2.5 py-1 rounded-full"
                        >
                          <span className="font-medium">{getPageLabel(page)}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 min-w-[18px] justify-center">
                            {count}
                          </Badge>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Individual active users list */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Active Sessions</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {activeUsers.users.map((u) => (
                    <div
                      key={u.sessionId}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: u.secondsAgo < 35 ? "#22C55E" : "#F59E0B" }}
                        />
                        {u.isGuest ? (
                          <span className="text-muted-foreground truncate">Guest</span>
                        ) : (
                          <span className="font-medium truncate">{u.userName || "User"}</span>
                        )}
                        {!u.isGuest && u.userPhone && (
                          <span className="text-[10px] text-muted-foreground hidden md:inline">{u.userPhone}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">
                          {getPageLabel(u.page)}
                        </span>
                        <span className="text-[9px] text-muted-foreground w-10 text-right">
                          {u.secondsAgo < 5 ? "now" : `${u.secondsAgo}s`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeUsers ? (
            <p className="text-sm text-muted-foreground text-center py-2">No active users right now</p>
          ) : (
            <div className="flex items-center gap-2 justify-center py-2">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading live data...</span>
            </div>
          )}
        </div>
      </Card>

      {/* ============ REVENUE TREND CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4" style={{ borderLeft: "4px solid #D91A60" }}>
          <p className="text-xs text-muted-foreground">Today's Revenue</p>
          <p className="text-lg font-bold" style={{ color: "#D91A60" }}>{formatIDR(data.revenue.todayRevenue)}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{data.revenue.todayOrders} orders</span>
            <TrendArrow value={data.revenue.todayVsYesterday} />
          </div>
        </Card>

        <Card className="p-4" style={{ borderLeft: "4px solid #6366F1" }}>
          <p className="text-xs text-muted-foreground">This Week</p>
          <p className="text-lg font-bold text-indigo-600">{formatIDR(data.revenue.thisWeekRevenue)}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">vs last week</span>
            <TrendArrow value={data.revenue.weekOverWeek} />
          </div>
        </Card>

        <Card className="p-4" style={{ borderLeft: "4px solid #00AA99" }}>
          <p className="text-xs text-muted-foreground">Collection Rate</p>
          <p className="text-lg font-bold" style={{ color: "#00AA99" }}>{data.revenue.collectionRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-1">Paid / Completed</p>
        </Card>

        <Card className="p-4" style={{ borderLeft: data.revenue.outstandingDebt > 0 ? "4px solid #EF4444" : "4px solid #22C55E" }}>
          <p className="text-xs text-muted-foreground">Outstanding Debt</p>
          <p className={`text-lg font-bold ${data.revenue.outstandingDebt > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatIDR(data.revenue.outstandingDebt)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Unpaid closed orders</p>
        </Card>
      </div>

      {/* Quick KPIs Row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Order</p>
          <p className="text-sm font-bold">{formatIDR(data.revenue.avgOrderValue)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Repeat Rate</p>
          <p className="text-sm font-bold">{data.funnel.repeatRate.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cancel Rate</p>
          <p className="text-sm font-bold">{data.funnel.cancellationRate.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Prep</p>
          <p className="text-sm font-bold">{data.operations.avgPrepTimeMin ?? "N/A"}{data.operations.avgPrepTimeMin !== null ? " min" : ""}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Delivery</p>
          <p className="text-sm font-bold">{data.operations.avgDeliveryTimeMin ?? "N/A"}{data.operations.avgDeliveryTimeMin !== null ? " min" : ""}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">New This Week</p>
          <p className="text-sm font-bold">{data.customers.newThisWeek}</p>
        </div>
      </div>

      {/* ============ CARTS ============ */}
      <CollapsibleSection
        title="Cart Activity"
        icon={<ShoppingCart className="w-5 h-5" style={{ color: "#D91A60" }} />}
        defaultOpen={data.carts.abandonedCount > 0}
        badge={
          data.carts.abandonedCount > 0 ? (
            <Badge className="text-white text-[10px]" style={{ backgroundColor: "#D91A60" }}>
              {data.carts.abandonedCount} abandoned
            </Badge>
          ) : null
        }
      >
        <div className="space-y-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-semibold text-blue-800">Active Carts</p>
              </div>
              <p className="text-xl font-bold text-blue-700">{data.carts.activeCount}</p>
              <p className="text-[10px] text-blue-600">{formatIDR(data.carts.totalActiveValue)} total value</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#FFF1F5" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4" style={{ color: "#D91A60" }} />
                <p className="text-xs font-semibold" style={{ color: "#9F1239" }}>Abandoned Carts</p>
              </div>
              <p className="text-xl font-bold" style={{ color: "#D91A60" }}>{data.carts.abandonedCount}</p>
              <p className="text-[10px]" style={{ color: "#D91A60" }}>{formatIDR(data.carts.totalAbandonedValue)} potential revenue</p>
            </div>
          </div>

          {data.carts.abandoned.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Abandoned Cart Details</p>
              {data.carts.abandoned.map((cart) => (
                <div key={cart.userId} className="border rounded-lg p-3" style={{ borderLeftWidth: 3, borderLeftColor: "#D91A60" }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{cart.userName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {cart.phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: "#D91A60" }}>{formatIDR(cart.cartValue)}</p>
                      <p className="text-[10px] text-muted-foreground">{cart.itemCount} items</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cart.items.map((item, i) => (
                      <span key={i} className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">
                        {item.title} x{item.quantity}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-orange-600 mt-1">
                    Last order {cart.hoursSinceLastOrder >= 999 ? "never" : `${cart.hoursSinceLastOrder}h ago`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data.carts.active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Carts (ordered recently)</p>
              {data.carts.active.map((cart) => (
                <div key={cart.userId} className="border rounded-lg p-3" style={{ borderLeftWidth: 3, borderLeftColor: "#00AA99" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{cart.userName}</p>
                      <p className="text-[11px] text-muted-foreground">{cart.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: "#00AA99" }}>{formatIDR(cart.cartValue)}</p>
                      <p className="text-[10px] text-muted-foreground">{cart.itemCount} items</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.carts.activeCount === 0 && data.carts.abandonedCount === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No active carts found</p>
          )}

          <p className="text-[10px] text-muted-foreground italic">
            * Only tracks server-synced carts (logged-in users). Guest carts stored in localStorage are not visible here.
          </p>
        </div>
      </CollapsibleSection>

      {/* ============ ORDER STATUS PIPELINE ============ */}
      <CollapsibleSection
        title="Order Pipeline"
        icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
        defaultOpen={true}
      >
        <div className="space-y-4 pt-3">
          <div className="space-y-2">
            {Object.entries(data.funnel.statusPipeline)
              .sort(([a], [b]) => {
                const order = ["pending", "confirmed", "cooking", "ready", "out_for_delivery", "delivered", "closed", "cancelled"];
                return order.indexOf(a) - order.indexOf(b);
              })
              .map(([status, count]) => {
                const maxCount = Math.max(...Object.values(data.funnel.statusPipeline), 1);
                const percentage = (count / maxCount) * 100;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs w-28 text-right text-muted-foreground">{STATUS_LABELS[status] || status}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(percentage, 8)}%`,
                          backgroundColor: STATUS_COLORS[status] || "#6B7280",
                          minWidth: 32,
                        }}
                      >
                        <span className="text-[11px] font-bold text-white">{count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Guest Orders</p>
              <p className="text-lg font-bold">{data.funnel.guestOrders}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.funnel.totalOrders > 0 ? ((data.funnel.guestOrders / data.funnel.totalOrders) * 100).toFixed(0) : 0}% of total
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Registered Orders</p>
              <p className="text-lg font-bold">{data.funnel.registeredOrders}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.funnel.totalOrders > 0 ? ((data.funnel.registeredOrders / data.funnel.totalOrders) * 100).toFixed(0) : 0}% of total
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Unique Customers</p>
              <p className="text-lg font-bold">{data.funnel.uniqueCustomers}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.funnel.avgOrdersPerCustomer.toFixed(1)} orders/user
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Repeat Customers</p>
              <p className="text-lg font-bold text-green-600">{data.funnel.repeatCustomers}</p>
              <p className="text-[10px] text-green-600">
                {data.funnel.repeatRate.toFixed(1)}% repeat rate
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ============ OPERATIONAL METRICS ============ */}
      <CollapsibleSection
        title="Operations"
        icon={<Timer className="w-5 h-5 text-orange-600" />}
        defaultOpen={false}
      >
        <div className="space-y-4 pt-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <Clock className="w-5 h-5 mx-auto text-orange-600 mb-1" />
              <p className="text-[10px] text-muted-foreground">Avg Prep Time</p>
              <p className="text-lg font-bold text-orange-700">
                {data.operations.avgPrepTimeMin !== null ? `${data.operations.avgPrepTimeMin}m` : "N/A"}
              </p>
              <p className="text-[9px] text-muted-foreground">{data.operations.prepTimeSamples} samples</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <Truck className="w-5 h-5 mx-auto text-blue-600 mb-1" />
              <p className="text-[10px] text-muted-foreground">Avg Delivery</p>
              <p className="text-lg font-bold text-blue-700">
                {data.operations.avgDeliveryTimeMin !== null ? `${data.operations.avgDeliveryTimeMin}m` : "N/A"}
              </p>
              <p className="text-[9px] text-muted-foreground">{data.operations.deliveryTimeSamples} samples</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <Timer className="w-5 h-5 mx-auto text-purple-600 mb-1" />
              <p className="text-[10px] text-muted-foreground">Total Order Time</p>
              <p className="text-lg font-bold text-purple-700">
                {data.operations.avgTotalOrderTimeMin !== null ? `${data.operations.avgTotalOrderTimeMin}m` : "N/A"}
              </p>
              <p className="text-[9px] text-muted-foreground">{data.operations.totalTimeSamples} samples</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Orders Per Hour Today</p>
            <div className="flex items-end gap-[2px] h-24">
              {data.operations.ordersPerHourToday.map((h) => {
                const height = maxHourlyOrders > 0 ? (h.count / maxHourlyOrders) * 100 : 0;
                const isCurrentHour = h.hour === new Date().getHours();
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(height, h.count > 0 ? 8 : 2)}%`,
                        backgroundColor: isCurrentHour ? "#D91A60" : h.count > 0 ? "#6366F1" : "#E5E7EB",
                        minHeight: h.count > 0 ? 4 : 1,
                      }}
                    />
                    {h.hour % 3 === 0 && (
                      <span className="text-[8px] text-muted-foreground mt-0.5">{h.hour}</span>
                    )}
                    {h.count > 0 && (
                      <div className="absolute bottom-full mb-1 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        {h.hour}:00 - {h.count} order{h.count !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-muted-foreground">12am</span>
              <span className="text-[8px] text-muted-foreground">12pm</span>
              <span className="text-[8px] text-muted-foreground">11pm</span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ============ TOP CUSTOMERS ============ */}
      <CollapsibleSection
        title="Customer Insights"
        icon={<Users className="w-5 h-5 text-blue-600" />}
        defaultOpen={false}
        badge={
          <div className="flex gap-1">
            <Badge variant="outline" className="text-[10px]">{data.customers.total} total</Badge>
            {data.customers.blocked > 0 && (
              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200" variant="outline">
                {data.customers.blocked} blocked
              </Badge>
            )}
          </div>
        }
      >
        <div className="space-y-4 pt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <UserCheck className="w-4 h-4 mx-auto text-green-600 mb-1" />
              <p className="text-[10px] text-muted-foreground">With Orders</p>
              <p className="font-bold">{data.customers.withOrders}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <UserMinus className="w-4 h-4 mx-auto text-gray-400 mb-1" />
              <p className="text-[10px] text-muted-foreground">No Orders</p>
              <p className="font-bold">{data.customers.withoutOrders}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <UserX className="w-4 h-4 mx-auto text-orange-500 mb-1" />
              <p className="text-[10px] text-muted-foreground">At Risk</p>
              <p className="font-bold text-orange-600">{data.customers.atRisk.length}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <ShieldBan className="w-4 h-4 mx-auto text-red-500 mb-1" />
              <p className="text-[10px] text-muted-foreground">Blocked</p>
              <p className="font-bold text-red-600">{data.customers.blocked}</p>
            </div>
          </div>

          {data.customers.topBySpend.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Top Customers by Spend
              </p>
              <div className="space-y-1.5">
                {data.customers.topBySpend.map((c, i) => (
                  <div key={c.userId} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.orderCount} orders</p>
                      </div>
                    </div>
                    <p className="font-bold text-sm" style={{ color: "#D91A60" }}>{formatIDR(c.totalSpent)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.customers.topByFrequency.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Most Frequent Customers
              </p>
              <div className="space-y-1.5">
                {data.customers.topByFrequency.slice(0, 5).map((c, i) => (
                  <div key={c.userId} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatIDR(c.totalSpent)} total</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{c.orderCount} orders</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.customers.atRisk.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                At-Risk Customers (14+ days inactive)
              </p>
              <div className="space-y-1.5">
                {data.customers.atRisk.map((c) => (
                  <div
                    key={c.userId}
                    className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.phone} - {c.orderCount} orders ({formatIDR(c.totalSpent)})</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 bg-orange-50">
                      {c.daysSinceLastOrder}d ago
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}