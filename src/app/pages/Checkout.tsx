import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { UserPlus, ShoppingCart, Check, X } from "lucide-react";

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { cartItems } = useCart();
  const [checkoutMode, setCheckoutMode] = useState<"select" | "guest">("select");

  // Guest form state
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [errors, setErrors] = useState({ name: "", phone: "" });

  // Redirect to home if no cart items
  useEffect(() => {
    if (cartItems.length === 0) {
      navigate("/");
    }
  }, [cartItems.length, navigate]);

  // If already logged in, skip to order
  useEffect(() => {
    if (user && cartItems.length > 0) {
      navigate("/order");
    }
  }, [user, cartItems.length, navigate]);

  if (cartItems.length === 0 || user) {
    return null;
  }

  // Calculate potential points from cart total
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const potentialPoints = Math.floor(cartTotal / 1000);

  const handleGuestCheckout = () => {
    const newErrors = { name: "", phone: "" };

    if (!guestName.trim()) {
      newErrors.name = "Name is required";
    }

    if (!guestPhone.trim()) {
      newErrors.phone = "Phone number is required";
    } else {
      const phoneDigits = guestPhone.replace(/\D/g, "");
      if (phoneDigits.length < 10 || phoneDigits.length > 12) {
        newErrors.phone = "Phone number must be 10-12 digits";
      }
    }

    if (newErrors.name || newErrors.phone) {
      setErrors(newErrors);
      return;
    }

    navigate("/order", {
      state: {
        cartItems: cartItems,
        guestInfo: {
          name: guestName,
          phone: guestPhone,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Checkout" />

      <main className="max-w-md mx-auto px-4 py-6">
        {checkoutMode === "select" ? (
          <div className="space-y-5">
            {/* Cart summary */}
            <div className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" style={{ color: "#D91A60" }} />
              <span className="font-semibold text-gray-800">
                {cartItems.length} {cartItems.length === 1 ? "item" : "items"} in cart
              </span>
            </div>

            {/* ===== Rewards Card ===== */}
            <Card className="overflow-hidden border-0 shadow-md">
              <div
                className="px-4 pt-4 pb-3"
                style={{
                  background: "linear-gradient(135deg, #FFF0F5 0%, #FFE4EC 50%, #FFF5F0 100%)",
                }}
              >
                {/* Header */}
                <div className="text-center mb-2">
                  <span className="inline-block text-sm font-bold text-gray-800">
                    🎁 Get Rewards for This Order 🎁
                  </span>
                </div>

                {/* Points preview with trophy */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-2.5 mb-2.5 border border-pink-100">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">
                      Earn <span className="text-[#D91A60] font-bold">{potentialPoints} Points</span> from this order!
                    </p>
                    <span className="text-xl ml-2">🏆</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-1.5">
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: potentialPoints > 0 ? "40%" : "0%",
                          background: "linear-gradient(90deg, #22C55E, #86EFAC)",
                        }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 text-[8px]"
                        style={{ left: potentialPoints > 0 ? "38%" : "0%" }}
                      >
                        ⭐
                      </div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-500 font-medium">0 Points</span>
                      <span className="text-[10px] font-bold" style={{ color: "#22C55E" }}>
                        +{potentialPoints} Points
                      </span>
                    </div>
                  </div>
                </div>

                {/* Benefits */}
                <div className="space-y-1 mb-3">
                  {[
                    { text: "Earn loyalty points", bold: "on every order" },
                    { text: "Track your orders easily", bold: "" },
                    { text: "Redeem vouchers & discounts", bold: "" },
                    { text: "Get closer to", bold: "free food rewards" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5 text-green-600" />
                      </div>
                      <span className="text-xs text-gray-700">
                        {item.bold ? (
                          <>
                            {item.text} <span className="font-semibold">{item.bold}</span>
                          </>
                        ) : (
                          item.text
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => {
                    // Store redirect destination so signup/login can navigate back after auth
                    localStorage.setItem("authRedirect", "/order");
                    navigate("/signup", { state: { from: "/checkout" } });
                  }}
                  className="w-full h-10 text-sm font-bold rounded-xl shadow-lg text-white"
                  style={{
                    background: "linear-gradient(135deg, #E91E63, #D91A60)",
                  }}
                >
                  Create One-Time PIN to Get Rewards
                </Button>

                {/* Login link */}
                <p className="text-center text-xs text-gray-600 mt-2">
                  Already a member?{" "}
                  <button
                    onClick={() => {
                      // Store redirect destination so signup/login can navigate back after auth
                      localStorage.setItem("authRedirect", "/order");
                      navigate("/login", { state: { from: "/checkout" } });
                    }}
                    className="font-semibold underline underline-offset-2"
                    style={{ color: "#333" }}
                  >
                    Login with PIN
                  </button>
                </p>
              </div>
            </Card>

            {/* ===== Divider with "or Checkout as Guest" ===== */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-gray-300" />
              <span className="text-sm text-gray-500">
                or <span className="font-semibold text-gray-700">Checkout as Guest</span>
              </span>
              <div className="flex-1 h-px bg-gray-300" />
            </div>

            {/* ===== Guest Card ===== */}
            <Card className="p-5 border border-gray-200 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-7 h-7 text-gray-400" />
                </div>
                <div className="flex-1 space-y-2">
                  {[
                    { icon: "check", text: "Quick checkout", color: "green" },
                    { icon: "check", text: "No account needed", color: "green" },
                    { icon: "x", text: "points earned", boldPrefix: "No", color: "red" },
                    { icon: "x", text: "No order history", color: "red" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {item.icon === "check" ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${item.color === "red" ? "text-gray-500" : "text-gray-700"}`}>
                        {item.boldPrefix ? (
                          <>
                            <span className="font-bold text-red-400">{item.boldPrefix}</span> {item.text}
                          </>
                        ) : (
                          item.text
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setCheckoutMode("guest")}
                variant="outline"
                className="w-full mt-4 h-11 rounded-xl font-semibold border-gray-300 text-gray-700"
              >
                Checkout as Guest
              </Button>
            </Card>
          </div>
        ) : checkoutMode === "guest" ? (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Guest Information</h2>
            <p className="text-sm text-gray-600 mb-6">
              We need your contact details to confirm your order via WhatsApp.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="guest-name">Full Name *</Label>
                <Input
                  id="guest-name"
                  type="text"
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setErrors({ ...errors, name: "" });
                  }}
                  placeholder="John Doe"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="guest-phone">Phone Number (WhatsApp) *</Label>
                <Input
                  id="guest-phone"
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => {
                    setGuestPhone(e.target.value);
                    setErrors({ ...errors, phone: "" });
                  }}
                  placeholder="08123456789"
                  className={errors.phone ? "border-red-500" : ""}
                />
                {errors.phone && (
                  <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  10-12 digits for order confirmation
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Guest orders do not earn loyalty points.
                  Create an account to enjoy rewards!
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCheckoutMode("select")}
                  className="flex-1"
                  type="button"
                >
                  Back
                </Button>
                <Button
                  onClick={handleGuestCheckout}
                  className="flex-1"
                  style={{ backgroundColor: "#D91A60" }}
                  type="button"
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </main>
    </div>
  );
}