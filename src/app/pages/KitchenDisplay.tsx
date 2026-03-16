import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ChefHat, Clock, Phone, MapPin, Package, Flame, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";

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
}

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const fetchOrders = useCallback(async (signal?: AbortSignal) => {
    if (!accessTokenRef.current) return;
    try {
      const response = await fetch(`${API_BASE}/admin/orders?page=1&limit=100&status=all&payment=all&delivery=all&date=all&tab=active`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessTokenRef.current,
        },
        signal,
      });

      if (response.ok) {
        const data = await response.json();
        
        // Filter only confirmed and cooking orders
        // Sort by oldest first (kitchen queue order)
        const kitchenOrders = (data.orders || [])
          .filter((order: Order) => ["confirmed", "cooking"].includes(order.status))
          .sort((a: Order, b: Order) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        
        setOrders(kitchenOrders);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/login");
      return;
    }

    if (!user.isAdmin) {
      toast.error("Admin access required");
      navigate("/");
      return;
    }

    const controller = new AbortController();
    fetchOrders(controller.signal);

    // Poll every 15 seconds
    const intervalId = setInterval(() => fetchOrders(), 15000);

    return () => { controller.abort(); clearInterval(intervalId); };
  }, [user, authLoading, navigate, fetchOrders]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
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
        toast.success(
          newStatus === "cooking" 
            ? "Order moved to cooking" 
            : "Order marked as ready"
        );
        fetchOrders();
      } else {
        toast.error("Failed to update order status");
      }
    } catch (error) {
      console.error("Failed to update order status:", error);
      toast.error("Failed to update order status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getTimeSinceOrder = (createdAt: string) => {
    const now = new Date().getTime();
    const orderTime = new Date(createdAt).getTime();
    const diffMinutes = Math.floor((now - orderTime) / 1000 / 60);
    
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes === 1) return "1 min ago";
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return "1 hour ago";
    return `${diffHours} hours ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="flex items-center justify-center h-screen">
          <p>Loading kitchen display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/staff/admin")}
                className="text-white hover:bg-gray-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                <h1 className="text-lg sm:text-2xl font-bold">Kitchen Display</h1>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <Badge className="bg-primary text-white text-sm sm:text-lg px-3 sm:px-4 py-1 sm:py-2">
                {orders.length} {orders.length === 1 ? "Order" : "Orders"}
              </Badge>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Auto: 15s</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {orders.length === 0 ? (
          <Card className="p-12 text-center bg-gray-800 border-gray-700">
            <Package className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Orders in Queue</h3>
            <p className="text-gray-400">All caught up! New orders will appear here.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {orders.map((order) => (
              <Card 
                key={order.id} 
                className={`p-5 ${
                  order.status === "confirmed" 
                    ? "bg-teal-900/20 border-teal-500/50" 
                    : "bg-orange-900/20 border-orange-500/50"
                }`}
              >
                {/* Order Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-2xl font-extrabold text-white">
                        {getShortOrderId(order.orderNumber || order.id)}
                      </h3>
                      <span className="text-xs text-gray-400">{order.orderNumber || order.id}</span>
                      <Badge 
                        className={
                          order.status === "confirmed"
                            ? "bg-teal-500 text-white"
                            : "bg-orange-500 text-white"
                        }
                      >
                        {order.status === "confirmed" ? "New Order" : "Cooking"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>{getTimeSinceOrder(order.createdAt)}</span>
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-sm ${
                      order.deliveryMethod === "delivery"
                        ? "border-blue-500 text-blue-400"
                        : "border-green-500 text-green-400"
                    }`}
                  >
                    {order.deliveryMethod === "delivery" ? (
                      <>
                        <MapPin className="w-3 h-3 mr-1" />
                        Delivery
                      </>
                    ) : (
                      <>
                        <Package className="w-3 h-3 mr-1" />
                        Pickup
                      </>
                    )}
                  </Badge>
                </div>

                {/* Order Items */}
                <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-primary" />
                    Items to Prepare
                  </h4>
                  <div className="space-y-2">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-start py-2 border-b border-gray-700 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-primary">
                              {item.quantity}×
                            </span>
                            <div>
                              <p className="font-medium text-white">
                                {item.name || item.title}
                              </p>
                              {item.category && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {item.category}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400">{order.itemTitle}</p>
                    )}
                  </div>
                </div>

                {/* Special Instructions */}
                {order.specialInstructions && (
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
                    <p className="text-sm font-semibold text-yellow-400 mb-1">
                      ⚠️ Special Instructions:
                    </p>
                    <p className="text-sm text-white">{order.specialInstructions}</p>
                  </div>
                )}

                {/* Customer Info */}
                <div className="flex items-center gap-4 text-sm text-gray-400 mb-4 pb-4 border-b border-gray-700">
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    <span>{order.phone}</span>
                  </div>
                  {order.deliveryMethod === "delivery" && order.address && (
                    <div className="flex items-center gap-1 flex-1">
                      <MapPin className="w-4 h-4" />
                      <span className="truncate">{order.address}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {order.status === "confirmed" && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, "cooking")}
                      disabled={updatingStatus === order.id}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      <Flame className="w-4 h-4 mr-2" />
                      Start Cooking
                    </Button>
                  )}
                  
                  {order.status === "cooking" && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, "ready")}
                      disabled={updatingStatus === order.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Mark as Ready
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}