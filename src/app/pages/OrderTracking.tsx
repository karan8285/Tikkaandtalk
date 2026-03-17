import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../lib/auth";
import { APP_CONFIG, LOGO_ALT } from "../lib/config";
import { Button } from "../components/ui/button";
import { Header } from "../components/Header";
import { Textarea } from "../components/ui/textarea";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import {
  RefreshCw, MapPin, Phone, Clock, CheckCircle2,
  Package, CreditCard, Ticket, DollarSign, AlertCircle, Loader2, Camera, X, MessageCircle, Star, ImagePlus,
} from "lucide-react";
import { formatIDR } from "../lib/currency";
import { getRestaurantLogo } from "../lib/useRestaurantLogo";
import { getShortOrderId } from "../lib/orderUtils";
import { getWhatsAppNumber, getWhatsAppDisplay } from "../lib/whatsapp";
import { loadSnapJs, openSnapPayment } from "../lib/midtrans";
import { PushNotificationPrompt } from "../components/PushNotificationPrompt";

const BRAND = APP_CONFIG.brand.primaryColor;

// Helper to render text with clickable URLs
function LinkifyText({ text, className }: { text: string; className?: string }) {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all hover:text-blue-800"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

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
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  pointsAwarded: boolean;
  pointsEarned?: number;
  statusHistory?: StatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
  cancelledBy?: string;
  cancellationReason?: string;
  orderNumber?: string;
  createdByAdmin?: boolean;
  promoCode?: string;
  promoDiscount?: number;
  promoVoucherTitle?: string;
  taxRate?: number;
  scheduledAt?: string;
  proofOfDeliveryUrl?: string;
  proofOfDeliveryAt?: string;
  adminMessage?: string;
  adminMessageAt?: string;
  rating?: number;
  ratingComment?: string;
  ratingAt?: string;
  ratingPhotos?: string[];
  customCharges?: Array<{ id: string; name: string; amount: number; addedByAdmin?: boolean }>;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
  remainingBalance?: number;
  paymentMethod?: string;
}

const statusConfig: Record<string, { icon: string; color: string; description: string }> = {
  scheduled: {
    icon: '📅',
    color: '#3B82F6',
    description: 'Order scheduled for future activation'
  },
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

/** Proof of Delivery Card — shows the delivery photo to customers */
function ProofOfDeliveryCard({ imageUrl, deliveredAt }: { imageUrl: string; deliveredAt?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Camera className="w-4 h-4 text-green-600" />
            </div>
            Proof of Delivery
          </h3>
          {deliveredAt && (
            <span className="text-xs text-gray-400">
              {new Date(deliveredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="px-5 pb-4">
          <button
            onClick={() => setExpanded(true)}
            className="w-full rounded-xl overflow-hidden border border-green-200 relative group"
          >
            <img
              src={imageUrl}
              alt="Proof of delivery"
              className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-gray-700 text-xs font-semibold rounded-full px-3 py-1.5 shadow transition-opacity">
                Tap to view full image
              </span>
            </div>
          </button>
          <p className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Your order was delivered successfully
          </p>
        </div>
      </div>

      {/* Full-screen image viewer */}
      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <button
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-2 z-10"
            onClick={() => setExpanded(false)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={imageUrl}
            alt="Proof of delivery - full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export default function OrderTracking() {
  const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, accessToken } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);

  // Rating state
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingPhotos, setRatingPhotos] = useState<File[]>([]);
  const [ratingPhotoPreviewUrls, setRatingPhotoPreviewUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [ratingPhotoViewUrl, setRatingPhotoViewUrl] = useState<string | null>(null);
  const ratingPhotoInputRef = useRef<HTMLInputElement>(null);

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
      
      const response = await fetchWithRetry(`${API_BASE}/orders/${orderId}?userId=${user.id}`, {
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

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (!order || !user || ratingValue === 0) return;
    try {
      setSubmittingRating(true);

      // Step 1: Upload photos if any
      let uploadedPhotoUrls: string[] = [];
      if (ratingPhotos.length > 0) {
        for (const photo of ratingPhotos) {
          const formData = new FormData();
          formData.append("userId", user.id);
          formData.append("photo", photo);
          const uploadRes = await fetchWithRetry(`${API_BASE}/orders/${order.id}/upload-rating-photo`, {
            method: "POST",
            headers: { Authorization: `Bearer ${publicAnonKey}` },
            body: formData,
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            uploadedPhotoUrls.push(uploadData.imageUrl);
          } else {
            const err = await uploadRes.json().catch(() => ({}));
            console.error("Photo upload failed:", err);
            toast.error(`Failed to upload photo: ${err.error || 'Unknown error'}`);
          }
        }
      }

      // Step 2: Submit rating with photo URLs
      const response = await fetchWithRetry(`${API_BASE}/orders/${order.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          userId: user.id,
          rating: ratingValue,
          comment: ratingComment.trim(),
          ratingPhotos: uploadedPhotoUrls,
        }),
      });
      if (response.ok) {
        toast.success("Thank you for your feedback!");
        setRatingPhotos([]);
        setRatingPhotoPreviewUrls([]);
        fetchOrder();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to submit rating");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  // Handle Midtrans Pay Now for unpaid/partial orders
  const handleMidtransPayNow = async () => {
    if (!order || payingNow) return;
    setPayingNow(true);
    setShowPayConfirm(false);

    try {
      console.log("💳 [TRACKING-PAY] Loading Snap.js...");
      await loadSnapJs();

      const payAmount = (order.total || 0) - (order.paidAmount || 0);
      console.log(`💳 [TRACKING-PAY] Creating payment intent for order ${order.id}, amount: ${payAmount}`);

      const intentResponse = await fetchWithRetry(`${API_BASE}/create-payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          total: payAmount,
          items: order.items,
          phone: order.phone,
          customerName: user?.name || "Customer",
          existingOrderId: order.id,
        }),
      });

      const intentData = await intentResponse.json();
      console.log("💳 [TRACKING-PAY] Payment intent response:", intentData);

      if (!intentResponse.ok || !intentData.snapToken) {
        console.error("❌ [TRACKING-PAY] Failed to create payment intent:", intentData);
        toast.error("Failed to set up payment. Please try again.");
        setPayingNow(false);
        return;
      }

      setPayingNow(false);

      // Open Snap popup
      const snapResult = await openSnapPayment(intentData.snapToken);
      console.log("💳 [TRACKING-PAY] Snap result:", snapResult);

      if (snapResult.status === "success" || snapResult.status === "pending") {
        // Confirm payment on server
        try {
          console.log("💳 [TRACKING-PAY] Confirming payment on server...");
          await fetchWithRetry(`${API_BASE}/confirm-payment-frontend`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              transactionData: snapResult.result || {},
            }),
          });
        } catch (e) {
          console.error("⚠️ [TRACKING-PAY] Confirm call failed (webhook will handle):", e);
        }

        toast.success(
          snapResult.status === "success"
            ? "Payment successful! Your order is now paid."
            : "Payment is being processed. We'll update shortly."
        );

        // Refresh order to reflect new payment status
        await fetchOrder();
      } else if (snapResult.status === "error") {
        toast.error("Payment failed. Please try again.");
      } else {
        toast.warning("Payment cancelled.");
      }
    } catch (error) {
      console.error("❌ [TRACKING-PAY] Payment flow error:", error);
      toast.error("Payment setup failed. Please try again.");
    } finally {
      setPayingNow(false);
    }
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
    
    const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
    
    if (order.status === 'closed' && effectivePS === 'paid') {
      return {
        message: `✅ You earned ${pointsAmount} points`,
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
        message: `⏳ You will earn ${pointsAmount} points once fully paid`,
        color: BRAND
      };
    }
    
    return {
        message: `💡 You will earn ${pointsAmount} points when order is delivered and paid`,
        color: "#666"
    };
  };

  const getAllStatuses = () => {
    if (!order) return [];
    
    // If order is scheduled, show scheduled step first
    if (order.status === 'scheduled') {
      return [
        { key: 'scheduled', label: 'Scheduled' },
        { key: 'pending', label: 'Order Created' },
        { key: 'confirmed', label: 'Confirmed' },
      ];
    }
    
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
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">{getShortOrderId(order.orderNumber || order.id)}</h2>
            <span className="font-semibold">Your Order ID:</span> {order.orderNumber || `${APP_CONFIG.orders.prefix}${order.id.substring(0, 8).toUpperCase()}`}
            {order.createdByAdmin && (
              <div className="mt-2">
                <span className="inline-block text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                  This order was placed by our restaurant on your behalf
                </span>
              </div>
            )}
            {order.lastModifiedAt && (
              <div className="mt-2">
                <span className="inline-block text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                  Order modified by {order.lastModifiedBy || 'Admin'} on {new Date(order.lastModifiedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>

          {/* Current Order Status & Payment Status */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Order Status */}
            <div className="rounded-xl p-3 text-center"
              style={{
                backgroundColor: '#00AA9912',
                border: '1px solid #00AA9925',
              }}
            >
              <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 mb-1">Order Status</div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1"
                style={{ backgroundColor: '#00AA99' }}
              >
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div className="text-sm font-bold capitalize" style={{ color: '#00AA99' }}>
                {getAllStatuses().find(s => s.key === order.status)?.label || order.status.replace(/_/g, ' ')}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#00AA99', opacity: 0.8 }}>
                {statusConfig[order.status]?.description || ''}
              </div>
            </div>

            {/* Payment Status */}
            {(() => {
              const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
              const remaining = (order.total || 0) - (order.paidAmount || 0);
              const statusColor = ps === 'paid' ? '#00AA99' : ps === 'partial' ? '#E89700' : '#E74C3C';
              const label = ps === 'paid' ? 'Paid' : ps === 'partial' ? 'Partial' : 'Unpaid';
              const subtitle = ps === 'paid' ? 'Payment confirmed' : ps === 'partial' ? `Rp ${(order.paidAmount || 0).toLocaleString()} of Rp ${order.total.toLocaleString()}` : 'Awaiting payment';
              const StatusIcon = ps === 'paid' ? CheckCircle2 : ps === 'partial' ? DollarSign : AlertCircle;

              return (
                <div className="rounded-xl p-3 text-center"
                  style={{
                    backgroundColor: `${statusColor}12`,
                    border: `1px solid ${statusColor}25`,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 mb-1">Payment Status</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1"
                    style={{ backgroundColor: statusColor }}
                  >
                    <StatusIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-sm font-bold capitalize" style={{ color: statusColor }}>
                    {label}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: statusColor, opacity: 0.8 }}>
                    {subtitle}
                  </div>
                  {ps !== 'paid' && (() => {
                    const remainAmt = (order.total || 0) - (order.paidAmount || 0);
                    const isRemaining = ps === 'partial' && (order.paidAmount || 0) > 0 && remainAmt > 0;
                    return (
                      <button
                        onClick={() => setShowPayConfirm(true)}
                        disabled={payingNow}
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                        style={{ backgroundColor: BRAND }}
                      >
                        {payingNow ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CreditCard className="w-3 h-3" />
                        )}
                        {payingNow ? 'Processing...' : isRemaining ? `Pay Remaining Rp ${remainAmt.toLocaleString()}` : 'Pay Now'}
                      </button>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Admin Message to Customer */}
        {order.adminMessage && (
          <div className="bg-white rounded-xl shadow-md p-5 mb-4 border-l-4" style={{ borderLeftColor: BRAND }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${BRAND}15` }}>
                <MessageCircle className="w-4 h-4" style={{ color: BRAND }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Message from Restaurant</p>
                <p className="text-sm text-gray-800 leading-relaxed">
                  <LinkifyText text={order.adminMessage} />
                </p>
                {order.adminMessageAt && (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {new Date(order.adminMessageAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Push Notification Prompt */}
        <PushNotificationPrompt userId={user?.id} accessToken={accessToken} />

        {/* Order Details Card */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: BRAND }} />
            Order Details
          </h3>
          
          <div className="space-y-2 mb-4">
            {order.items.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    {(item as any).name || item.title}
                    {item.category && <span className="text-muted-foreground"> ({item.category})</span>}
                    {(item as any).addedByAdmin && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Added by Admin</span>
                    )}
                    {(item as any).modifiedByAdmin && !(item as any).addedByAdmin && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Modified</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">Qty: {item.quantity}</span>
                </div>
                {(item as any).notes && (
                  <p className="text-xs text-blue-600 italic mt-1 ml-2">Note: {(item as any).notes}</p>
                )}
              </div>
            ))}

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

          <div className="pt-3 border-t mt-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Phone:</span>
              <span className="font-medium">{order.phone}</span>
            </div>
          </div>

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
              const deliveryFeeExplicitlySet = order.statusHistory?.some((h: any) => h.status === 'delivery_fee_set');
              const feeKnown = order.deliveryFee != null && order.deliveryFee >= 0 &&
                (order.deliveryFee > 0 || order.createdByAdmin || order.lastModifiedAt ||
                 deliveryFeeExplicitlySet ||
                 ['ready', 'out_for_delivery', 'delivered', 'closed'].includes(order.status));
              return (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className={
                    order.deliveryFee === 0 ? "text-green-600 font-medium" : ""
                  }>
                    {(order.deliveryFee || 0) === 0 ? "Free" : `Rp ${order.deliveryFee!.toLocaleString()}`}
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
            {/* Remaining Balance after modification */}
            {(() => {
              const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
              const paidAmt = order.paidAmount || 0;
              const remaining = (order.total || 0) - paidAmt;
              if (ps === 'partial' && paidAmt > 0 && remaining > 0 && order.lastModifiedAt) {
                return (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-800">Order Modified — Remaining Balance</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700">Already Paid</span>
                      <span className="text-green-600 font-medium">Rp {paidAmt.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold mt-1">
                      <span className="text-amber-800">Remaining</span>
                      <span className="text-red-600">Rp {remaining.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">
                      Modified by {order.lastModifiedBy || 'Admin'} on {new Date(order.lastModifiedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              }
              return null;
            })()}
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

        {/* Proof of Delivery */}
        {order.proofOfDeliveryUrl && (
          <ProofOfDeliveryCard 
            imageUrl={order.proofOfDeliveryUrl} 
            deliveredAt={order.proofOfDeliveryAt} 
          />
        )}

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

        {/* Order Rating — show for delivered/closed orders */}
        {['delivered', 'closed'].includes(order.status) && (
          <div className="bg-white rounded-xl shadow-md p-5 mt-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                <Star className="w-4 h-4 text-amber-500" />
              </div>
              {order.rating ? 'Your Rating' : 'Rate Your Order'}
            </h3>

            {order.rating ? (
              /* Already rated — show submitted rating */
              <div className="text-center">
                <div className="flex justify-center gap-1.5 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="w-8 h-8"
                      fill={star <= order.rating! ? '#F59E0B' : 'none'}
                      stroke={star <= order.rating! ? '#F59E0B' : '#D1D5DB'}
                    />
                  ))}
                </div>
                <p className="text-sm font-semibold text-amber-600 mb-1">
                  {order.rating === 5 ? 'Excellent!' : order.rating === 4 ? 'Great!' : order.rating === 3 ? 'Good' : order.rating === 2 ? 'Fair' : 'Poor'}
                </p>
                {order.ratingComment && (
                  <p className="text-sm text-gray-600 italic mt-2 bg-gray-50 rounded-lg p-3">
                    "{order.ratingComment}"
                  </p>
                )}
                {order.ratingPhotos && order.ratingPhotos.length > 0 && (
                  <div className="flex justify-center gap-2 mt-3">
                    {order.ratingPhotos.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setRatingPhotoViewUrl(url)}
                        className="w-20 h-20 rounded-lg overflow-hidden border border-amber-200 hover:border-amber-400 transition-colors"
                      >
                        <img src={url} alt={`Review photo ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {order.ratingAt && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    Rated on {new Date(order.ratingAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            ) : (
              /* Not rated yet — show rating form */
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-3">How was your experience?</p>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setRatingHover(star)}
                        onMouseLeave={() => setRatingHover(0)}
                        onClick={() => setRatingValue(star)}
                        className="transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          className="w-10 h-10"
                          fill={star <= (ratingHover || ratingValue) ? '#F59E0B' : 'none'}
                          stroke={star <= (ratingHover || ratingValue) ? '#F59E0B' : '#D1D5DB'}
                        />
                      </button>
                    ))}
                  </div>
                  {ratingValue > 0 && (
                    <p className="text-sm font-medium mt-2" style={{ color: BRAND }}>
                      {ratingValue === 5 ? 'Excellent!' : ratingValue === 4 ? 'Great!' : ratingValue === 3 ? 'Good' : ratingValue === 2 ? 'Fair' : 'Poor'}
                    </p>
                  )}
                </div>
                <Textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Tell us more about your experience (optional)"
                  rows={3}
                  className="text-sm resize-none"
                />
                {/* Photo Upload */}
                <div>
                  <button
                    type="button"
                    onClick={() => ratingPhotoInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 transition-colors text-sm text-gray-500 hover:text-amber-700"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Add Photos (optional, max 3)</span>
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).slice(0, 3);
                      const combined = [...ratingPhotos, ...files].slice(0, 3);
                      setRatingPhotos(combined);
                      setRatingPhotoPreviewUrls(combined.map(file => URL.createObjectURL(file)));
                      if (ratingPhotoInputRef.current) ratingPhotoInputRef.current.value = '';
                    }}
                    className="hidden"
                    ref={ratingPhotoInputRef}
                  />
                </div>
                {ratingPhotoPreviewUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {ratingPhotoPreviewUrls.map((url, index) => (
                      <div key={index} className="relative">
                        <img
                          src={url}
                          alt={`Rating photo ${index + 1}`}
                          className="w-full h-16 object-cover rounded"
                        />
                        <button
                          onClick={() => {
                            const newPhotos = ratingPhotos.filter((_, i) => i !== index);
                            const newPreviews = ratingPhotoPreviewUrls.filter((_, i) => i !== index);
                            setRatingPhotos(newPhotos);
                            setRatingPhotoPreviewUrls(newPreviews);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  onClick={handleSubmitRating}
                  disabled={ratingValue === 0 || submittingRating}
                  className="w-full h-11 text-sm font-semibold text-white"
                  style={{ backgroundColor: ratingValue > 0 ? BRAND : '#9CA3AF' }}
                >
                  {submittingRating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    <><Star className="w-4 h-4 mr-2" /> Submit Rating</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

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

      {/* Payment Confirmation Modal */}
      {/* Rating Photo Fullscreen Viewer */}
      {ratingPhotoViewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setRatingPhotoViewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-2 z-10"
            onClick={() => setRatingPhotoViewUrl(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={ratingPhotoViewUrl}
            alt="Review photo - full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {showPayConfirm && order && (() => {
        const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
        const payAmount = (order.total || 0) - (order.paidAmount || 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPayConfirm(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-3 text-center">
                <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
                  <CreditCard className="w-7 h-7" style={{ color: BRAND }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Payment</h3>
                <p className="text-sm text-gray-500 mt-1">
                  You're about to pay for order <span className="font-semibold">{getShortOrderId(order.orderNumber || order.id)}</span>
                </p>
              </div>

              {/* Payment Details */}
              <div className="mx-5 mb-4 rounded-xl p-3.5" style={{ backgroundColor: '#FFF0F5', border: `1px solid ${BRAND}20` }}>
                <div className="space-y-2">
                  {ps === 'partial' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Order Total</span>
                        <span className="text-gray-700">Rp {order.total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Already Paid</span>
                        <span className="text-green-600 font-medium">- Rp {(order.paidAmount || 0).toLocaleString()}</span>
                      </div>
                      <div className="border-t border-pink-200 my-1" />
                    </>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">
                      {ps === 'partial' ? 'Remaining Amount' : 'Amount to Pay'}
                    </span>
                    <span className="text-lg font-bold" style={{ color: BRAND }}>
                      Rp {payAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment methods info */}
              <div className="mx-5 mb-4">
                <p className="text-[11px] text-gray-400 text-center">
                  Secure payment via Midtrans — GoPay, QRIS, Bank Transfer, Credit Card & more
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 px-5 pb-5">
                <button
                  onClick={() => setShowPayConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMidtransPayNow}
                  disabled={payingNow}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: BRAND }}
                >
                  {payingNow ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {payingNow ? 'Processing...' : 'Pay Now'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}