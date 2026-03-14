import { useNavigate } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { GuestAccountCreationDialog } from "../components/GuestAccountCreationDialog";
import { formatIDR } from "../lib/currency";
import { getWhatsAppNumber, getWhatsAppDisplay, getWhatsAppLink } from "../lib/whatsapp";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  Phone,
  MapPin,
  MessageCircle,
  AlertCircle,
  Home,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  XCircle,
  Ticket,
} from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getShortOrderId } from "../lib/orderUtils";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

// Receipt icon component
const Receipt = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
  </svg>
);

// Status flow definition
const STATUS_FLOW = [
  { key: "pending", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cooking", label: "Cooking" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_FLOW_DELIVERY = [
  { key: "pending", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cooking", label: "Cooking" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "On the Way" },
  { key: "delivered", label: "Delivered" },
];

// Status hero config — big animated display
const statusHeroConfig: Record<string, {
  emoji: string;
  title: string;
  subtitle: string;
  bgGradient: string;
  pulseColor: string;
}> = {
  pending: {
    emoji: "⏱️",
    title: "Waiting for Confirmation",
    subtitle: "The restaurant will confirm your order shortly",
    bgGradient: "from-amber-50 to-yellow-50",
    pulseColor: "bg-amber-400",
  },
  confirmed: {
    emoji: "✅",
    title: "Order Confirmed!",
    subtitle: "The kitchen has accepted your order",
    bgGradient: "from-teal-50 to-emerald-50",
    pulseColor: "bg-teal-400",
  },
  cooking: {
    emoji: "🍳",
    title: "Your Food is Being Prepared!",
    subtitle: "Our chefs are working on your delicious meal",
    bgGradient: "from-orange-50 to-amber-50",
    pulseColor: "bg-orange-400",
  },
  ready: {
    emoji: "📦",
    title: "Ready for Pickup!",
    subtitle: "Head to the restaurant — your food is waiting",
    bgGradient: "from-purple-50 to-violet-50",
    pulseColor: "bg-purple-400",
  },
  "ready-delivery": {
    emoji: "📦",
    title: "Ready for Delivery!",
    subtitle: "Your food is packed and waiting for the rider",
    bgGradient: "from-purple-50 to-violet-50",
    pulseColor: "bg-purple-400",
  },
  "out_for_delivery": {
    emoji: "🚗",
    title: "On the Way!",
    subtitle: "Your order is being delivered to you",
    bgGradient: "from-indigo-50 to-blue-50",
    pulseColor: "bg-indigo-400",
  },
  delivered: {
    emoji: "🎉",
    title: "Order Delivered!",
    subtitle: "Enjoy your meal — thank you for ordering!",
    bgGradient: "from-green-50 to-emerald-50",
    pulseColor: "bg-green-400",
  },
  cancelled: {
    emoji: "❌",
    title: "Order Cancelled",
    subtitle: "This order has been cancelled",
    bgGradient: "from-red-50 to-rose-50",
    pulseColor: "bg-red-400",
  },
  closed: {
    emoji: "✅",
    title: "Order Closed",
    subtitle: "This order has been completed and closed — thank you!",
    bgGradient: "from-gray-50 to-slate-50",
    pulseColor: "bg-gray-400",
  },
};

// Estimated time per status
const getEstimatedTime = (status: string, deliveryMethod: string): string | null => {
  if (deliveryMethod === "pickup") {
    switch (status) {
      case "pending": return "30–40 min";
      case "confirmed": return "25–35 min";
      case "cooking": return "15–25 min";
      case "ready": return "Pick up now!";
      case "delivered": return null;
      case "cancelled": return null;
      default: return null;
    }
  } else {
    switch (status) {
      case "pending": return "45–60 min";
      case "confirmed": return "35–50 min";
      case "cooking": return "25–35 min";
      case "ready": return "15–20 min";
      case "out_for_delivery": return "5–15 min";
      case "delivered": return null;
      case "cancelled": return null;
      default: return null;
    }
  }
};

export default function GuestOrderTracking() {
  const navigate = useNavigate();
  const { user, signUp, refreshProfile } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guestSession, setGuestSession] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dialog if user logs in
  useEffect(() => {
    if (user && showAccountDialog) {
      setShowAccountDialog(false);
    }
  }, [user, showAccountDialog]);

  // Live "seconds ago" ticker
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [lastUpdated]);

  // Load guest session
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const sessionStr = localStorage.getItem("guestOrderSession");
      if (!sessionStr) {
        setError("No active guest order session. Please log in to track your order.");
        setLoading(false);
        return;
      }
      const session = JSON.parse(sessionStr);
      if (session.expiresAt < Date.now()) {
        localStorage.removeItem("guestOrderSession");
        setError("Your guest session has expired. Please log in to track your order.");
        setLoading(false);
        return;
      }
      setGuestSession(session);
    } catch (err) {
      console.error("Error loading guest session:", err);
      setError("Failed to load guest session");
      setLoading(false);
    }
  }, []);

  // Fetch order data
  const fetchOrder = useCallback(async (showToast = false) => {
    if (!guestSession) return;
    try {
      if (showToast) setRefreshing(true);
      const url = `${API_BASE}/orders/${guestSession.orderId}?userId=guest`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to fetch order:", errorData);
        setError(errorData.error || "Failed to load order");
        setLoading(false);
        return;
      }
      const data = await response.json();
      setOrder(data.order);
      setLastUpdated(new Date());
      setSecondsAgo(0);
      setLoading(false);
      if (showToast) toast.success("Status refreshed!");
    } catch (err) {
      console.error("Error fetching order:", err);
      setError("Failed to load order details");
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, [guestSession]);

  // Initial fetch
  useEffect(() => {
    if (guestSession) fetchOrder();
  }, [guestSession, fetchOrder]);

  // Polling every 15 seconds — stop for terminal statuses
  useEffect(() => {
    if (!guestSession || loading || error) return;
    if (order && (order.status === "cancelled" || order.status === "closed" || order.status === "delivered")) return;
    pollingIntervalRef.current = setInterval(() => fetchOrder(), 15000);
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [guestSession, loading, error, fetchOrder, order?.status]);

  const handleRefresh = () => fetchOrder(true);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Track Order" />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Loading order details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Track Order" />
        <div className="flex items-center justify-center p-4" style={{ minHeight: "70vh" }}>
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-lg font-bold mb-2">Cannot Track Order</h1>
            <p className="text-sm text-muted-foreground mb-4">{error || "Order not found"}</p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/login")} className="w-full bg-primary hover:bg-primary/90">
                Log In to Track Orders
              </Button>
              <Button variant="outline" onClick={() => window.open(`https://wa.me/${getWhatsAppNumber()}`, "_blank")} className="w-full">
                Contact via WhatsApp
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const orderNumber = order.orderNumber || `${order.id.slice(0, 8).toUpperCase()}`;
  const isDelivery = order.deliveryMethod === "delivery";
  const potentialPoints = Math.floor(order.total / 1000);
  const isGuestOrder = !order.userId;

  // Get hero config
  const heroKey = order.status === "ready" && isDelivery ? "ready-delivery" : order.status;
  const hero = statusHeroConfig[heroKey] || statusHeroConfig.pending;

  // Status flow
  const hasOutForDelivery = order.status === "out_for_delivery";
  const isTerminalStatus = order.status === "cancelled" || order.status === "closed";
  const flow = order.status === "cancelled"
    ? [{ key: "pending", label: "Order Placed" }, { key: "cancelled", label: "Cancelled" }]
    : order.status === "closed"
    ? [{ key: "closed", label: "Order Closed" }]
    : (isDelivery || hasOutForDelivery) ? STATUS_FLOW_DELIVERY : STATUS_FLOW;

  const statusOrder = flow.map((s) => s.key);
  const currentIdx = Math.max(0, statusOrder.indexOf(order.status));

  const isStepCompleted = (stepKey: string) => {
    const stepIdx = statusOrder.indexOf(stepKey);
    return stepIdx < currentIdx;
  };
  const isStepCurrent = (stepKey: string) => order.status === stepKey;

  const estimatedTime = getEstimatedTime(order.status, order.deliveryMethod);

  // Contextual action
  const getContextualAction = () => {
    if (order.status === "pending") {
      return {
        message: "Haven't confirmed yet? Send a WhatsApp message now!",
        action: () => window.open(whatsappLink, "_blank"),
        icon: <MessageCircle className="w-4 h-4" />,
        label: "Confirm on WhatsApp",
        color: "bg-green-500 hover:bg-green-600 text-white",
      };
    }
    if (order.status === "ready" && !isDelivery) {
      return {
        message: "Your food is ready — head to the restaurant!",
        action: null,
        icon: <Package className="w-4 h-4" />,
        label: "Pick up now",
        color: "bg-purple-500 text-white",
      };
    }
    if (order.status === "delivered") {
      return {
        message: "Enjoy your meal! Create an account to earn points on future orders.",
        action: null,
        icon: null,
        label: null,
        color: "",
      };
    }
    return null;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // WhatsApp
  const generateWhatsAppMessage = () => {
    const items = order.items
      .map((item: any) => `${item.quantity}x ${item.name || item.title}`)
      .join(", ");
    const message =
      `Hi! I have a question about my order:\\n\\n` +
      `Order #${orderNumber}\\n` +
      `Status: ${hero.title}\\n` +
      `Type: ${isDelivery ? "Delivery" : "Pickup"}\\n` +
      `Items: ${items}\\n\\n` +
      `[Your question here]`;
    return encodeURIComponent(message);
  };
  const whatsappLink = `https://wa.me/${getWhatsAppNumber()}?text=${generateWhatsAppMessage()}`;

  const contextualAction = getContextualAction();

  // Handle account creation for guest
  const handleAccountCreated = async () => {
    console.log("Account created from guest tracking page");
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (refreshProfile) await refreshProfile();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const accessToken = localStorage.getItem("accessToken");
    const userData = localStorage.getItem("user");
    const userName = userData ? JSON.parse(userData).name : "there";

    if (accessToken && order?.id) {
      try {
        toast.loading("Linking your order to your account...", { id: "link-order" });
        const response = await fetch(`${API_BASE}/link-guest-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken,
          },
          body: JSON.stringify({ orderId: order.id }),
        });
        toast.dismiss("link-order");
        if (response.ok) {
          const linkData = await response.json();
          const pts = linkData.pointsAwarded || 0;
          const pointsMsg = pts > 0 ? ` You earned ${pts} points! 🎉` : "";
          toast.success(`Welcome ${userName}! Your order is now linked.${pointsMsg}`, { duration: 5000 });
          // Refresh order
          const newUserData = localStorage.getItem("user");
          const newUserId = newUserData ? JSON.parse(newUserData).id : null;
          if (newUserId) {
            const orderResponse = await fetch(`${API_BASE}/orders/${order.id}?userId=${newUserId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (orderResponse.ok) {
              const updatedOrderData = await orderResponse.json();
              setOrder(updatedOrderData.order);
            }
          }
        } else {
          toast.success(`Welcome ${userName}! You're now logged in.`, { duration: 4000 });
        }
      } catch {
        toast.dismiss("link-order");
        toast.success(`Welcome ${userName}! You're now logged in.`, { duration: 4000 });
      }
    } else {
      toast.success(`Welcome ${userName}! You're now logged in.`, { duration: 4000 });
    }
  };

  // Progress percentage
  const progressPercent = isTerminalStatus
    ? 100
    : flow.length <= 1
    ? 100
    : Math.round(((currentIdx) / (flow.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        showBack
        title="Track Order"
        rightContent={
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Refresh order status"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <main className="max-w-md mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full">

        {/* ===== SECTION 1: Order ID + Type Badge ===== */}
        <div className="w-full bg-white rounded-2xl shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
          <div>
            <p className="text-xl font-extrabold text-gray-900 leading-tight">{getShortOrderId(orderNumber)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ID: {orderNumber}</p>
          </div>
          <div className={`px-2.5 py-1 rounded-full font-semibold text-[10px] sm:text-xs ${
            isDelivery ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
          }`}>
            {isDelivery ? (
              <><Truck className="w-3 h-3 inline mr-0.5 -mt-0.5" /> DELIVERY</>
            ) : (
              <><Package className="w-3 h-3 inline mr-0.5 -mt-0.5" /> PICKUP</>
            )}
          </div>
        </div>

        {/* ===== SECTION 2: Animated Status Hero ===== */}
        <div className={`w-full bg-gradient-to-br ${hero.bgGradient} rounded-xl p-4 sm:p-5 mb-3 border border-gray-100`}>
          <div className="flex items-center gap-3 mb-3">
            {/* Pulsing emoji */}
            <div className="relative">
              <div className={`absolute inset-0 ${hero.pulseColor} rounded-full opacity-20 animate-ping`} />
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm flex items-center justify-center relative z-10">
                <span className="text-2xl sm:text-3xl">{hero.emoji}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base sm:text-lg text-gray-900 leading-tight">{hero.title}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{hero.subtitle}</p>
            </div>
          </div>

          {/* ETA + Progress bar */}
          {estimatedTime && (
            <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-gray-700">Est. Time</span>
              </div>
              <span className="text-sm font-bold text-primary">{estimatedTime}</span>
            </div>
          )}

          {/* Contextual Action Banner */}
          {contextualAction && (
            <div className="mt-3 bg-white/60 backdrop-blur-sm rounded-lg p-2.5">
              <p className="text-[11px] text-gray-700 mb-2">{contextualAction.message}</p>
              {contextualAction.action && (
                <button
                  onClick={contextualAction.action}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${contextualAction.color}`}
                >
                  {contextualAction.icon}
                  {contextualAction.label}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== SECTION 3: Visual Progress Timeline — hide for closed orders ===== */}
        {order.status !== "closed" && (
        <div className="w-full bg-white rounded-xl shadow-sm p-4 sm:p-5 mb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              Order Progress
            </h3>
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
              {progressPercent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                order.status === "cancelled" ? "bg-red-500" : "bg-accent"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Timeline steps */}
          <div className="space-y-0">
            {flow.map((step, index) => {
              const completed = isStepCompleted(step.key);
              const current = isStepCurrent(step.key);
              const isCancelled = step.key === "cancelled";
              const isLast = index === flow.length - 1;

              // Find timestamp from statusHistory
              const historyItem = order.statusHistory?.find(
                (h: any) => h.status === step.key
              );

              return (
                <div key={step.key} className="flex gap-3">
                  {/* Dot + Line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isCancelled
                          ? "bg-red-500 text-white"
                          : completed
                          ? "bg-accent text-white"
                          : current
                          ? "bg-accent text-white ring-4 ring-accent/20"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isCancelled ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : completed || current ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-gray-300" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 transition-all ${
                          completed ? "bg-accent h-8" : "bg-gray-200 h-8"
                        }`}
                      />
                    )}
                  </div>

                  {/* Label + Time */}
                  <div className={`flex-1 pb-2 ${!isLast ? "min-h-[3rem]" : ""}`}>
                    <p
                      className={`text-sm font-semibold leading-tight ${
                        completed || current
                          ? "text-gray-900"
                          : "text-gray-400"
                      }`}
                    >
                      {step.label}
                      {current && !isCancelled && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent ml-1.5 animate-pulse align-middle" />
                      )}
                    </p>
                    {(completed || current) && historyItem && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(historyItem.timestamp)}
                      </p>
                    )}
                    {current && !historyItem && step.key === "pending" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(order.createdAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ===== SECTION 4: Last Updated Ticker — hide for terminal statuses ===== */}
        {!isTerminalStatus && (
        <div className="flex items-center justify-center gap-1.5 mb-3 py-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${secondsAgo < 16 ? "bg-green-500" : "bg-amber-500"} animate-pulse`} />
          <p className="text-[10px] text-muted-foreground">
            {secondsAgo < 5
              ? "Just updated"
              : `Updated ${secondsAgo}s ago`}
            {" · "}auto-refreshes every 15s
          </p>
        </div>
        )}

        {/* ===== SECTION 5: WhatsApp Contact ===== */}
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mb-3"
        >
          <div className="w-full bg-green-500 hover:bg-green-600 transition-colors rounded-xl px-3 py-2.5 text-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Questions? Contact Us</p>
                
              </div>
              <ChevronRight className="w-4 h-4 text-white/60 flex-shrink-0" />
            </div>
          </div>
        </a>

        {/* ===== SECTION 6: Order Items — Collapsible ===== */}
        <div className="w-full bg-white rounded-xl shadow-sm mb-3 overflow-hidden">
          <button
            onClick={() => setItemsExpanded(!itemsExpanded)}
            className="w-full px-3 sm:px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">Order Items</span>
              <span className="text-xs text-muted-foreground">
                ({order.items?.length || 0} items)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">{formatIDR(order.total)}</span>
              {itemsExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {itemsExpanded && (
            <div className="px-3 sm:px-4 pb-3 border-t">
              <div className="space-y-2 pt-3 mb-3 pb-3 border-b">
                {order.items?.map((item: any, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name || item.title}
                        className="w-9 h-9 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{item.name || item.title}</p>
                      {item.notes && (
                        <p className="text-[10px] text-blue-600 italic truncate">Note: {item.notes}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="font-semibold text-xs whitespace-nowrap">
                      {formatIDR(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatIDR(order.subtotal)}</span>
                </div>
                {(order.promoDiscount != null && order.promoDiscount > 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600 flex items-center gap-1">
                      <Ticket className="w-3 h-3" />
                      Promo {order.promoCode ? `(${order.promoCode})` : ''}
                    </span>
                    <span className="text-green-600 font-medium">-{formatIDR(order.promoDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax (PPN{order.taxRate ? ` ${order.taxRate}%` : ''})</span>
                  <span>{formatIDR(order.tax)}</span>
                </div>
                {isDelivery && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span className={(order.deliveryFee || 0) > 0 ? "" : "text-amber-600"}>
                      {(order.deliveryFee || 0) > 0 ? `Rp ${order.deliveryFee.toLocaleString()}` : "To be Calculated"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1.5 mt-1 border-t">
                  <span>Total</span>
                  <span className="text-primary">{formatIDR(order.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== SECTION 7: Customer / Delivery Details ===== */}
        <div className="w-full bg-white rounded-xl shadow-sm p-3 sm:p-4 mb-3">
          <h3 className="font-bold text-sm mb-2.5">
            {isDelivery ? "Delivery Details" : "Pickup Details"}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs sm:text-sm">{order.phone}</span>
            </div>
            {isDelivery && order.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm">{order.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs sm:text-sm">{formatDate(order.createdAt)}</span>
            </div>
            {order.specialInstructions && (
              <div className="bg-gray-50 rounded-lg p-2 mt-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">Special Instructions</p>
                <p className="text-xs">{order.specialInstructions}</p>
              </div>
            )}
          </div>
        </div>

        {/* ===== SECTION 8: Cancellation Reason (if cancelled) ===== */}
        {order.status === "cancelled" && order.cancellationReason && (
          <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
            <p className="text-xs font-semibold text-red-900 mb-1">Cancellation Reason</p>
            <p className="text-xs text-red-800">{order.cancellationReason}</p>
            {order.cancelledBy === "admin" && (
              <p className="text-[10px] text-red-600 mt-1">Cancelled by Restaurant</p>
            )}
          </div>
        )}

        {/* ===== SECTION 9: Guest Registration Banner (compact gradient) ===== */}
        {isGuestOrder && !user && (
          <div
            className="w-full relative overflow-hidden rounded-xl mb-3 cursor-pointer hover:shadow-lg transition-all duration-300 group"
            onClick={() => {
              setDialogDismissed(false);
              setShowAccountDialog(true);
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 opacity-95" />
            <div className="relative px-4 py-3 sm:py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm sm:text-base leading-tight">
                    Save your <span className="text-yellow-300">+{potentialPoints} points</span>
                  </p>
                  <p className="text-white/70 text-[10px] sm:text-xs">
                    Set a 6-digit PIN — 10 seconds, no email needed
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/60 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* ===== Navigation ===== */}
        <div className="w-full space-y-2 mb-4">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="w-full h-10 text-sm font-medium"
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </main>

      {/* Support Footer */}
      <div className="bg-white border-t px-3 sm:px-4 py-3">
        <p className="text-center text-xs text-muted-foreground max-w-md mx-auto">
          Need help? WhatsApp us at{" "}
          <a
            href={`https://wa.me/${getWhatsAppNumber()}`}
            className="text-primary font-semibold hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {getWhatsAppDisplay()}
          </a>
        </p>
      </div>

      {/* Guest Account Creation Dialog */}
      {isGuestOrder && order && !user && (
        <GuestAccountCreationDialog
          open={showAccountDialog}
          onOpenChange={(open) => {
            setShowAccountDialog(open);
            if (!open) setDialogDismissed(true);
          }}
          phone={order.phone || order.guestPhone || ""}
          guestName={order.guestName}
          pointsToEarn={potentialPoints}
          onSuccess={handleAccountCreated}
          onSignUp={signUp}
        />
      )}
    </div>
  );
}