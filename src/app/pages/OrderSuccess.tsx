import { useNavigate, useParams } from "react-router";
import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { APP_CONFIG } from "../lib/config";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { GuestAccountCreationDialog } from "../components/GuestAccountCreationDialog";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { getWhatsAppNumber, getWhatsAppDisplay } from "../lib/whatsapp";
import { toast } from "sonner";
import { 
  CheckCircle2, 
  Package, 
  Clock, 
  Phone, 
  MapPin, 
  MessageCircle, 
  Calendar,
  TrendingUp,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  CreditCard,
  RefreshCw,
  Ticket,
} from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { loadSnapJs, openSnapPayment } from "../lib/midtrans";
import { PushNotificationPrompt } from "../components/PushNotificationPrompt";
import { AddToHomeScreen } from "../components/AddToHomeScreen";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

// Receipt icon component (simple replacement)
const Receipt = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
  </svg>
);

export default function OrderSuccess() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user, loading: authLoading, signUp, refreshProfile, accessToken } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryingPayment, setRetryingPayment] = useState(false);
  
  // Close dialog if user logs in
  useEffect(() => {
    if (user && showAccountDialog) {
      setShowAccountDialog(false);
    }
  }, [user, showAccountDialog]);

  // Fetch order data when component mounts
  useEffect(() => {
    const fetchOrder = async () => {
      // Wait for auth to finish loading
      if (authLoading) {
        console.log("OrderSuccess - Waiting for auth to load...");
        return;
      }

      if (!orderId) {
        console.error("OrderSuccess - No order ID in URL");
        setError("No order ID provided");
        setLoading(false);
        return;
      }
      
      console.log("=== OrderSuccess Page ===");
      console.log("Fetching order with ID:", orderId);
      console.log("User ID:", user?.id || "Guest");
      console.log("API_BASE:", API_BASE);
      
      // Retry logic for potential race conditions
      const maxRetries = 3;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Attempt ${attempt}/${maxRetries} to fetch order`);
          
          // For guest orders, fetch directly by order ID without user validation
          const url = user 
            ? `${API_BASE}/orders/${orderId}?userId=${user.id}`
            : `${API_BASE}/orders/${orderId}?userId=guest`;
          
          console.log("Fetch URL:", url);
          
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          });
          
          console.log("Fetch response status:", response.status);
          console.log("Fetch response ok:", response.ok);
          
          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch (e) {
              const text = await response.text();
              console.error("Failed to parse error response:", text);
              errorData = { error: `Server error ${response.status}: ${text.substring(0, 100)}` };
            }
            console.error(`❌ Attempt ${attempt} failed:`, errorData);
            lastError = errorData.error || "Failed to load order";
            
            // If it's a 404, retry after a short delay (might be race condition)
            if (response.status === 404 && attempt < maxRetries) {
              console.log(`⏳ Waiting 500ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
            
            // For other errors, don't retry
            setError(lastError);
            setLoading(false);
            return;
          }
          
          const data = await response.json();
          console.log("✅ Order data fetched successfully:", data);
          console.log("Order data structure:", JSON.stringify(data, null, 2));
          
          if (!data.order) {
            console.error("❌ Response missing 'order' field:", data);
            lastError = "Invalid response from server";
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
            setError(lastError);
            setLoading(false);
            return;
          }
          
          setOrder(data.order);
          setLoading(false);
          return; // Success!
        } catch (err) {
          console.error(`❌ Attempt ${attempt} exception:`, err);
          console.error("Error details:", err?.message);
          console.error("Error stack:", err?.stack);
          lastError = "Failed to load order details";
          
          if (attempt < maxRetries) {
            console.log(`⏳ Waiting 500ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
      }
      
      // All retries failed
      console.error("❌ All retry attempts failed");
      setError(lastError || "Failed to load order details");
      setLoading(false);
    };
    
    fetchOrder();
  }, [orderId, user, authLoading]);
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Success" />
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading order details...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Success" />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Order Data Not Found</h1>
            <p className="text-sm text-muted-foreground mb-4">
              The order was likely placed successfully, but the order details couldn't be displayed.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-blue-900 font-semibold mb-2">What to do next:</p>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                {user && <li>Check your order history</li>}
                <li>Contact us via WhatsApp to confirm your order</li>
              </ol>
            </div>
            <div className="space-y-2">
              {/* Only show "View Order History" for logged-in users */}
              {user && (
                <Button 
                  onClick={() => navigate("/orders")}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  View Order History
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => window.open(`https://wa.me/${getWhatsAppNumber()}`, "_blank")}
                className="w-full"
              >
                Contact via WhatsApp
              </Button>
              <Button 
                variant="ghost"
                onClick={() => navigate("/")}
                className="w-full"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Defensive checks for order data
  if (!order.id || !order.total || !order.items || !Array.isArray(order.items)) {
    console.error("Order data is incomplete:", order);
    console.error("Missing fields:", {
      hasId: !!order.id,
      hasTotal: !!order.total,
      hasItems: !!order.items,
      itemsIsArray: Array.isArray(order.items)
    });
    return (
      <div className="min-h-screen bg-gray-50">
        <Header title="Order Success" />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Incomplete Order Data</h1>
            <p className="text-sm text-muted-foreground mb-4">
              The order data is incomplete. Please contact support.
            </p>
            <div className="space-y-2">
              <Button 
                variant="outline"
                onClick={() => window.open(`https://wa.me/${getWhatsAppNumber()}`, "_blank")}
                className="w-full"
              >
                Contact via WhatsApp
              </Button>
              <Button 
                variant="ghost"
                onClick={() => navigate("/")}
                className="w-full"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  const orderNumber = order.orderNumber || `${order.id.slice(0, 8).toUpperCase()}`;
  const potentialPoints = Math.floor(order.total / 1000);
  const isGuestOrder = !order.userId;
  const isMidtransPayment = order.paymentMethod === "midtrans";
  const isPaid = order.paymentStatus === "paid";
  const isPaymentPending = order.paymentStatus === "pending";
  const isAwaitingPayment = order.paymentStatus === "awaiting_payment";
  const isPaymentFailed = isMidtransPayment && !isPaid && !isPaymentPending && !isAwaitingPayment;

  const handleAccountCreated = async () => {
    console.log("✅ Account created successfully, starting post-signup process...");
    
    // Wait a bit for auth state to propagate
    console.log("⏳ Waiting 800ms for auth state to propagate...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Refresh the profile to get the latest user data with auth token
    if (refreshProfile) {
      console.log("🔄 Refreshing profile...");
      await refreshProfile();
    }
    
    // Wait a bit more to ensure localStorage is updated
    console.log("⏳ Waiting 300ms for localStorage to update...");
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get the fresh access token from localStorage
    const freshAccessToken = localStorage.getItem("accessToken");
    const userData = localStorage.getItem("user");
    const userName = userData ? JSON.parse(userData).name : "there";
    
    console.log(`📊 DEBUG - Pre-link check:`);
    console.log(`  - accessToken exists: ${!!freshAccessToken}`);
    console.log(`  - accessToken (first 50 chars): ${freshAccessToken?.substring(0, 50)}...`);
    console.log(`  - accessToken length: ${freshAccessToken?.length}`);
    console.log(`  - accessToken is valid JWT format: ${freshAccessToken?.split('.').length === 3}`);
    console.log(`  - order exists: ${!!order}`);
    console.log(`  - order.id: ${order?.id}`);
    console.log(`  - Full order object:`, order);
    
    if (freshAccessToken && order?.id) {
      try {
        console.log("🔗 Attempting to link guest order to new user account...");
        console.log(`🔗 Order ID: ${order.id}`);
        console.log(`🔗 Access Token (first 30 chars): ${freshAccessToken.substring(0, 30)}...`);
        console.log(`🔗 API URL: ${API_BASE}/link-guest-order`);
        
        // Show loading toast
        toast.loading("Linking your order to your account...", { id: "link-order" });
        
        // Link the guest order to the newly created user account
        const response = await fetch(`${API_BASE}/link-guest-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": freshAccessToken, // Send custom JWT in X-Custom-Auth header
          },
          body: JSON.stringify({ orderId: order.id }),
        });
        
        console.log(`🔗 Link API response status: ${response.status}`);
        console.log(`🔗 Link API response ok: ${response.ok}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log("✅ Guest order successfully linked to user account:", data);
          
          // Dismiss loading toast
          toast.dismiss("link-order");
          
          // Get the new user ID from localStorage
          const newUserData = localStorage.getItem("user");
          const newUserId = newUserData ? JSON.parse(newUserData).id : null;
          
          console.log(`🔄 Refreshing order data with userId: ${newUserId}`);
          
          // Refresh the order data to show updated userId
          const orderResponse = await fetch(`${API_BASE}/orders/${order.id}?userId=${newUserId}`, {
            headers: {
              Authorization: `Bearer ${freshAccessToken}`,
            },
          });
          
          console.log(`🔄 Order refresh response status: ${orderResponse.status}`);
          
          if (orderResponse.ok) {
            const updatedOrderData = await orderResponse.json();
            setOrder(updatedOrderData.order);
            console.log("✅ Order data refreshed with new user association:", updatedOrderData.order);
          } else {
            console.warn("⚠️ Could not refresh order data, but link was successful");
          }
          
          // Show success toast with points info
          const pts = data.pointsAwarded || 0;
          const pointsMsg = pts > 0 ? ` You earned ${pts} points!` : "";
          toast.success(`🎉 Welcome ${userName}! Your order is linked.${pointsMsg}`, {
            duration: 5000,
          });
        } else {
          const errorData = await response.json();
          console.error("❌ Link API failed:", errorData);
          console.error("❌ Response status:", response.status);
          console.error("❌ Full error data:", JSON.stringify(errorData, null, 2));
          
          // Dismiss loading toast
          toast.dismiss("link-order");
          
          toast.success(`🎉 Welcome ${userName}! You're now logged in.`, {
            duration: 4000,
          });
        }
      } catch (error) {
        console.error("❌ Exception while linking guest order:", error);
        console.error("❌ Error stack:", error?.stack);
        
        // Dismiss loading toast
        toast.dismiss("link-order");
        
        // Don't show error to user - account was created successfully
        toast.success(`🎉 Welcome ${userName}! You're now logged in.`, {
          duration: 4000,
        });
      }
    } else {
      console.warn("⚠️ Skipping order link - missing accessToken or order.id");
      toast.success(`🎉 Welcome ${userName}! You're now logged in.`, {
        duration: 4000,
      });
    }
    
    console.log("✅ Account creation process complete - user is now logged in!");
  };
  
  // Retry payment handler for failed/closed Midtrans payments
  const handleRetryPayment = async () => {
    if (!order?.id || retryingPayment) return;
    
    setRetryingPayment(true);
    try {
      console.log("💳 [RETRY] Loading Snap.js...");
      await loadSnapJs();
      
      // Create a fresh payment token
      console.log("💳 [RETRY] Creating new payment token for order:", order.id);
      const paymentResponse = await fetch(`${API_BASE}/create-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ orderId: order.id }),
      });
      
      const paymentData = await paymentResponse.json();
      console.log("💳 [RETRY] Payment response:", paymentData);
      
      if (!paymentResponse.ok || !paymentData.snapToken) {
        toast.error("Failed to create payment. Please try again or contact us.");
        setRetryingPayment(false);
        return;
      }
      
      setRetryingPayment(false);
      
      // Open Snap popup
      const snapResult = await openSnapPayment(paymentData.snapToken);
      console.log("💳 [RETRY] Snap result:", snapResult);
      
      if (snapResult.status === "success") {
        // Confirm on server immediately (don't wait for webhook)
        try {
          await fetch(`${API_BASE}/confirm-payment-frontend`, {
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
          console.error("⚠️ [RETRY] Confirm failed (webhook will handle):", e);
        }
        toast.success("Payment successful! Your order is confirmed.");
        // Refresh order data to show updated payment status
        setTimeout(() => window.location.reload(), 1500);
      } else if (snapResult.status === "pending") {
        toast.info("Payment is being processed.");
        setTimeout(() => window.location.reload(), 2000);
      } else if (snapResult.status === "error") {
        toast.error("Payment failed. Please try again.");
      } else {
        toast.warning("Payment cancelled.");
      }
    } catch (error) {
      console.error("❌ [RETRY] Error:", error);
      toast.error("Payment failed. Please try again.");
      setRetryingPayment(false);
    }
  };

  // Check for guest order session
  const handleTrackOrder = () => {
    // If this is a guest order (no userId), always go to guest tracking
    if (isGuestOrder) {
      console.log("✅ Guest order detected, navigating to guest tracking");
      navigate(`/guest-order-tracking`);
      return;
    }
    
    // For logged-in users, check if they have a valid guest session for this order
    if (typeof window !== 'undefined') {
      try {
        const guestSessionStr = localStorage.getItem('guestOrderSession');
        if (guestSessionStr) {
          const guestSession = JSON.parse(guestSessionStr);
          // Check if session is still valid and matches current order
          if (guestSession.orderId === order.id && guestSession.expiresAt > Date.now()) {
            console.log("✅ Guest session found, navigating to guest tracking");
            navigate(`/guest-order-tracking`);
            return;
          }
        }
      } catch (error) {
        console.error("Error checking guest session:", error);
      }
    }
    
    // For logged-in users without guest session, navigate to regular order tracking
    navigate(`/orders/${order.id}`);
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // Generate WhatsApp message
  const generateWhatsAppMessage = () => {
    const items = (order.items && Array.isArray(order.items)) 
      ? order.items.map((item: any) => 
          `${item.quantity || 1}x ${item.name || item.title || 'Item'}`
        ).join(', ')
      : 'Items not available';
    
    const message = `Hi! I want to confirm my order:\n\n` +
      `Order #${orderNumber}\n` +
      `Type: ${order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}\n` +
      `Items: ${items}\n` +
      `Total: ${formatIDR(order.total)}\n` +
      (order.deliveryMethod === 'delivery' ? `Address: ${order.address}\n` : '') +
      `Phone: ${order.phone}\n\n` +
      `Please confirm my order. Thank you!`;
    
    return encodeURIComponent(message);
  };
  
  const whatsappLink = `https://wa.me/${getWhatsAppNumber()}?text=${generateWhatsAppMessage()}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header showBack title="Order Confirmation" />
      <main className="max-w-md mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full">
        
        {/* ===== SECTION 1: Success Hero Card ===== */}
        <div className="w-full bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
              isPaid ? 'bg-green-100' : isPaymentPending ? 'bg-yellow-100' : 'bg-accent/10'
            }`}>
              <CheckCircle2 className={`w-6 h-6 sm:w-7 sm:h-7 ${
                isPaid ? 'text-green-600' : isPaymentPending ? 'text-yellow-600' : 'text-accent'
              }`} />
            </div>
            <div className="text-left">
              <h1 className="text-base sm:text-lg font-bold text-gray-900">
                {isPaid ? "Order Confirmed!" : "Order Placed!"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isPaid ? "Payment received — your order is being prepared" : "We've received your order"}
              </p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <div className="text-left">
              <p className="text-xl font-extrabold text-gray-900 leading-tight">{getShortOrderId(orderNumber)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ID: {orderNumber}</p>
            </div>
            <div className={`px-2.5 py-1 rounded-full font-semibold text-[10px] sm:text-xs ${
              order.deliveryMethod === 'pickup' 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-purple-100 text-purple-700'
            }`}>
              <Package className="w-3 h-3 inline mr-0.5 -mt-0.5" />
              {order.deliveryMethod === 'pickup' ? 'PICKUP' : 'DELIVERY'}
            </div>
          </div>
        </div>

        {/* ===== SECTION 2: Payment Status or WhatsApp Confirm ===== */}
        {isMidtransPayment && isPaid ? (
          /* Paid via Midtrans — show success banner instead of WhatsApp */
          <div className="w-full bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm sm:text-base text-green-800">Payment Successful</p>
                <p className="text-[11px] sm:text-xs text-green-600">
                  Paid {formatIDR(order.paidAmount || order.total)} via Midtrans — no manual confirmation needed!
                </p>
              </div>
            </div>
          </div>
        ) : isMidtransPayment && isPaymentPending ? (
          /* Payment pending */
          <div className="w-full bg-yellow-50 border border-yellow-200 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm sm:text-base text-yellow-800">Payment Processing</p>
                <p className="text-[11px] sm:text-xs text-yellow-600">
                  Your payment is being processed. We'll update you shortly.
                </p>
              </div>
            </div>
          </div>
        ) : isPaymentFailed ? (
          /* Payment failed — show retry button */
          <div className="w-full mb-3 sm:mb-4 space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm sm:text-base text-red-800">Payment Incomplete</p>
                  <p className="text-[11px] sm:text-xs text-red-600">
                    Your order has been placed but payment was not completed.
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={handleRetryPayment}
              disabled={retryingPayment}
              className="w-full h-11 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: BRAND }}
            >
              {retryingPayment ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Preparing Payment...</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Retry Payment</>
              )}
            </Button>
          </div>
        ) : (
          /* Pay Later — show WhatsApp confirm (existing) */
          <a 
            href={whatsappLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full mb-3 sm:mb-4"
          >
            <div className="w-full bg-green-500 hover:bg-green-600 transition-colors rounded-xl p-3 sm:p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm sm:text-base">Confirm via WhatsApp</p>
                  <p className="text-[11px] sm:text-xs text-green-100">Pre-filled message — just tap send!</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
              </div>
            </div>
          </a>
        )}

        {/* ===== SECTION 3: Live Status + ETA ===== */}
        <div className="w-full bg-white rounded-xl shadow-sm p-3 sm:p-4 mb-3 sm:mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              Order Status
            </h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
              isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {isPaid ? 'Confirmed' : 'Pending Confirmation'}
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-2.5">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Est. Time</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {order.deliveryMethod === 'pickup' ? '30-40' : '45-60'}
              </p>
              <p className="text-[10px] text-muted-foreground">minutes</p>
            </div>
            <div className="text-center border-x border-gray-200">
              <p className="text-[10px] text-muted-foreground mb-0.5">Payment</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {isPaid ? 'Paid' : isMidtransPayment ? 'Online' : 'Cash'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isPaid ? 'via Midtrans' : isMidtransPayment ? (isPaymentPending ? 'processing' : 'incomplete') : `on ${order.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'}`}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Items</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {order.items ? order.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0}
              </p>
              <p className="text-[10px] text-muted-foreground">ordered</p>
            </div>
          </div>
        </div>

        {/* ===== SECTION 4: What Happens Next — Compact Timeline ===== */}
        {!isPaid && !isPaymentFailed && (
        <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
          <h2 className="font-bold text-blue-900 mb-2 text-xs sm:text-sm">What Happens Next?</h2>
          <div className="space-y-1.5">
            {[
              { step: "1", text: "Send the WhatsApp message above to confirm" },
              { step: "2", text: "Our team reviews & accepts your order" },
              { step: "3", text: "Kitchen prepares your food" },
              { step: "4", text: order.deliveryMethod === 'pickup' ? "Pick up when ready!" : "We deliver to your door!" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold flex-shrink-0">
                  {item.step}
                </div>
                <p className="text-[11px] sm:text-xs text-blue-800">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        )}
        
        {/* ===== SECTION 5: Track Order CTA ===== */}
        <Button
          onClick={handleTrackOrder}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 sm:h-12 text-sm sm:text-base font-semibold mb-3 sm:mb-4 rounded-xl"
        >
          <Clock className="w-4 h-4 mr-2" />
          Track This Order
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1" />
        </Button>

        {/* ===== PUSH NOTIFICATION PROMPT ===== */}
        {/* Add to Home Screen prompt — show before push prompt since it enables push on iOS */}
        <div className="w-full mb-1">
          <AddToHomeScreen variant="card" />
        </div>
        <PushNotificationPrompt userId={user?.id} accessToken={accessToken} />
        
        {/* ===== SECTION 6: Order Summary (collapsible feel) ===== */}
        <div className="w-full bg-white rounded-xl shadow-sm p-3 sm:p-4 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm sm:text-base">Order Summary</h2>
            <span className="ml-auto text-xs text-muted-foreground">{order.items?.length || 0} items</span>
          </div>
          
          {/* Items List */}
          <div className="space-y-2 mb-3 pb-3 border-b">
            {order.items && order.items.length > 0 ? order.items.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-2 sm:gap-3">
                {item.image && (
                  <img 
                    src={item.image} 
                    alt={item.name || item.title}
                    className="w-9 h-9 sm:w-10 sm:h-10 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs sm:text-sm truncate">
                    {item.name || item.title}
                  </p>
                  {item.notes && (
                    <p className="text-[10px] text-blue-600 italic truncate">Note: {item.notes}</p>
                  )}
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="font-semibold text-xs sm:text-sm whitespace-nowrap">{formatIDR(item.price * item.quantity)}</p>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No items in this order</p>
            )}
          </div>

          {/* Price Breakdown */}
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
            {order.deliveryMethod === 'delivery' && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span className={(order.deliveryFee || 0) > 0 ? "" : "text-amber-600"}>
                  {(order.deliveryFee || 0) > 0 ? `Rp ${order.deliveryFee.toLocaleString()}` : "To be Calculated"}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t">
              <span>Total</span>
              <span className="text-primary">{formatIDR(order.total)}</span>
            </div>
          </div>
        </div>

        {/* ===== SECTION 7: Customer / Delivery Details ===== */}
        <div className="w-full bg-white rounded-xl shadow-sm p-3 sm:p-4 mb-3 sm:mb-4">
          <h2 className="font-bold text-sm sm:text-base mb-2.5">
            {order.deliveryMethod === 'pickup' ? 'Pickup Details' : 'Delivery Details'}
          </h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs sm:text-sm">{order.phone}</span>
            </div>
            {order.deliveryMethod === 'delivery' && order.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm">{order.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" />
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

        {/* ===== SECTION 8: Bottom — Points (compact) & Guest Registration (smaller) ===== */}
        
        {/* Points for logged-in users — compact version */}
        {!isGuestOrder && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 sm:mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-900" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-900">Points Pending</p>
                  <p className="text-[10px] text-amber-600">Earned after delivery</p>
                </div>
              </div>
              <p className="text-lg sm:text-xl font-bold text-amber-600">+{potentialPoints}</p>
            </div>
          </div>
        )}

        {/* Guest Registration — compact bottom banner */}
        {isGuestOrder && !user && (
          <div 
            className="w-full relative overflow-hidden rounded-xl mb-3 sm:mb-4 cursor-pointer hover:shadow-lg transition-all duration-300 group"
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

        {/* Navigation buttons */}
        <div className="w-full space-y-2 mb-4">
          {!isGuestOrder && (
            <Button
              variant="outline"
              onClick={() => navigate("/orders")}
              className="w-full h-10 text-sm font-medium"
            >
              View All Orders
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="w-full h-10 text-sm text-muted-foreground"
          >
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

      {/* Guest Account Creation Dialog - only show if user is NOT logged in */}
      {isGuestOrder && order && !user && (
        <GuestAccountCreationDialog
          open={showAccountDialog}
          onOpenChange={(open) => {
            setShowAccountDialog(open);
            // If dialog is being closed, mark it as dismissed so it doesn't reopen
            if (!open) {
              setDialogDismissed(true);
            }
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