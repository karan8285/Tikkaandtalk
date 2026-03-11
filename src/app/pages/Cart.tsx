import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { ShoppingCart, Plus, Minus, Trash2 } from "lucide-react";
import { formatIDR } from "../lib/currency";

export default function Cart() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { cartItems, removeFromCart, updateQuantity, totalItems, totalPrice } = useCart();

  // Remove login requirement - allow guest checkout
  if (loading) {
    return null;
  }

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    
    // If user is logged in, go directly to order page
    // Otherwise, go to checkout page for login/guest selection
    if (user) {
      navigate("/order", {
        state: {
          cartItems: cartItems,
        },
      });
    } else {
      navigate("/checkout");
    }
  };

  const deliveryFee = 0; // Will be calculated based on location
  const tax = totalPrice * 0.10; // 10% PPN
  const finalTotal = totalPrice + deliveryFee + tax;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="My Cart" />

      <main className="max-w-md mx-auto px-4 py-6 pb-32">
        {cartItems.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 sm:p-12 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">
              Add items from our special offers to get started!
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-primary hover:bg-primary/90"
            >
              Browse Menu
            </Button>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="space-y-4 mb-6">
              {cartItems.map((item) => {
                const itemKey = item.cartItemKey || `${item.id}-${item.category || 'regular'}`;
                return (
                  <div
                    key={itemKey}
                    className="bg-white rounded-xl shadow-md p-4"
                  >
                    <div className="flex gap-4">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">
                          {item.title} {item.category && <span className="text-sm text-muted-foreground">({item.category})</span>}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mb-3">
                          {item.originalPrice > item.price && (
                            <span className="text-sm line-through text-muted-foreground">
                              {formatIDR(item.originalPrice || 0)}
                            </span>
                          )}
                          <span className="text-lg font-semibold text-primary">
                            {formatIDR(item.price || 0)}
                          </span>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                              className="h-8 w-8 p-0"
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-8 text-center font-semibold">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                              className="h-8 w-8 p-0"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromCart(itemKey)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h3 className="font-semibold mb-4">Order Summary</h3>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items ({totalItems})</span>
                  <span className="font-medium">{formatIDR(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className="font-medium text-muted-foreground italic">To be Calculated</span>
                </div>
                <p className="text-[10px] text-amber-600 -mt-1">Delivery fee (if applicable) will be set by the restaurant</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (PPN 10%)</span>
                  <span className="font-medium">
                    {formatIDR(tax)}
                  </span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold text-primary text-lg">
                      {formatIDR(finalTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Bottom Checkout Bar */}
      {cartItems.length > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-40">
          <div className="max-w-md mx-auto">
            <Button
              onClick={handleCheckout}
              className="w-full bg-primary hover:bg-primary/90 h-12 text-base font-semibold"
            >
              Proceed to Checkout • {formatIDR(finalTotal)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}