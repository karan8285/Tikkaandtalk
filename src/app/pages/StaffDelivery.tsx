/**
 * StaffDelivery — Simplified delivery dashboard.
 * Shows orders ready for pickup and out for delivery.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth, ROLE_LABELS } from "../lib/staff-auth";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Truck, Clock, Phone, MapPin, LogOut, RefreshCw, Package, CheckCircle2, Navigation } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Order {
  id: string;
  itemTitle: string;
  total: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  phone: string;
  address?: string;
  items?: any[];
  orderNumber?: string;
  specialInstructions?: string;
  customerName?: string;
}

export default function StaffDelivery() {
  const navigate = useNavigate();
  const { staff, accessToken, loading: authLoading, signOut } = useStaffAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ready" | "delivering">("ready");
  const { checkForNewOrders } = useNewOrderAlert({ label: "Delivery" });

  useEffect(() => {
    if (authLoading) return;
    if (!staff) { navigate("/staff"); return; }
    if (staff.role !== 'delivery' && staff.role !== 'superuser' && staff.role !== 'manager') {
      toast.error("Delivery access required");
      navigate("/staff");
      return;
    }
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [staff, authLoading, navigate]);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders?page=1&limit=100&status=all&payment=all&delivery=delivery&date=all&tab=active`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken || "" },
      });
      if (response.ok) {
        const data = await response.json();
        const deliveryOrders = (data.orders || []).filter((o: Order) =>
          o.deliveryMethod === 'delivery' && ['ready', 'out_for_delivery'].includes(o.status)
        );
        
        // Check for new delivery orders and play sound alert
        checkForNewOrders(deliveryOrders.map((o: Order) => o.id));
        
        setOrders(deliveryOrders);
      }
    } catch (error) {
      console.error("Failed to fetch delivery orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      setUpdatingStatus(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        toast.success(`Order marked as ${newStatus === 'out_for_delivery' ? 'Picked Up' : 'Delivered'}`);
        fetchOrders();
      } else {
        toast.error("Failed to update order");
      }
    } catch (error) {
      toast.error("Failed to update order");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSignOut = () => { signOut(); navigate("/staff"); };

  const readyOrders = orders.filter(o => o.status === 'ready');
  const deliveringOrders = orders.filter(o => o.status === 'out_for_delivery');

  if (authLoading || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const displayOrders = activeTab === "ready" ? readyOrders : deliveringOrders;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" style={{ color: BRAND_COLOR }} />
            <div>
              <h1 className="text-lg font-bold">Deliveries</h1>
              <p className="text-xs text-gray-500">{staff.name} • {orders.length} orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setActiveTab("ready")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${activeTab === "ready" ? "text-white" : "bg-white text-gray-600"}`}
            style={activeTab === "ready" ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <Package className="w-4 h-4 inline mr-1" /> Ready ({readyOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("delivering")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${activeTab === "delivering" ? "text-white" : "bg-white text-gray-600"}`}
            style={activeTab === "delivering" ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <Navigation className="w-4 h-4 inline mr-1" /> Delivering ({deliveringOrders.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-600">
              {activeTab === "ready" ? "No orders ready for pickup" : "No active deliveries"}
            </p>
            <p className="text-sm">Orders will appear here automatically</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayOrders.map(order => (
              <Card key={order.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-extrabold text-2xl tracking-tight">
                    {getShortOrderId(order.orderNumber || order.id)}
                  </span>
                  <Badge className={`text-xs text-white ${order.status === 'ready' ? 'bg-purple-500' : 'bg-orange-500'}`}>
                    {order.status === 'ready' ? 'Ready' : 'Delivering'}
                  </Badge>
                </div>

                {/* Customer name */}
                {order.customerName && (
                  <p className="text-base font-semibold text-gray-800 mb-1">{order.customerName}</p>
                )}

                <p className="text-sm font-medium mb-1">{order.itemTitle}</p>
                <p className="text-lg font-bold mb-2" style={{ color: BRAND_COLOR }}>{formatIDR(order.total)}</p>

                {/* Customer Info */}
                <div className="space-y-1 mb-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${order.phone}`} className="underline">{order.phone}</a>
                  </div>
                  {order.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>{order.address}</p>
                    </div>
                  )}
                </div>

                {order.specialInstructions && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-3">
                    <p className="text-xs text-yellow-800">📝 {order.specialInstructions}</p>
                  </div>
                )}

                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div className="bg-gray-50 rounded p-2 mb-3">
                    {order.items.map((item: any, idx: number) => (
                      <p key={idx} className="text-xs text-gray-600">
                        {item.quantity}x {item.title || item.name}
                      </p>
                    ))}
                  </div>
                )}

                <div className="text-xs text-gray-400 mb-3">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {new Date(order.createdAt).toLocaleString()}
                </div>

                {/* Action Buttons */}
                {order.status === 'ready' && (
                  <Button
                    className="w-full text-white font-semibold"
                    style={{ backgroundColor: BRAND_COLOR }}
                    onClick={() => updateStatus(order.id, 'out_for_delivery')}
                    disabled={updatingStatus === order.id}
                  >
                    {updatingStatus === order.id ? "Updating..." : "🏍️ Pick Up for Delivery"}
                  </Button>
                )}
                {order.status === 'out_for_delivery' && (
                  <Button
                    className="w-full text-white font-semibold bg-green-600 hover:bg-green-700"
                    onClick={() => updateStatus(order.id, 'delivered')}
                    disabled={updatingStatus === order.id}
                  >
                    {updatingStatus === order.id ? "Updating..." : "✅ Mark as Delivered"}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}