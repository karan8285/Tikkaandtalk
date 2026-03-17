import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Truck, ShoppingBag, UtensilsCrossed, Phone, MapPin, Clock, CreditCard, Wallet, Ticket } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { formatIDR } from "../lib/currency";
import { loadSnapJs, openSnapPayment } from "../lib/midtrans";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

// No more hardcoded specialOffers — offer data is passed via location.state.offerData

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, accessToken, refreshProfile, loading: authLoading } = useAuth();
  const { cartItems: contextCartItems, clearCart, updateCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState("");
  
  // Payment failure state — shows retry + pay-on-delivery options on this page
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [switchingToCash, setSwitchingToCash] = useState(false);
  
  // Store the order payload so retry/pay-on-delivery can create the real order
  const savedOrderPayloadRef = useRef<any>(null);
  
  // Use STATE for cart items so it triggers re-render when loaded
  const [cartItems, setCartItems] = useState<any[]>([]);
  
  // Use ref to track if validation has already been performed (prevent infinite loop)
  const hasValidatedRef = useRef(false);
  
  // Use ref to track if order has already been placed (prevent duplicate orders)
  const hasPlacedOrderRef = useRef(false);
  
  // CRITICAL: Save location.state to a ref IMMEDIATELY on mount to prevent losing it during re-renders
  const savedLocationStateRef = useRef(location.state);
  
  // Update the ref if location.state changes (but only if it's not null)
  if (location.state && location.state !== savedLocationStateRef.current) {
    savedLocationStateRef.current = location.state;
  }
  
  // Extract state from SAVED ref (not current location.state which can become null)
  const locationState = savedLocationStateRef.current || {};
  let { orderType, address, phone, specialInstructions, offerId, fromCart, cartItems: passedCartItems, guestInfo } = locationState;
  const offerData = locationState.offerData || null; // Dynamic offer data from FlashSale/KidsMenu/TodaysSpecial
  const paymentMethod = locationState.paymentMethod || "pay-later";
  const passedDeliveryFee = locationState.deliveryFee || 0;
  const passedDeliveryZone = locationState.deliveryZone || null;
  const passedDeliveryDistance = locationState.deliveryDistance || null;
  const passedPromoApplied = locationState.promoApplied || null;
  const passedPromoDiscount = locationState.promoDiscount || 0;
  const passedTaxRate = locationState.taxRate ?? 11;
  
  // CRITICAL FIX: If no guestInfo but we have phone and no user, create guestInfo
  if (!guestInfo && phone && !user) {
    console.log("🔧 Creating guestInfo from phone field");
    guestInfo = {
      name: "Guest",
      phone: phone,
    };
  }
  
  // DEBUG: Version timestamp to verify which code is running
  console.log("🔧 OrderConfirmation.tsx - Version: 2024-STABLE-STATE-v7 - Loaded at:", new Date().toISOString());
  console.log("=== ORDER CONFIRMATION COMPONENT RENDER ===");
  console.log("📍 Render Count:", Date.now());
  console.log("👤 user:", user ? { id: user.id, name: user.name, phone: user.phone } : null);
  console.log("📞 phone (extracted):", phone);
  console.log("👥 guestInfo (extracted):", guestInfo);
  console.log("📦 location.state:", JSON.stringify(location.state, null, 2));
  console.log("⏳ authLoading:", authLoading);
  console.log("🛒 fromCart:", fromCart);
  console.log("🎁 offerId:", offerId);
  console.log("✅ hasValidatedRef.current:", hasValidatedRef.current);
  console.log("📋 hasPlacedOrderRef.current:", hasPlacedOrderRef.current);
  console.log("🔄 validating state:", validating);
  console.log("⚡ placing state:", placing);
  
  // Track component lifecycle
  useEffect(() => {
    console.log("🟣 [LIFECYCLE] OrderConfirmation mounted");
    return () => {
      console.log("🟣 [LIFECYCLE] OrderConfirmation unmounting");
    };
  }, []);

  useEffect(() => {
    console.log("🔵 [CART LOAD EFFECT] Running...");
    console.log("🔵 passedCartItems:", passedCartItems?.length || 0);
    console.log("🔵 contextCartItems:", contextCartItems.length);
    
    // Priority: navigation state > context > localStorage
    let loadedItems: any[] = [];
    
    if (passedCartItems && passedCartItems.length > 0) {
      console.log("📥 Loading cart from navigation state:", passedCartItems.length);
      loadedItems = passedCartItems;
    } else if (contextCartItems.length > 0) {
      console.log("📥 Loading cart from context:", contextCartItems.length);
      loadedItems = contextCartItems;
    } else if (typeof window !== 'undefined') {
      try {
        const savedCart = localStorage.getItem("cart");
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log("📥 Loading cart from localStorage:", parsed.length);
            loadedItems = parsed;
            updateCart(parsed);
          }
        }
      } catch (error) {
        console.error("Failed to read cart from localStorage:", error);
      }
    }
    
    console.log("🔵 [CART LOAD EFFECT] Setting cartItems to:", loadedItems.length);
    setCartItems(loadedItems);
  }, [passedCartItems, contextCartItems]);

  useEffect(() => {
    console.log("🟢 [VALIDATION EFFECT] Running...");
    console.log("🟢 Dependencies:", {
      user: user ? user.name : null,
      fromCart,
      offerId,
      cartItemsLength: cartItems.length,
      authLoading,
      locationStateKeys: Object.keys(location.state || {}),
      savedStateKeys: Object.keys(savedLocationStateRef.current || {})
    });
    
    // Wait for auth to finish loading before making decisions
    if (authLoading) {
      console.log("⏳ [VALIDATION EFFECT] Auth loading, waiting...");
      return;
    }

    // Get current values from SAVED location.state (not the potentially null current one)
    const currentState = savedLocationStateRef.current || {};
    const currentGuestInfo = currentState.guestInfo;
    const currentPhone = currentState.phone;
    
    console.log("🟢 [VALIDATION EFFECT] Current values from location.state:");
    console.log("  - currentGuestInfo:", currentGuestInfo);
    console.log("  - currentPhone:", currentPhone);
    console.log("  - user:", user ? user.name : null);

    // Check if we have the required order information
    // We need EITHER: user is logged in OR guestInfo/phone is provided
    if (!user && !currentGuestInfo && !currentPhone) {
      console.log("❌ [VALIDATION EFFECT] No user, no guestInfo, and no phone - REDIRECTING to /cart");
      navigate("/cart", { replace: true });
      return;
    }
    
    // Check if we have order type and address (these come from /order page)
    // If missing, redirect to /order to fill them in
    const currentOrderType = currentState.orderType;
    const currentAddress = currentState.address;
    
    if (!currentOrderType || (currentOrderType === 'delivery' && !currentAddress)) {
      console.log("❌ [VALIDATION EFFECT] Missing orderType or delivery address - REDIRECTING to /order");
      console.log("  - orderType:", currentOrderType);
      console.log("  - address:", currentAddress);
      // Redirect back to order page with whatever state we have
      navigate("/order", { 
        replace: true,
        state: currentState 
      });
      return;
    }
    
    console.log("✅ [VALIDATION EFFECT] User or guest info present, proceeding with order confirmation");
    console.log("  User:", user ? user.name : "Guest");
    console.log("  GuestInfo:", currentGuestInfo);
    
    // Wait for cartItems state to be set before validating
    if (fromCart && cartItems.length === 0) {
      console.log("⏳ [VALIDATION EFFECT] Waiting for cart items to load...");
      return;
    }
    
    if (fromCart) {
      console.log("🔍 [VALIDATION EFFECT] Checking cart for order...");
      console.log("  Cart items from navigation state:", passedCartItems?.length || 0);
      console.log("  Cart items from context:", contextCartItems.length);
      console.log("  Cart items (current state):", cartItems.length);
      
      if (cartItems.length === 0) {
        console.error("❌ [VALIDATION EFFECT] No items found in cart - REDIRECTING to /cart");
        toast.error("No items in order");
        navigate("/cart");
        return;
      }
      
      console.log("✅ [VALIDATION EFFECT] Proceeding with", cartItems.length, "items");
    }
    
    // Only validate once - prevent infinite loop
    if (hasValidatedRef.current) {
      console.log("⏭️ [VALIDATION EFFECT] Validation already performed, skipping...");
      return;
    }
    
    // Validate cart items and order on mount
    if (fromCart && cartItems.length > 0) {
      console.log("🚀 [VALIDATION EFFECT] Starting validation...");
      hasValidatedRef.current = true;
      validateCartAndOrder(cartItems);
    } else if (!fromCart && !offerId) {
      // No valid order data, navigate back
      console.log("❌ [VALIDATION EFFECT] No fromCart and no offerId - REDIRECTING to /cart");
      toast.error("No items in order");
      navigate("/cart");
    } else if (offerId && offerData) {
      // Offer data passed dynamically from FlashSale/KidsMenu/TodaysSpecial
      console.log("✅ [VALIDATION EFFECT] Valid offer from offerData, setting validating=false");
      setValidating(false);
    } else if (offerId && !offerData) {
      console.log("❌ [VALIDATION EFFECT] offerId present but no offerData - REDIRECTING to /");
      toast.error("Invalid offer selected");
      navigate("/");
    } else {
      console.log("✅ [VALIDATION EFFECT] No validation needed, setting validating=false");
      setValidating(false);
    }
    
    console.log("🟢 [VALIDATION EFFECT] Completed");
  }, [user, navigate, fromCart, offerId, cartItems, authLoading]);
  // REMOVED location.state from dependencies to prevent infinite loop
  
  const validateCartAndOrder = async (itemsToValidate = cartItems) => {
    try {
      console.log("=== FRONTEND: Starting cart validation ===");
      console.log("Cart items to validate:", JSON.stringify(itemsToValidate, null, 2));
      
      // Validate cart items (prices and availability)
      const cartResponse = await fetchWithRetry(`${API_BASE}/validate-cart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ items: itemsToValidate }),
      });
      
      console.log("Cart validation response status:", cartResponse.status);
      console.log("Cart validation response ok:", cartResponse.ok);
      
      // Try to get the response body regardless of status
      let responseData;
      const responseText = await cartResponse.text();
      console.log("Cart validation raw response:", responseText);
      
      try {
        responseData = JSON.parse(responseText);
        console.log("Cart validation parsed response:", responseData);
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
      }
      
      if (!cartResponse.ok) {
        const errorMessage = responseData?.error || `Server returned ${cartResponse.status}`;
        console.error("Cart validation failed:", errorMessage);
        console.warn("⚠️  Backend unavailable - proceeding without validation");
        toast.warning("Backend unavailable - you can still review and confirm your order", { duration: 3000 });
        // Don't navigate away - let the user review and confirm
        setValidating(false);
        return;
      }
      
      const cartData = responseData;
      
      // Ensure validatedItems and errors arrays exist
      const validatedItems = cartData.validatedItems || [];
      const errors = cartData.errors || [];
      
      console.log("Validated items:", validatedItems);
      console.log("Validation errors:", errors);
      
      if (cartData.hasErrors || errors.length > 0) {
        toast.error(`Some items are no longer available: ${errors.map(e => e.itemTitle).join(", ")}`);
        // Remove unavailable items from cart
        const validIds = validatedItems.map(i => i.id);
        const updatedCart = itemsToValidate.filter(item => validIds.includes(item.id));
        updateCart(updatedCart);
        navigate("/cart");
        return;
      }
      
      // Check if any prices changed
      const priceChanges = validatedItems.filter(i => i.priceChanged);
      if (priceChanges.length > 0) {
        const changedItems = priceChanges.map(i => 
          `${i.title}: was ${formatIDR(i.oldPrice)}, now ${formatIDR(i.price)}`
        ).join("; ");
        toast.warning(`Prices have changed: ${changedItems}`, { duration: 5000 });
        
        // Update cart with new prices
        const updatedCart = itemsToValidate.map(cartItem => {
          const updated = validatedItems.find(v => v.id === cartItem.id);
          return updated ? { ...cartItem, price: updated.price } : cartItem;
        });
        updateCart(updatedCart);
      }
    } catch (error) {
      console.error("Cart validation exception:", error);
      console.error("Error stack:", error.stack);
      console.warn("⚠️  Backend connection failed - proceeding without validation (demo mode)");
      toast.warning("Backend unavailable - you can still review and confirm your order", { duration: 3000 });
      // Don't navigate away - let the user review and confirm
      setValidating(false);
    } finally {
      setValidating(false);
    }
  };

  const handlePlaceOrder = async () => {
    console.log("🔴 [PLACE ORDER] Button clicked!");
    console.log("🔴 hasPlacedOrderRef.current:", hasPlacedOrderRef.current);
    
    // Prevent duplicate order placement
    if (hasPlacedOrderRef.current) {
      console.log("⏭️ [PLACE ORDER] Order already placed, skipping...");
      return;
    }
    
    // Check if user is logged in (skip for guest orders)
    if (!user && !guestInfo && !phone) {
      console.log("❌ [PLACE ORDER] No user/guest info - REDIRECTING to /checkout");
      toast.error("Please sign in or continue as guest to place an order");
      hasPlacedOrderRef.current = false;
      navigate("/checkout");
      return;
    }

    hasPlacedOrderRef.current = true;
    setPlacing(true);
    console.log("🔴 [PLACE ORDER] Starting order placement...");
    console.log("🔴 User:", JSON.stringify(user, null, 2));
    console.log("🔴 GuestInfo:", guestInfo);
    console.log("🔴 Phone:", phone);
    console.log("🔴 Access Token:", accessToken);
    console.log("🔴 Is Admin?", user?.isAdmin);
    console.log("🔴 Token length:", accessToken?.length);

    try {
      // ✅ CHECK RESTAURANT STATUS BEFORE PLACING ORDER
      console.log("🔍 Checking restaurant status...");
      const statusResponse = await fetchWithRetry(`${API_BASE}/restaurant-status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log("Restaurant status:", statusData);
        
        if (!statusData.acceptingOrders || !statusData.isOpen) {
          const reason = statusData.reason || "Restaurant is not accepting orders at this time";
          console.log("❌ Restaurant not accepting orders:", reason);
          toast.error(reason, { duration: 5000 });
          hasPlacedOrderRef.current = false;
          setPlacing(false);
          return;
        }
        
        console.log("✅ Restaurant is accepting orders");
      } else {
        console.warn("⚠️ Could not check restaurant status, proceeding anyway");
      }
      // Calculate order details
      let items, subtotal, orderTitle;
      
      if (fromCart && cartItems.length > 0) {
        items = cartItems;
        subtotal = cartItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
        orderTitle = cartItems.length > 1 
          ? `${cartItems[0].title} and ${cartItems.length - 1} more item${cartItems.length > 2 ? 's' : ''}`
          : cartItems[0].title;
      } else if (offerId && offerData) {
        items = [{ 
          ...offerData, 
          price: offerData.discountedPrice || offerData.price,
          quantity: 1 
        }];
        subtotal = offerData.discountedPrice || offerData.price;
        orderTitle = offerData.title;
      }

      // Apply promo discount
      const promoDisc = Math.min(passedPromoDiscount, subtotal);
      const discountedSubtotal = subtotal - promoDisc;
      const tax = discountedSubtotal * (passedTaxRate / 100);
      const rawDeliveryFee = orderType === "delivery" ? passedDeliveryFee : 0;
      const deliveryFee = passedPromoApplied?.freeDelivery ? 0 : rawDeliveryFee;
      const total = discountedSubtotal + tax + deliveryFee;

      const orderPayload = {
        userId: user?.id || null, // null for guest orders
        ...(guestInfo && {
          guestName: guestInfo.name,
          guestPhone: guestInfo.phone,
        }),
        itemTitle: orderTitle,
        itemPrice: subtotal,
        deliveryMethod: orderType,
        phone: phone,
        address: orderType === "delivery" ? address : undefined,
        specialInstructions: specialInstructions,
        // Pass payment method so server knows this is a pay-now order
        paymentMethod: paymentMethod === "pay-now" ? "midtrans" : "cash",
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        taxRate: passedTaxRate,
        deliveryFee: parseFloat(deliveryFee.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        items: items.map(item => ({
          id: item.id,
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          category: item.category,
          originalPrice: item.originalPrice,
          discountPercentage: item.discountPercentage
        })),
        ...(passedPromoApplied && {
          promoCode: passedPromoApplied.code,
          promoDiscount: promoDisc,
          promoVoucherTitle: passedPromoApplied.voucherTitle,
          promoUserVoucherId: passedPromoApplied.userVoucherId,
        }),
      };

      console.log("Order Payload:", JSON.stringify(orderPayload, null, 2));
      console.log("API URL:", `${API_BASE}/orders`);

      // ===== PAY NOW FLOW: Get Snap token FIRST, only create order AFTER payment succeeds =====
      // This ensures NO order is ever created if payment fails/cancels.
      if (paymentMethod === "pay-now") {
        console.log("💳 [PAY-NOW] Payment-first flow — NO order created yet");
        
        // Save payload for retry/pay-on-delivery handlers
        savedOrderPayloadRef.current = orderPayload;
        
        try {
          await loadSnapJs();
          
          // Get Snap token WITHOUT creating an order
          console.log("💳 [PAY-NOW] Creating payment intent (no order yet)...");
          const intentResponse = await fetchWithRetry(`${API_BASE}/create-payment-intent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              total: orderPayload.total,
              items: orderPayload.items,
              guestName: orderPayload.guestName,
              guestPhone: orderPayload.guestPhone,
              phone: orderPayload.phone,
              customerName: user?.name,
            }),
          });
          
          const intentData = await intentResponse.json();
          console.log("💳 [PAY-NOW] Payment intent response:", intentData);
          
          if (!intentResponse.ok || !intentData.snapToken) {
            console.error("❌ [PAY-NOW] Failed to create payment intent:", intentData);
            setPaymentFailed(true);
            setPlacing(false);
            hasPlacedOrderRef.current = false;
            toast.error("Failed to set up payment. You can retry or switch to Pay on Delivery.");
            return;
          }
          
          setPlacing(false);
          
          // Open Snap popup
          const snapResult = await openSnapPayment(intentData.snapToken);
          console.log("💳 [PAY-NOW] Snap result:", snapResult);
          
          if (snapResult.status === "success" || snapResult.status === "pending") {
            // ✅ Payment succeeded/pending — NOW create the real order
            console.log("💳 [PAY-NOW] Payment OK — creating real order now...");
            setPlacing(true);
            
            const createPayload = {
              ...orderPayload,
              paymentMethod: "midtrans",
              // Tell server this is already paid
              paymentReceived: snapResult.status === "success",
              midtransTransactionData: snapResult.result || {},
            };
            
            const response = await fetchWithRetry(`${API_BASE}/orders`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify(createPayload),
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.order?.id) {
              console.error("❌ [PAY-NOW] Order creation after payment failed:", data);
              toast.error("Payment was successful but order creation failed. Please contact support.");
              hasPlacedOrderRef.current = false;
              setPlacing(false);
              return;
            }
            
            const orderId = data.order.id;
            console.log("✅ [PAY-NOW] Order created:", orderId);
            
            // If payment was success (not just pending), confirm it on server
            if (snapResult.status === "success") {
              try {
                await fetchWithRetry(`${API_BASE}/confirm-payment-frontend`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${publicAnonKey}`,
                  },
                  body: JSON.stringify({
                    orderId,
                    transactionData: snapResult.result || {},
                  }),
                });
              } catch (e) {
                console.error("⚠️ [PAY-NOW] Confirm failed (webhook will handle):", e);
              }
            }
            
            // Mark promo voucher as used (pay-now flow)
            if (passedPromoApplied?.userVoucherId && accessToken) {
              try {
                await fetchWithRetry(`${API_BASE}/use-voucher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${publicAnonKey}`,
                    "X-Custom-Auth": accessToken,
                  },
                  body: JSON.stringify({ userVoucherId: passedPromoApplied.userVoucherId }),
                });
              } catch (e) { console.error("⚠️ Failed to mark voucher as used:", e); }
            }

            // Finalize (clear cart, guest session, etc.)
            if (guestInfo && typeof window !== 'undefined') {
              localStorage.setItem('guestOrderSession', JSON.stringify({
                orderId, phone: guestInfo.phone, name: guestInfo.name,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
              }));
            }
            if (accessToken) { try { await refreshProfile(); } catch(e) {} }
            try { await clearCart(); } catch(e) {}
            
            toast.success(snapResult.status === "success" 
              ? "Payment successful! Your order is confirmed." 
              : "Payment is being processed. We'll update you shortly.");
            navigate(`/order-success/${orderId}`);
            return;
          } else {
            // ❌ Payment failed or closed — NO ORDER WAS CREATED. Nothing to clean up.
            console.log("💳 [PAY-NOW] Payment not completed:", snapResult.status, "— no order was created");
            setPaymentFailed(true);
            hasPlacedOrderRef.current = false;
            if (snapResult.status === "error") {
              toast.error("Payment failed. You can retry or switch to Pay on Delivery.");
            } else {
              toast.warning("Payment cancelled. You can retry or switch to Pay on Delivery.");
            }
            return;
          }
          
        } catch (paymentError) {
          console.error("❌ [PAY-NOW] Payment flow error:", paymentError);
          setPaymentFailed(true);
          setPlacing(false);
          hasPlacedOrderRef.current = false;
          toast.error("Payment setup failed. You can retry or switch to Pay on Delivery.");
          return;
        }
      }

      // ===== PAY LATER FLOW: Create order normally =====
      const response = await fetchWithRetry(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(orderPayload),
      });

      console.log("Backend response status:", response.status);
      console.log("Backend response ok:", response.ok);
      
      const responseText = await response.text();
      console.log("Backend raw response:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        throw new Error(`Server returned non-JSON response: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        console.error("❌ Order creation failed");
        console.error("Error data:", JSON.stringify(data, null, 2));
        
        const errorMsg = data.details 
          ? `${data.error}: ${data.details} (Code: ${data.code || 'unknown'})`
          : data.error || "Failed to place order";
        
        toast.error(errorMsg);
        setError(`Order failed: ${errorMsg}`);
        hasPlacedOrderRef.current = false;
        setPlacing(false);
        return;
      }

      console.log("✅ Order created successfully");
      console.log("Order data:", JSON.stringify(data, null, 2));
      console.log("data.order:", data.order);
      console.log("Full data object:", data);
      console.log("data.success:", data.success);
      
      // The backend returns { success: true, order: {...} }
      // So we need to access data.order
      const orderData = data.order;
      
      if (!orderData) {
        console.error("❌ No order data in response!");
        console.error("Response was:", data);
        toast.error("Order created but no order data returned");
        hasPlacedOrderRef.current = false;
        setPlacing(false);
        return;
      }
      
      console.log("✅ Order data extracted successfully:", orderData);
      console.log("Order ID from orderData.id:", orderData.id);
      console.log("Type of orderData.id:", typeof orderData.id);
      console.log("Order object keys:", Object.keys(orderData));
      
      if (!orderData.id) {
        console.error("❌ No order ID in order data!");
        console.error("Order data structure:", orderData);
        toast.error("Order created but no order ID found");
        hasPlacedOrderRef.current = false;
        setPlacing(false);
        return;
      }
      
      console.log("🎉 Order created. Payment method:", paymentMethod);
      console.log("Order ID:", orderData.id);

      // ===== Helper: finalize order (clear cart, refresh profile, store guest session) =====
      // Only call this AFTER payment succeeds or for pay-later orders.
      // For pay-now: if payment fails, we DON'T finalize — the draft order gets deleted.
      const finalizeOrder = async () => {
        // Store guest order session
        if (guestInfo && typeof window !== 'undefined') {
          const guestOrderSession = {
            orderId: orderData.id,
            phone: guestInfo.phone,
            name: guestInfo.name,
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
          };
          localStorage.setItem('guestOrderSession', JSON.stringify(guestOrderSession));
        }
        // Refresh profile
        if (accessToken) {
          try { await refreshProfile(); } catch (e) { console.error("⚠️ Profile refresh failed:", e); }
        }
        // Clear cart
        try { await clearCart(); } catch (e) { console.error("⚠️ Cart clear failed:", e); }
      };
      
      // ===== Mark promo voucher as used =====
      if (passedPromoApplied?.userVoucherId && accessToken) {
        try {
          await fetchWithRetry(`${API_BASE}/use-voucher`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
              "X-Custom-Auth": accessToken,
            },
            body: JSON.stringify({ userVoucherId: passedPromoApplied.userVoucherId }),
          });
          console.log("✅ Promo voucher marked as used");
        } catch (e) {
          console.error("⚠️ Failed to mark voucher as used:", e);
        }
      }

      // ===== PAY LATER FLOW: finalize immediately =====
      await finalizeOrder();
      toast.success("Order placed successfully!");
      console.log("🚀 Navigating to order-success with ID:", orderData.id);
      navigate(`/order-success/${orderData.id}`);
      console.log("✅ navigate() called successfully");
    } catch (error) {
      console.error("❌ Order placement failed:", error);
      console.error("Error details:", error?.message);
      console.error("Error stack:", error?.stack);
      
      toast.error(error?.message || "Failed to place order. Please try again.", {
        duration: 5000,
      });
      hasPlacedOrderRef.current = false;
    } finally {
      setPlacing(false);
    }
  };

  // Retry payment for failed Pay Now orders
  const handleRetryPayment = async () => {
    if (retryingPayment || !savedOrderPayloadRef.current) return;
    setRetryingPayment(true);
    
    try {
      const payload = savedOrderPayloadRef.current;
      console.log("💳 [RETRY] Retrying payment (no order exists yet)...");
      await loadSnapJs();
      
      // Get a new Snap token (no order in KV)
      const intentResponse = await fetchWithRetry(`${API_BASE}/create-payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          total: payload.total,
          items: payload.items,
          guestName: payload.guestName,
          guestPhone: payload.guestPhone,
          phone: payload.phone,
          customerName: user?.name,
        }),
      });
      
      const intentData = await intentResponse.json();
      console.log("💳 [RETRY] Payment intent response:", intentData);
      
      if (!intentResponse.ok || !intentData.snapToken) {
        toast.error("Failed to create payment. Please try again.");
        setRetryingPayment(false);
        return;
      }
      
      setRetryingPayment(false);
      
      const snapResult = await openSnapPayment(intentData.snapToken);
      console.log("💳 [RETRY] Snap result:", snapResult);
      
      if (snapResult.status === "success" || snapResult.status === "pending") {
        // ✅ Payment OK — NOW create the real order
        console.log("💳 [RETRY] Payment OK — creating real order...");
        setPlacing(true);
        
        const createPayload = {
          ...payload,
          paymentMethod: "midtrans",
          paymentReceived: snapResult.status === "success",
          midtransTransactionData: snapResult.result || {},
        };
        
        const response = await fetchWithRetry(`${API_BASE}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(createPayload),
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.order?.id) {
          toast.error("Payment was successful but order creation failed. Please contact support.");
          setPlacing(false);
          return;
        }
        
        const orderId = data.order.id;
        
        // Confirm payment on server
        if (snapResult.status === "success") {
          try {
            await fetchWithRetry(`${API_BASE}/confirm-payment-frontend`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({ orderId, transactionData: snapResult.result || {} }),
            });
          } catch (e) { console.error("⚠️ [RETRY] Confirm failed:", e); }
        }
        
        // Finalize
        if (guestInfo && typeof window !== 'undefined') {
          localStorage.setItem('guestOrderSession', JSON.stringify({
            orderId, phone: guestInfo.phone, name: guestInfo.name,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          }));
        }
        if (accessToken) { try { await refreshProfile(); } catch(e) {} }
        try { await clearCart(); } catch(e) {}
        
        toast.success(snapResult.status === "success"
          ? "Payment successful! Your order is confirmed."
          : "Payment is being processed.");
        navigate(`/order-success/${orderId}`);
      } else {
        toast.error("Payment not completed. Try again or switch to Pay on Delivery.");
      }
    } catch (err) {
      console.error("❌ [RETRY] Error:", err);
      toast.error("Payment failed. Please try again.");
      setRetryingPayment(false);
      setPlacing(false);
    }
  };
  
  // Switch to cash/pay-on-delivery — create order normally with cash payment
  const handleSwitchToCash = async () => {
    if (switchingToCash || !savedOrderPayloadRef.current) return;
    setSwitchingToCash(true);
    
    try {
      const payload = savedOrderPayloadRef.current;
      console.log("💰 [SWITCH] Creating order with cash payment...");
      
      const createPayload = {
        ...payload,
        paymentMethod: "cash",
      };
      
      const response = await fetchWithRetry(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(createPayload),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.order?.id) {
        toast.error("Failed to place order. Please try again.");
        setSwitchingToCash(false);
        return;
      }
      
      const orderId = data.order.id;
      
      // Finalize
      if (guestInfo && typeof window !== 'undefined') {
        localStorage.setItem('guestOrderSession', JSON.stringify({
          orderId, phone: guestInfo.phone, name: guestInfo.name,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }));
      }
      if (accessToken) { try { await refreshProfile(); } catch(e) {} }
      try { await clearCart(); } catch(e) {}
      
      toast.success("Order placed! Pay on " + (orderType === "pickup" ? "pickup" : "delivery") + ".");
      navigate(`/order-success/${orderId}`);
    } catch (err) {
      console.error("❌ [SWITCH] Error:", err);
      toast.error("Failed to place order. Please try again.");
      setSwitchingToCash(false);
    }
  };

  // Check user/guest info for initial render
  const hasUserOrGuest = user || guestInfo || phone;
  
  console.log("🟡 [RENDER CHECK] hasUserOrGuest:", hasUserOrGuest);
  console.log("🟡 [RENDER CHECK] validating:", validating);
  console.log("🟡 [RENDER CHECK] placing:", placing);
  
  if (!hasUserOrGuest || validating) {
    console.log("🟡 [RENDER CHECK] Showing loading screen:", validating ? "Validating" : "Processing");
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Confirmation" />
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">
            {validating ? "Validating your order..." : "Processing your order..."}
          </p>
        </div>
      </div>
    );
  }
  
  // Show loading state while placing order
  if (placing) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Order Confirmation" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">
              {paymentMethod === "pay-now" ? "Preparing payment..." : "Placing your order..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show payment failed state with retry + pay-on-delivery options
  if (paymentFailed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Payment Failed" />
        <main className="max-w-md mx-auto px-4 py-6">
          {/* Failure Icon */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Payment Not Completed</h1>
            <p className="text-sm text-muted-foreground mt-1">
              No order has been created yet. Choose how you'd like to proceed:
            </p>
          </div>
          
          <div className="space-y-3">
            {/* Retry Payment */}
            <Button
              onClick={handleRetryPayment}
              disabled={retryingPayment || switchingToCash}
              className="w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 text-sm"
              style={{ backgroundColor: APP_CONFIG.brand.primaryColor }}
            >
              {retryingPayment ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Preparing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Retry Online Payment
                </>
              )}
            </Button>
            
            {/* Switch to Pay on Delivery */}
            <Button
              onClick={handleSwitchToCash}
              disabled={retryingPayment || switchingToCash}
              variant="outline"
              className="w-full h-12 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm border-2"
            >
              {switchingToCash ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Switching...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Pay on {orderType === "pickup" ? "Pickup" : "Delivery"} Instead
                </>
              )}
            </Button>
          </div>
          
          <p className="text-xs text-center text-muted-foreground mt-4">
            Choosing "Pay on {orderType === "pickup" ? "Pickup" : "Delivery"}" means you'll pay with cash when you receive your order.
          </p>
        </main>
      </div>
    );
  }

  // Calculate order details for rendering
  let items, subtotal, orderTitle;
  
  if (fromCart && cartItems.length > 0) {
    // Order from cart
    items = cartItems;
    subtotal = cartItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
    orderTitle = cartItems.length > 1 
      ? `${cartItems[0].title} and ${cartItems.length - 1} more item${cartItems.length > 2 ? 's' : ''}`
      : cartItems[0].title;
  } else if (offerId && offerData) {
    // Order from single offer (dynamic data from FlashSale/KidsMenu/TodaysSpecial)
    items = [{ 
      ...offerData, 
      price: offerData.discountedPrice || offerData.price,
      quantity: 1 
    }];
    subtotal = offerData.discountedPrice || offerData.price;
    orderTitle = offerData.title;
  } else {
    // Will be handled by useEffect
    return null;
  }

  // Apply promo discount for display
  const renderPromoDisc = Math.min(passedPromoDiscount, subtotal);
  const renderDiscountedSubtotal = subtotal - renderPromoDisc;
  const tax = renderDiscountedSubtotal * (passedTaxRate / 100); // Admin-defined PPN tax
  const renderRawDeliveryFee = orderType === "delivery" ? passedDeliveryFee : 0;
  const deliveryFee = passedPromoApplied?.freeDelivery ? 0 : renderRawDeliveryFee;
  const total = renderDiscountedSubtotal + tax + deliveryFee;

  const getOrderTypeIcon = () => {
    switch (orderType) {
      case "delivery":
        return Truck;
      case "dine-in":
        return UtensilsCrossed;
      default:
        return ShoppingBag;
    }
  };

  const OrderIcon = getOrderTypeIcon();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Order Confirmation" />
      
      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Order Type + Payment Method */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <OrderIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Order Type</p>
                <p className="font-semibold capitalize">{orderType}</p>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              paymentMethod === "pay-now" 
                ? "bg-blue-100 text-blue-700" 
                : "bg-gray-100 text-gray-600"
            }`}>
              {paymentMethod === "pay-now" ? (
                <><CreditCard className="w-3.5 h-3.5" /> Pay Now</>
              ) : (
                <><Wallet className="w-3.5 h-3.5" /> Pay Later</>
              )}
            </div>
          </div>
        </div>

        {/* Order Details */}
        <div className="bg-white rounded-xl shadow-md p-5 space-y-4">
          <h3 className="font-semibold">Order Details</h3>
          
          {items.map((item, index) => (
            <div key={index} className="flex gap-3">
              <img
                src={item.image}
                alt={item.title}
                className="w-20 h-20 rounded-lg object-cover"
              />
              <div className="flex-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                <p className="text-primary font-semibold mt-1">
                  {formatIDR(item.price || 0)}
                </p>
              </div>
            </div>
          ))}

          {specialInstructions && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Special Instructions</p>
                <p className="text-sm text-muted-foreground">{specialInstructions}</p>
              </div>
            </>
          )}
        </div>

        {/* Contact & Delivery Info */}
        <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
          <h3 className="font-semibold">Contact Information</h3>
          
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{phone || "+1 (555) 000-0000"}</p>
            </div>
          </div>

          {orderType === "delivery" && address && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Delivery Address</p>
                <p className="font-medium">{address}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Estimated Time</p>
              <p className="font-medium">
                {orderType === "delivery" ? "30-40 minutes" : orderType === "dine-in" ? "Reserve for today" : "15-20 minutes"}
              </p>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
          <h3 className="font-semibold">Order Summary</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatIDR(subtotal)}</span>
            </div>
            {renderPromoDisc > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600 flex items-center gap-1">
                  <Ticket className="w-3 h-3" />
                  Promo ({passedPromoApplied?.code})
                </span>
                <span className="text-green-600 font-medium">-{formatIDR(renderPromoDisc)}</span>
              </div>
            )}
            {passedPromoApplied?.freeDelivery && orderType === "delivery" && renderRawDeliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600 flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  Free Delivery
                </span>
                <span className="text-green-600 font-medium">-{formatIDR(renderRawDeliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({passedTaxRate}%)</span>
              <span>{formatIDR(tax)}</span>
            </div>
            {orderType === "delivery" && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className={`font-medium ${passedPromoApplied?.freeDelivery ? "line-through text-muted-foreground" : ""}`}>
                    {formatIDR(renderRawDeliveryFee)}
                  </span>
                </div>
                {passedDeliveryZone && (
                  <p className="text-[10px] text-green-600 -mt-1">
                    Zone: {passedDeliveryZone.name} &middot; {passedDeliveryDistance?.toFixed(1)} km
                  </p>
                )}
              </>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatIDR(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment Info Banner (Pay Now) */}
        {paymentMethod === "pay-now" && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Online Payment</span>
            </div>
            <p className="text-[11px] text-blue-600">
              After confirming, a secure payment popup will open. Your order will be auto-confirmed once payment is complete.
            </p>
          </div>
        )}

        {/* Confirm Button */}
        <Button
          onClick={handlePlaceOrder}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 flex items-center justify-center gap-2"
          disabled={placing}
        >
          {paymentMethod === "pay-now" ? (
            <>
              <CreditCard className="w-5 h-5" />
              {placing ? "Processing..." : "Place Order & Pay"}
            </>
          ) : (
            placing ? "Placing Order..." : "Confirm Order"
          )}
        </Button>
      </main>
    </div>
  );
}