import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Clock, MapPin, Phone, RefreshCw, Package, CheckCircle2, ChefHat, Truck, PartyPopper, XCircle, DollarSign, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import logoImage from "figma:asset/eaec9b840a2852be3b4c61f12d73c18841efc0f2.png";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
}

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  label: string;
}

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  itemTitle: string;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: string;
  phone: string;
  address?: string;
  specialInstructions?: string;
  status: string;
  paymentReceived: boolean;
  paymentDetails?: string;
  pointsAwarded: boolean;
  pointsEarned?: number;
  statusHistory?: StatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
  cancelledBy?: string;
  cancellationReason?: string;
  orderNumber?: string;
  createdByAdmin?: boolean;
}

const statusConfig: Record<string, { icon: string; color: string; description: string }> = {
  pending: { 
    icon: '⏱️', 
    color: '#FFA500', 
    description: 'Waiting for confirmation'
  },
  confirmed: { 
    icon: '✅', 
    color: '#00AA99', 
    description: 'Kitchen accepted order'
  },
  cooking: { 
    icon: '🍳', 
    color: '#D91A60', 
    description: 'Preparing your food'
  },
  ready: { 
    icon: '✓', 
    color: '#9B59B6', 
    description: 'Food ready for pickup'
  },
  out_for_delivery: { 
    icon: '🚗', 
    color: '#D91A60', 
    description: 'On the way to you'
  },
  delivered: { 
    icon: '✅', 
    color: '#00AA99', 
    description: 'Order delivered successfully'
  },
  closed: { 
    icon: '🎉', 
    color: '#00AA99', 
    description: 'Order complete'
  },
  cancelled: { 
    icon: '❌', 
    color: '#E74C3C', 
    description: 'Order was cancelled'
  },
  payment_received: {
    icon: '💰',
    color: '#00AA99',
    description: 'Payment confirmed'
  }
};

export default function OrderTracking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/login");
      return;
    }

    if (orderId) {
      fetchOrder();
      
      // Auto-refresh every 15 seconds
      const interval = setInterval(fetchOrder, 15000);
      return () => clearInterval(interval);
    }
  }, [user, authLoading, orderId, navigate]);

  const fetchOrder = async (showToast = false) => {
    if (!user?.id || !orderId) return;

    try {
      if (showToast) setRefreshing(true);
      
      const response = await fetch(`${API_BASE}/orders/${orderId}?userId=${user.id}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOrder(data.order);
        if (showToast) {
          toast.success("Order status updated");
        }
      } else {
        const error = await response.json();
        if (error.error === "Order not found") {
          toast.error("Order not found");
          navigate("/order-history");
        }
      }
    } catch (error) {
      console.error("Failed to fetch order:", error);
      if (showToast) {
        toast.error("Failed to refresh order");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchOrder(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPointsStatus = () => {
    if (!order) return { message: "", color: "gray" };
    
    const pointsAmount = Math.floor(order.total / 1000);
    
    if (order.pointsAwarded) {
      return {
        message: `✅ You earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'cancelled') {
      return {
        message: `No points earned (order cancelled)`,
        color: "#999"
      };
    }
    
    if (order.status === 'closed' && order.paymentReceived) {
      return {
        message: `✅ You earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'closed' && !order.paymentReceived) {
      return {
        message: `⏳ ${pointsAmount} points pending payment confirmation`,
        color: "#D91A60"
      };
    }
    
    if (order.status === 'delivered') {
      return {
        message: `⏳ You will earn ${pointsAmount} points once payment is confirmed`,
        color: "#D91A60"
      };
    }
    
    return {
      message: `💡 You will earn ${pointsAmount} points when order is delivered and paid`,
      color: "#666"
    };
  };

  const getAllStatuses = () => {
    if (!order) return [];
    
    // If order is cancelled, only show Order Created and Cancelled
    if (order.status === 'cancelled') {
      return [
        { key: 'pending', label: 'Order Created' },
        { key: 'cancelled', label: 'Cancelled' }
      ];
    }
    
    const isDelivery = order.deliveryMethod === "delivery";
    
    const baseStatuses = [
      { key: 'pending', label: 'Order Created' },
      { key: 'confirmed', label: 'Confirmed' },
      { key: 'cooking', label: 'Cooking' },
      { key: 'ready', label: 'Ready' },
    ];
    
    if (isDelivery) {
      baseStatuses.push({ key: 'out_for_delivery', label: 'Out for Delivery' });
    }
    
    baseStatuses.push(
      { key: 'delivered', label: 'Delivered' },
      { key: 'payment_received', label: 'Payment Received' },
      { key: 'closed', label: 'Order Closed' }
    );
    
    return baseStatuses;
  };

  const isStatusCompleted = (statusKey: string) => {
    if (!order) return false;
    
    // Check if status is in history (with null check)
    const inHistory = order.statusHistory && order.statusHistory.some(h => h.status === statusKey);
    if (inHistory) return true;
    
    // Special case: payment_received
    if (statusKey === 'payment_received' && order.paymentReceived) return true;
    
    // Check if current status
    if (order.status === statusKey) return true;
    
    // Check status hierarchy
    const statusOrder = ['pending', 'confirmed', 'cooking', 'ready', 'out_for_delivery', 'delivered', 'closed'];
    const currentIndex = statusOrder.indexOf(order.status);
    const checkIndex = statusOrder.indexOf(statusKey);
    
    if (currentIndex >= 0 && checkIndex >= 0 && currentIndex > checkIndex) {
      return true;
    }
    
    return false;
  };

  const isStatusCurrent = (statusKey: string) => {
    if (!order) return false;
    return order.status === statusKey;
  };

  // Get icon component for each status
  const getStatusIcon = (statusKey: string, isCompleted: boolean, isCurrent: boolean) => {
    const iconSize = "w-5 h-5";
    
    if (isCompleted || isCurrent) {
      // ✅ ALL COMPLETED & CURRENT STEPS GET WHITE CHECKMARK (on green background)
      return <CheckCircle2 className={iconSize} style={{ color: 'white' }} />;
    }
    
    // Future status - show empty circle
    return <div className="w-2 h-2 rounded-full border-2 border-gray-300" />;
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Tracking" />
        <main className="max-w-md mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading order...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Tracking" />
        <main className="max-w-md mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Order not found</p>
          </div>
        </main>
      </div>
    );
  }

  const pointsStatus = getPointsStatus();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        showBack 
        title="Order Tracking"
        rightContent={
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      
      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <img 
              src={logoImage} 
              alt="Tikka N Talk - An Indian Kitchen" 
              className="w-40 h-auto"
              style={{ 
                filter: "drop-shadow(0 2px 8px rgba(217, 26, 96, 0.15))",
                objectFit: "contain"
              }}
            />
          </div>
          <div className="mt-3 text-sm">
            <span className="font-semibold">Your Order ID:</span> {order.orderNumber || `TNT${order.id.substring(0, 8).toUpperCase()}`}
            {order.createdByAdmin && (
              <div className="mt-2">
                <span className="inline-block text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                  This order was placed by our restaurant on your behalf
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: '#D91A60' }} />
            Order Details
          </h3>
          
          <div className="space-y-2 mb-4">
            {order.items.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm">
                  <span>
                    {(item as any).name || item.title}
                    {item.category && <span className="text-muted-foreground"> ({item.category})</span>}
                  </span>
                  <span className="text-muted-foreground">Qty: {item.quantity}</span>
                </div>
                {(item as any).notes && (
                  <p className="text-xs text-blue-600 italic mt-1 ml-2">Note: {(item as any).notes}</p>
                )}
              </div>
            ))}
          </div>

          {order.address && (
            <div className="pt-3 border-t">
              <div className="text-sm font-medium mb-1">Delivery Address:</div>
              <div className="text-sm text-muted-foreground flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{order.address}</span>
              </div>
            </div>
          )}

          <div className="pt-3 border-t mt-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Phone:</span>
              <span className="font-medium">{order.phone}</span>
            </div>
          </div>

          <div className="pt-3 border-t mt-3">
            <div className="text-2xl font-bold" style={{ color: '#D91A60' }}>
              Rp {order.total.toLocaleString()}
            </div>
          </div>

          {/* Payment Details Display */}
          {order.paymentDetails && (
            <div className="pt-3 border-t mt-3">
              <div className="text-sm font-medium mb-1 text-green-900">Payment Details:</div>
              <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-2 text-green-800">
                {order.paymentDetails}
              </div>
            </div>
          )}

          {/* Cancellation Reason Display */}
          {order.status === "cancelled" && order.cancellationReason && (
            <div className="pt-3 border-t mt-3">
              <div className="text-sm font-medium mb-1 text-red-900">❌ Cancellation Reason:</div>
              <div className="text-sm bg-red-50 border border-red-200 rounded-lg p-2 text-red-800">
                {order.cancellationReason}
              </div>
              {order.cancelledBy === "admin" && (
                <div className="text-xs text-red-700 mt-1">Cancelled by Restaurant</div>
              )}
            </div>
          )}
        </div>

        {/* Order Tracking Timeline */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" style={{ color: '#D91A60' }} />
            Order Tracking
          </h3>

          <div className="space-y-1">
            {getAllStatuses().map((statusItem, index) => {
              const isCompleted = isStatusCompleted(statusItem.key);
              const isCurrent = isStatusCurrent(statusItem.key);
              const config = statusConfig[statusItem.key];
              const historyItem = order.statusHistory && order.statusHistory.find(h => h.status === statusItem.key);
              
              return (
                <div key={statusItem.key} className="flex gap-4 items-start">
                  {/* Timeline Icon */}
                  <div className="flex flex-col items-center pt-1">
                    <div 
                      className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all ${
                        isCompleted 
                          ? 'text-white shadow-md' 
                          : isCurrent
                          ? 'text-white shadow-md'
                          : 'bg-gray-100'
                      }`}
                      style={isCompleted || isCurrent ? { 
                        backgroundColor: '#00AA99', // Green for all completed/current steps
                        color: 'white'
                      } : {}}
                    >
                      {getStatusIcon(statusItem.key, isCompleted, isCurrent)}
                    </div>
                    {index < getAllStatuses().length - 1 && (
                      <div 
                        className={`w-0.5 my-1 transition-all ${
                          isCompleted ? 'h-12' : 'h-10'
                        }`}
                        style={{ 
                          backgroundColor: isCompleted ? '#00AA99' : '#E5E7EB' // Green line for completed, gray for pending
                        }}
                      />
                    )}
                  </div>

                  {/* Status Info */}
                  <div className="flex-1 pb-3">
                    <div className={`font-semibold text-base mb-0.5 ${
                      isCurrent || isCompleted ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {statusItem.label}
                    </div>
                    <div className={`text-xs ${isCompleted || isCurrent ? 'text-gray-600' : 'text-gray-400'}`}>
                      {isCompleted && historyItem ? formatTime(historyItem.timestamp) : config?.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Points Status */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-lg">⭐</span>
            Points Status
          </h3>
          <p className="text-sm" style={{ color: pointsStatus.color }}>
            {pointsStatus.message}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 space-y-3">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="w-full h-12 text-base font-semibold"
          >
            Go Home
          </Button>
          <Button
            onClick={() => navigate("/order-history")}
            variant="ghost"
            className="w-full h-12 text-base"
          >
            View All Orders
          </Button>
        </div>
      </main>
    </div>
  );
}