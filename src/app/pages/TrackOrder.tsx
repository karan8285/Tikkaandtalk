import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, RefreshCw, CheckCircle2, Package, MapPin, Ticket, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { getRestaurantLogo } from "../lib/useRestaurantLogo";
import { getShortOrderId } from "../lib/orderUtils";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { LOGO_ALT, APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface OrderItem {
  id: string;
  name?: string;
  title?: string;
  price: number;
  quantity: number;
  isCustom?: boolean;
  notes?: string;
  category?: string;
}

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  label: string;
}

interface Order {
  orderNumber: string;
  status: string;
  statusHistory: StatusHistoryItem[];
  items: OrderItem[];
  itemTitle: string;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: string;
  address?: string;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDelivery?: string;
  paymentDetails?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  paymentReceived?: boolean;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  pointsAwarded?: boolean;
  pointsEarned?: number;
  promoCode?: string;
  promoDiscount?: number;
  promoVoucherTitle?: string;
  taxRate?: number;
  customCharges?: Array<{ id: string; name: string; amount: number; addedByAdmin?: boolean }>;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
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
    color: BRAND, 
    description: 'Preparing your food'
  },
  ready: { 
    icon: '✓', 
    color: '#9B59B6', 
    description: 'Food ready for pickup'
  },
  out_for_delivery: { 
    icon: '🚗', 
    color: BRAND, 
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

export default function TrackOrder() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);

      const response = await fetch(`${API_BASE}/track/${orderNumber}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("Order not found. Please check the order number.");
        } else {
          setError("Failed to load order details.");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setOrder(data.order);
      setError(null);
      if (showToast) {
        toast.success("Order status updated");
      }
    } catch (err) {
      console.error("Failed to fetch order:", err);
      setError("Failed to load order details.");
      if (showToast) {
        toast.error("Failed to refresh order");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (orderNumber) {
      fetchOrder();
      
      // Poll every 15 seconds for real-time updates
      const interval = setInterval(() => {
        fetchOrder();
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [orderNumber]);

  const handleRefresh = () => {
    fetchOrder(true);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
    
    // Check if status is in history
    const inHistory = order.statusHistory && order.statusHistory.some(h => h.status === statusKey);
    if (inHistory) return true;
    
    // Special case: payment_received
    const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
    if (statusKey === 'payment_received' && effectivePS === 'paid') return true;
    
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

  const getStatusIcon = (statusKey: string, isCompleted: boolean, isCurrent: boolean) => {
    const iconSize = "w-5 h-5";
    
    if (isCompleted || isCurrent) {
      // ALL COMPLETED & CURRENT STEPS GET WHITE CHECKMARK (on green background)
      return <CheckCircle2 className={iconSize} style={{ color: 'white' }} />;
    }
    
    // Future status - show empty circle
    return <div className="w-2 h-2 rounded-full border-2 border-gray-300" />;
  };

  const getPointsStatus = () => {
    if (!order) return { message: "", color: "gray" };
    
    const pointsAmount = Math.floor(order.total / 1000);
    
    if (order.pointsAwarded) {
      return {
        message: `✅ Customer earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'cancelled') {
      return {
        message: `No points earned (order cancelled)`,
        color: "#999"
      };
    }
    
    const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
    
    if (order.status === 'closed' && effectivePS === 'paid') {
      return {
        message: `✅ Customer earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'closed' && effectivePS !== 'paid') {
      return {
        message: `⏳ ${pointsAmount} points pending full payment`,
        color: BRAND
      };
    }
    
    if (order.status === 'delivered') {
      return {
        message: `⏳ Will earn ${pointsAmount} points once fully paid`,
        color: BRAND
      };
    }
    
    return {
        message: `💡 Will earn ${pointsAmount} points when order is delivered and paid`,
        color: "#666"
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Simple Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Order Tracking</h1>
            <div className="w-9"></div> {/* Spacer for centering */}
          </div>
        </div>
        <main className="max-w-md mx-auto px-4 py-6">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading order...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Simple Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Order Tracking</h1>
            <div className="w-9"></div> {/* Spacer for centering */}
          </div>
        </div>
        <main className="max-w-md mx-auto px-4 py-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">😕</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-6">{error || "Please check your order number and try again."}</p>
            <Button onClick={() => navigate("/")} variant="outline">
              Go to Homepage
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const pointsStatus = getPointsStatus();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back and Refresh Buttons */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Order Tracking</h1>
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <img 
              src={getRestaurantLogo()} 
              alt={LOGO_ALT} 
              className="w-40 h-auto"
              style={{ 
                filter: `drop-shadow(0 2px 8px ${APP_CONFIG.brand.primaryShadow})`,
                objectFit: "contain"
              }}
            />
          </div>
          <div className="mt-3 text-sm">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">{getShortOrderId(order.orderNumber)}</h2>
            <span className="font-semibold">Your Order ID:</span> {order.orderNumber}
          </div>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: BRAND }} />
            Order Details
          </h3>
          
          <div className="space-y-2 mb-4">
            {order.items && order.items.length > 0 ? (
              order.items.map((item, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      {item.name || item.title}
                      {item.category && <span className="text-muted-foreground"> ({item.category})</span>}
                      {(item as any).addedByAdmin && (
                        <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Added by Admin</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">Qty: {item.quantity}</span>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-blue-600 italic mt-1 ml-2">Note: {item.notes}</p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm">{order.itemTitle}</div>
            )}

            {/* Custom Charges */}
            {order.customCharges && order.customCharges.length > 0 && (
              <div className="pt-2 border-t border-dashed">
                <p className="text-[10px] uppercase tracking-wider text-purple-500 font-semibold mb-1.5">Additional Charges</p>
                {order.customCharges.map((charge) => (
                  <div key={charge.id} className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      {charge.name}
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Added by Admin</span>
                    </span>
                    <span className="text-purple-700 font-medium">Rp {charge.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
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

          {order.specialInstructions && (
            <div className="pt-3 border-t mt-3">
              <div className="text-sm font-medium mb-1">Special Instructions:</div>
              <div className="text-sm text-muted-foreground">
                {order.specialInstructions}
              </div>
            </div>
          )}

          <div className="pt-3 border-t mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>Rp {(order.subtotal || 0).toLocaleString()}</span>
            </div>
            {(order.promoDiscount != null && order.promoDiscount > 0) && (
              <div className="flex justify-between">
                <span className="text-green-600 flex items-center gap-1">
                  <Ticket className="w-3 h-3" />
                  Promo {order.promoCode ? `(${order.promoCode})` : ''}
                </span>
                <span className="text-green-600 font-medium">-Rp {order.promoDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (PPN{order.taxRate ? ` ${order.taxRate}%` : ''})</span>
              <span>Rp {(order.tax || 0).toLocaleString()}</span>
            </div>
            {order.deliveryMethod === 'delivery' && (() => {
              const feeKnown = order.deliveryFee != null && order.deliveryFee >= 0 &&
                (order.deliveryFee > 0 || order.lastModifiedAt ||
                 ['ready', 'out_for_delivery', 'delivered', 'closed'].includes(order.status));
              return (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className={
                    feeKnown
                      ? (order.deliveryFee === 0 ? "text-green-600 font-medium" : "")
                      : "text-amber-600 italic text-xs"
                  }>
                    {feeKnown
                      ? (order.deliveryFee === 0 ? "Free" : `Rp ${order.deliveryFee!.toLocaleString()}`)
                      : "To be Calculated"}
                  </span>
                </div>
              );
            })()}
            {order.customCharges && order.customCharges.length > 0 && (() => {
              const chargesTotal = order.customCharges.reduce((sum, ch) => sum + (ch.amount || 0), 0);
              return (
                <div className="flex justify-between">
                  <span className="text-purple-600">Custom Charges</span>
                  <span className="text-purple-600 font-medium">+Rp {chargesTotal.toLocaleString()}</span>
                </div>
              );
            })()}
            <div className="flex justify-between pt-1.5 border-t font-bold text-lg" style={{ color: BRAND }}>
              <span>Total</span>
              <span>Rp {order.total.toLocaleString()}</span>
            </div>
            {/* Modification notice */}
            {order.lastModifiedAt && (
              <p className="text-[10px] text-blue-600 mt-1 text-center">
                Order modified by {order.lastModifiedBy || 'Admin'} on {new Date(order.lastModifiedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
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
            <Clock className="w-5 h-5" style={{ color: BRAND }} />
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
                        backgroundColor: '#00AA99',
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
                          backgroundColor: isCompleted ? '#00AA99' : '#E5E7EB'
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
        </div>

        {/* Auto-refresh notice */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
            <p className="text-xs text-blue-800">
              This page automatically updates every 15 seconds to show the latest order status
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}