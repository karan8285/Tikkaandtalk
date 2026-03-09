import { projectId, publicAnonKey } from "/utils/supabase/info";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { toast } from "sonner";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Truck, ShoppingBag, UtensilsCrossed, Phone, MapPin, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

const specialOffers = [
  {
    id: 1,
    title: "Chicken Tikka Masala",
    originalPrice: 285000,
    discountedPrice: 210000,
    image: "https://images.unsplash.com/photo-1652545296821-09a023a9fd08?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0aWtrYSUyMG1hc2FsYSUyMGluZGlhbiUyMGZvb2R8ZW58MXx8fHwxNzcyMTA0ODgwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 2,
    title: "Butter Chicken with Rice",
    originalPrice: 255000,
    discountedPrice: 180000,
    image: "https://images.unsplash.com/photo-1707448829764-9474458021ed?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXR0ZXIlMjBjaGlja2VuJTIwY3VycnklMjByaWNlfGVufDF8fHx8MTc3MjEwNDg4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 3,
    title: "Samosa Platter",
    originalPrice: 135000,
    discountedPrice: 90000,
    image: "https://images.unsplash.com/photo-1697155836252-d7f969108b5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzYW1vc2ElMjBpbmRpYW4lMjBhcHBldGl6ZXJ8ZW58MXx8fHwxNzcyMDYxMTIyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
];

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, accessToken, refreshProfile, loading: authLoading } = useAuth();
  const { cartItems: contextCartItems, clearCart, updateCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState("");
  
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
    } else if (offerId) {
      // Check if offer exists
      const selectedOffer = specialOffers.find(offer => offer.id === offerId);
      if (!selectedOffer) {
        console.log("❌ [VALIDATION EFFECT] Invalid offer - REDIRECTING to /");
        toast.error("Invalid offer selected");
        navigate("/");
      } else {
        console.log("✅ [VALIDATION EFFECT] Valid offer, setting validating=false");
        setValidating(false);
      }
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
      const cartResponse = await fetch(`${API_BASE}/validate-cart`, {
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
      const statusResponse = await fetch(`${API_BASE}/restaurant-status`, {
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
      } else if (offerId) {
        const selectedOffer = specialOffers.find(offer => offer.id === offerId);
        if (selectedOffer) {
          items = [{ 
            ...selectedOffer, 
            price: selectedOffer.discountedPrice,
            quantity: 1 
          }];
          subtotal = selectedOffer.discountedPrice;
          orderTitle = selectedOffer.title;
        }
      }

      const tax = subtotal * 0.10;
      const deliveryFee = 0; // Will be calculated based on location
      const total = subtotal + tax + deliveryFee;

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
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
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
        }))
      };

      console.log("Order Payload:", JSON.stringify(orderPayload, null, 2));
      console.log("API URL:", `${API_BASE}/orders`);

      const response = await fetch(`${API_BASE}/orders`, {
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
      
      // ✅ Store guest order session for tracking (if guest order)
      if (guestInfo && typeof window !== 'undefined') {
        console.log("💾 Storing guest order session...");
        const guestOrderSession = {
          orderId: orderData.id,
          phone: guestInfo.phone,
          name: guestInfo.name,
          expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
        };
        localStorage.setItem('guestOrderSession', JSON.stringify(guestOrderSession));
        console.log("✅ Guest order session stored:", guestOrderSession);
      }
      
      console.log("📦 About to refresh profile and clear cart...");
      
      // Refresh profile and clear cart with error handling
      // Only refresh profile for logged-in users
      if (accessToken) {
        try {
          console.log("🔄 Refreshing profile...");
          await refreshProfile();
          console.log("✅ Profile refreshed");
        } catch (error) {
          console.error("⚠️ Profile refresh failed:", error);
          // Continue anyway
        }
      } else {
        console.log("ℹ️ Skipping profile refresh (guest order)");
      }
      
      try {
        console.log("🗑️ Clearing cart...");
        await clearCart();
        console.log("✅ Cart cleared");
      } catch (error) {
        console.error("⚠️ Cart clear failed:", error);
        // Continue anyway
      }
      
      console.log("🎉 About to navigate to order-success");
      console.log("Order ID:", orderData.id);
      
      toast.success("Order placed successfully!");
      
      // Navigate with order ID in URL - more reliable than location.state
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
          <p className="text-muted-foreground">Placing your order...</p>
        </div>
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
  } else if (offerId) {
    // Order from single offer
    const selectedOffer = specialOffers.find(offer => offer.id === offerId);
    if (selectedOffer) {
      // Transform offer to match expected item structure
      items = [{ 
        ...selectedOffer, 
        price: selectedOffer.discountedPrice, // Use discountedPrice as price
        quantity: 1 
      }];
      subtotal = selectedOffer.discountedPrice;
      orderTitle = selectedOffer.title;
    } else {
      // Will be handled by useEffect
      return null;
    }
  } else {
    // Will be handled by useEffect
    return null;
  }

  const tax = subtotal * 0.10; // 10% PPN tax
  const deliveryFee = 0; // Will be calculated based on location
  const total = subtotal + tax + deliveryFee;

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
        {/* Order Type */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <OrderIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Order Type</p>
              <p className="font-semibold capitalize">{orderType}</p>
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax (10%)</span>
              <span>{formatIDR(tax)}</span>
            </div>
            {orderType === "delivery" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span className="text-muted-foreground italic">To be Calculated</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatIDR(total)}</span>
            </div>
          </div>
        </div>

        {/* Confirm Button */}
        <Button
          onClick={handlePlaceOrder}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12"
          disabled={placing}
        >
          {placing ? "Placing Order..." : "Confirm Order"}
        </Button>
      </main>
    </div>
  );
}