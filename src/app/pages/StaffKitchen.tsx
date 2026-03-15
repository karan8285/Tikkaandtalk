/**
 * StaffKitchen — Simplified kitchen ticket board for kitchen staff.
 * Shows only active cooking orders as a live board with status updates.
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth, ROLE_LABELS, ROLE_COLORS } from "../lib/staff-auth";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ChefHat, Clock, Phone, MapPin, Package, Flame, CheckCircle2, LogOut, RefreshCw, Truck, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface OrderItem {
  id?: string;
  title?: string;
  name?: string;
  quantity: number;
  price?: number;
  category?: string;
}

interface Order {
  id: string;
  userId: string;
  itemTitle: string;
  total: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  phone: string;
  address?: string;
  specialInstructions?: string;
  items?: OrderItem[];
  orderNumber?: string;
  scheduledAt?: string;
  customerName?: string;
}

const STATUS_FLOW: Record<string, string> = {
  confirmed: "cooking",
  cooking: "ready",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "border-teal-400 bg-teal-50",
  cooking: "border-red-400 bg-red-50",
  ready: "border-purple-400 bg-purple-50",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  cooking: "Cooking",
  ready: "Ready for Pickup",
};

const STATUS_ICONS: Record<string, any> = {
  confirmed: CheckCircle2,
  cooking: Flame,
  ready: UtensilsCrossed,
};

export default function StaffKitchen() {
  const navigate = useNavigate();
  const { staff, accessToken, loading: authLoading, signOut } = useStaffAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const prevCountRef = useRef(0);
  const { checkForNewOrders } = useNewOrderAlert({ label: "Kitchen" });

  useEffect(() => {
    if (authLoading) return;
    if (!staff) { navigate("/staff"); return; }
    if (staff.role !== 'kitchen' && staff.role !== 'superuser' && staff.role !== 'manager') {
      toast.error("Kitchen access required");
      navigate("/staff");
      return;
    }

    fetchOrders();
    const intervalId = setInterval(fetchOrders, 10000); // Poll every 10s
    return () => clearInterval(intervalId);
  }, [staff, authLoading, navigate]);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders?page=1&limit=100&status=all&payment=all&delivery=all&date=all&tab=active`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken || "" },
      });

      if (response.ok) {
        const data = await response.json();
        // Filter: only confirmed, cooking, ready orders (kitchen starts at confirmed)
        const kitchenOrders = (data.orders || []).filter((o: Order) =>
          ['confirmed', 'cooking', 'ready'].includes(o.status)
        );
        
        // Check for new orders and play sound alert
        checkForNewOrders(kitchenOrders.map((o: Order) => o.id));
        
        prevCountRef.current = kitchenOrders.length;
        
        setOrders(kitchenOrders);
      }
    } catch (error) {
      console.error("Failed to fetch kitchen orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const advanceStatus = async (order: Order) => {
    const nextStatus = STATUS_FLOW[order.status];
    if (!nextStatus) return;

    try {
      setUpdatingStatus(order.id);
      const response = await fetch(`${API_BASE}/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (response.ok) {
        toast.success(`Order moved to: ${STATUS_LABELS[nextStatus]}`);
        fetchOrders();
      } else {
        toast.error("Failed to update order status");
      }
    } catch (error) {
      toast.error("Failed to update order status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSignOut = () => {
    signOut();
    navigate("/staff");
  };

  const getElapsedMinutes = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.floor(diff / 60000);
  };

  if (authLoading || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // Group orders by status
  const columns = ['confirmed', 'cooking', 'ready'];
  const grouped = columns.reduce((acc, status) => {
    acc[status] = orders.filter(o => o.status === status);
    return acc;
  }, {} as Record<string, Order[]>);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <ChefHat className="w-6 h-6" style={{ color: BRAND_COLOR }} />
            <div>
              <h1 className="text-lg font-bold">Kitchen Display</h1>
              <p className="text-xs text-gray-400">{staff.name} • {orders.length} active orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchOrders} className="text-gray-300 border-gray-600 hover:bg-gray-700">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="text-gray-300 border-gray-600 hover:bg-gray-700">
              <LogOut className="w-4 h-4 mr-1" /> Out
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ChefHat className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-xl font-semibold">No active orders</p>
          <p className="text-sm">New orders will appear here automatically</p>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto p-4">
          {/* Column layout for larger screens, stacked for mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map(status => {
              const StatusIcon = STATUS_ICONS[status];
              return (
                <div key={status}>
                  <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${STATUS_COLORS[status]} border-t-2`}>
                    <div className="flex items-center gap-2">
                      <StatusIcon className="w-4 h-4" />
                      <span className="font-bold text-sm text-gray-900">{STATUS_LABELS[status]}</span>
                    </div>
                    <Badge className="bg-gray-900 text-white text-xs">{grouped[status]?.length || 0}</Badge>
                  </div>
                  <div className="space-y-2 mt-2">
                    {grouped[status]?.map(order => {
                      const elapsed = getElapsedMinutes(order.createdAt);
                      const isUrgent = elapsed > 15;
                      return (
                        <Card
                          key={order.id}
                          className={`p-3 bg-gray-800 border-gray-700 ${isUrgent ? 'border-red-500 border-2' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono font-extrabold text-2xl text-white tracking-tight">
                              {getShortOrderId(order.orderNumber || order.id)}
                            </span>
                            <span className={`text-xs font-mono ${isUrgent ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                              <Clock className="w-3 h-3 inline mr-1" />{elapsed}m
                            </span>
                          </div>

                          {/* Customer name */}
                          {order.customerName && (
                            <p className="text-sm text-gray-300 font-medium mb-1">{order.customerName}</p>
                          )}

                          {/* Items */}
                          <div className="space-y-1 mb-2">
                            {order.items && order.items.length > 0 ? (
                              order.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                  <span className="text-gray-200">
                                    <span className="font-bold text-white">{item.quantity}x</span>{' '}
                                    {item.title || item.name}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-300">{order.itemTitle}</p>
                            )}
                          </div>

                          {order.specialInstructions && (
                            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded px-2 py-1 mb-2">
                              <p className="text-xs text-yellow-300">📝 {order.specialInstructions}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              {order.deliveryMethod === 'delivery' ? <Truck className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                              {order.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}
                            </span>
                          </div>

                          {/* Action button */}
                          {STATUS_FLOW[order.status] && (
                            <Button
                              className="w-full mt-2 text-white font-semibold"
                              style={{ backgroundColor: BRAND_COLOR }}
                              size="sm"
                              onClick={() => advanceStatus(order)}
                              disabled={updatingStatus === order.id}
                            >
                              {updatingStatus === order.id ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <>Move to {STATUS_LABELS[STATUS_FLOW[order.status]]}</>
                              )}
                            </Button>
                          )}
                        </Card>
                      );
                    })}
                    {(!grouped[status] || grouped[status].length === 0) && (
                      <div className="text-center py-4 text-gray-500 text-xs">No orders</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}