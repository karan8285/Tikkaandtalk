import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Textarea } from "../components/ui/textarea";
import { ShoppingBag, Truck } from "lucide-react";
import { formatIDR } from "../lib/currency";
import { projectId, publicAnonKey } from "/utils/supabase/info";

type OrderType = "pickup" | "delivery";

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { cartItems } = useCart();
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(""); // Guest name field
  const [specialInstructions, setSpecialInstructions] = useState("");
  
  // Get guest info from navigation state if present
  const guestInfo = location.state?.guestInfo;
  
  console.log("🔧 Order.tsx - VERSION: 2024-ORDER-PAGE-v1 - Loaded at:", new Date().toISOString());
  console.log("=== ORDER PAGE COMPONENT RENDER ===");
  console.log("user:", user);
  console.log("guestInfo:", guestInfo);
  console.log("location.state:", location.state);
  console.log("cartItems:", cartItems);
  
  useEffect(() => {
    // Auto-fill phone number and name from logged-in user or guest info
    if (guestInfo?.phone) {
      setPhone(guestInfo.phone);
      if (guestInfo?.name) {
        setName(guestInfo.name);
      }
    } else if (user?.phone) {
      setPhone(user.phone);
      if (user?.name) {
        setName(user.name);
      }
    }
  }, [user, guestInfo]);

  useEffect(() => {
    // Fetch user's previous orders to prefill delivery address
    const fetchPreviousAddress = async () => {
      if (!user?.id) return;

      try {
        console.log("📍 Fetching previous orders to prefill address for user:", user.id);
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb/orders?userId=${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const orders = data.orders || [];
          console.log("📦 Fetched orders:", orders.length);
          
          // Find the most recent delivery order with an address
          const deliveryOrders = orders
            .filter((order: any) => {
              const hasDelivery = order.orderType === "delivery" || order.deliveryMethod === "delivery";
              const hasAddress = order.address && order.address.trim().length > 0;
              console.log("Order:", order.id, "hasDelivery:", hasDelivery, "hasAddress:", hasAddress, "address:", order.address);
              return hasDelivery && hasAddress;
            })
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          console.log("📍 Found", deliveryOrders.length, "delivery orders with addresses");

          if (deliveryOrders.length > 0) {
            const lastDeliveryAddress = deliveryOrders[0].address;
            console.log("✅ Prefilling delivery address from previous order:", lastDeliveryAddress);
            setAddress(lastDeliveryAddress);
          } else {
            console.log("ℹ️ No previous delivery orders found with addresses");
          }
        } else {
          console.error("Failed to fetch orders:", response.status, response.statusText);
        }
      } catch (error) {
        console.error("❌ Failed to fetch previous orders:", error);
      }
    };

    fetchPreviousAddress();
  }, [user]);

  useEffect(() => {
    // Redirect to cart if no items and no offerId (but wait for initial load)
    const timer = setTimeout(() => {
      console.log("🔍 Checking cart for order...");
      console.log("Cart items:", cartItems.length);
      
      if (cartItems.length === 0 && !location.state?.offerId) {
        console.log("❌ No items in cart, redirecting back to cart page");
        navigate("/cart");
      } else {
        console.log("✅ Proceeding with", cartItems.length, "items");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("=== ORDER PAGE: handleSubmit called ===");
    console.log("orderType:", orderType);
    console.log("phone:", phone);
    console.log("address:", address);
    console.log("guestInfo:", guestInfo);
    console.log("user:", user);
    console.log("cartItems:", cartItems);
    
    // Validate form
    if (!user && !name.trim()) {
      alert("Please enter your name");
      return;
    }
    
    if (!phone) {
      alert("Please enter your phone number");
      return;
    }
    
    if (orderType === "delivery" && !address) {
      alert("Please enter your delivery address");
      return;
    }
    
    // If user is not logged in, create or update guestInfo from the form
    let effectiveGuestInfo = guestInfo;
    if (!user) {
      console.log("⚠️ Guest order - creating/updating guestInfo from form fields");
      effectiveGuestInfo = {
        name: name.trim() || guestInfo?.name || "Guest", // Use form name, or existing name, or "Guest" as fallback
        phone: phone,
      };
      console.log("Guest info:", effectiveGuestInfo);
    }
    
    // Navigate directly to confirmation page (no WhatsApp here)
    console.log("🚀 About to navigate to /order-confirmation");
    console.log("State being passed:", {
      orderType,
      address,
      phone,
      specialInstructions,
      offerId: location.state?.offerId,
      fromCart: !location.state?.offerId,
      cartItems: cartItems,
      guestInfo: effectiveGuestInfo,
    });
    
    navigate("/order-confirmation", {
      state: {
        orderType,
        address,
        phone,
        specialInstructions,
        offerId: location.state?.offerId,
        fromCart: !location.state?.offerId,
        cartItems: cartItems,
        guestInfo: effectiveGuestInfo, // Pass guest info to confirmation
      },
    });
    
    console.log("✅ navigate() called successfully");
  };

  const orderTypes = [
    {
      value: "delivery" as OrderType,
      label: "Delivery",
      icon: Truck,
      description: "Deliver to your address",
    },
    {
      value: "pickup" as OrderType,
      label: "Pickup",
      icon: ShoppingBag,
      description: "Pick up from restaurant",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Place Order" />
      
      <main className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Type Selection */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <Label className="mb-4 block">Select Order Type</Label>
            <RadioGroup value={orderType} onValueChange={(value) => setOrderType(value as OrderType)}>
              <div className="space-y-3">
                {orderTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <div key={type.value} className="flex items-center">
                      <RadioGroupItem
                        value={type.value}
                        id={type.value}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={type.value}
                        className="flex items-center gap-3 w-full p-4 rounded-lg border-2 border-border cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{type.label}</div>
                          <div className="text-sm text-muted-foreground">
                            {type.description}
                          </div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </RadioGroup>
          </div>

          {/* Contact & Address Information */}
          <div className="bg-white rounded-xl shadow-md p-5 space-y-4">
            <h3 className="font-semibold">Contact Information</h3>
            
            {/* Show name field for guest users */}
            {!user && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  required
                  className="bg-input-background"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g., 081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={12}
                required
                className="bg-input-background"
              />
            </div>

            {orderType === "pickup" && (
              <div className="space-y-2">
                <Label htmlFor="pickup-address">Pickup Address</Label>
                <div className="p-3 bg-gray-50 border border-border rounded-lg">
                  <p className="text-sm font-medium text-foreground">Tikka N Talk - AN INDIAN KITCHEN</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940
                  </p>
                </div>
              </div>
            )}

            {orderType === "delivery" && (
              <div className="space-y-2">
                <Label htmlFor="address">Delivery Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter your complete delivery address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  className="bg-input-background resize-none"
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="instructions">Special Instructions (Optional)</Label>
              <Textarea
                id="instructions"
                placeholder="Any special requests or dietary requirements?"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="bg-input-background resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12"
          >
            Continue to Confirmation
          </Button>
        </form>
      </main>
    </div>
  );
}