import { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { useAuth } from "./auth";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface CartItem {
  id: number;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  discountPercentage?: number;
  image: string;
  quantity: number;
  category?: string; // Flash Sale, Regular Menu, etc.
  cartItemKey?: string; // Unique key for cart item (id + category)
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  setItemQuantity: (item: Omit<CartItem, "quantity">, quantity: number) => void;
  removeFromCart: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  updateCart: (items: CartItem[]) => void;
  clearCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
  syncCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, accessToken, loading: authLoading } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    // Load cart from localStorage on init (will be synced with backend after auth)
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cart");
        if (saved) {
          const parsed = JSON.parse(saved);
          // Validate cart items structure
          if (Array.isArray(parsed)) {
            return parsed.filter(item => 
              item && 
              typeof item.id === 'number' && 
              typeof item.title === 'string' &&
              typeof item.price === 'number' &&
              !isNaN(item.price) &&
              typeof item.quantity === 'number' &&
              !isNaN(item.quantity) &&
              item.quantity > 0
            );
          }
        }
      } catch (error) {
        console.error("Failed to load cart from localStorage:", error);
        localStorage.removeItem("cart"); // Clear corrupted data
      }
    }
    return [];
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [hasInitialFetch, setHasInitialFetch] = useState(false);
  const [loginTime, setLoginTime] = useState<number | null>(null);
  const lastSyncedCartRef = useRef<string>("");

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  // Track when user logs in
  useEffect(() => {
    if (user && accessToken && !loginTime) {
      console.log("🔐 User logged in, recording login time");
      setLoginTime(Date.now());
      // Store login time in sessionStorage for 5 seconds
      sessionStorage.setItem("justLoggedIn", Date.now().toString());
      setTimeout(() => {
        sessionStorage.removeItem("justLoggedIn");
      }, 5000);
    } else if (!user && loginTime) {
      console.log("🚪 User logged out, clearing login time");
      setLoginTime(null);
    }
  }, [user, accessToken]);

  // Fetch cart from backend when user logs in (wait for auth to finish loading)
  useEffect(() => {
    // Only proceed after auth finishes loading
    if (authLoading) {
      console.log("⏳ Auth still loading, waiting...");
      return;
    }

    if (user && accessToken && !isSyncing && !hasInitialFetch) {
      console.log("🔄 User logged in, scheduling cart fetch from backend...");
      console.log("✅ Auth state: user =", user.name, ", token exists =", !!accessToken);
      console.log("🔑 Token preview:", accessToken.substring(0, 30) + "...");
      
      // Wait 2 seconds after login to ensure everything is stable
      const timeSinceLogin = loginTime ? Date.now() - loginTime : 0;
      const waitTime = Math.max(2000 - timeSinceLogin, 0);
      
      console.log(`⏰ Waiting ${waitTime}ms before cart fetch (${timeSinceLogin}ms since login)`);
      
      const timer = setTimeout(() => {
        console.log("✅ Time elapsed, fetching cart now");
        console.log("🔑 Token at fetch time:", accessToken.substring(0, 30) + "...");
        fetchCartFromBackend();
      }, waitTime);
      
      return () => clearTimeout(timer);
    } else if (!user && hasInitialFetch) {
      // User logged out, clear cart and reset flag
      console.log("🚪 User logged out, clearing cart");
      setCartItems([]);
      setHasInitialFetch(false);
    } else if (!user) {
      console.log("👤 No user logged in, using local cart only");
    }
  }, [user, accessToken, authLoading, loginTime]);

  // Fetch cart from backend
  const fetchCartFromBackend = async () => {
    if (!user) {
      console.log("⚠️ No user, skipping cart fetch");
      return;
    }
    
    console.log("🔐 Fetching cart for user:", user.id);
    
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`📡 Cart fetch attempt ${attempt}/${maxRetries}`);
        
        const response = await fetch(
          `${API_BASE}/cart?userId=${user.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${publicAnonKey}`, // Platform validation
              "X-Custom-Auth": accessToken || "", // Our custom JWT
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log("📥 Fetched cart from backend:", data.cart);
          
          // Mark as successfully fetched FIRST
          setHasInitialFetch(true);
          
          // Merge with local cart if there are items in local storage
          const localCart = cartItems;
          if (localCart.length > 0 && data.cart.length === 0) {
            // Local cart has items but backend doesn't - sync local to backend
            console.log("📤 Syncing local cart to backend");
            // Use a direct API call instead of syncCartToBackend to avoid the hasInitialFetch check
            try {
              const syncResponse = await fetch(`${API_BASE}/cart/sync`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${publicAnonKey}`, // Platform validation
                  "X-Custom-Auth": accessToken || "", // Our custom JWT
                },
                body: JSON.stringify({ cart: localCart, userId: user.id }),
              });
              if (syncResponse.ok) {
                console.log("✅ Local cart synced to backend");
              } else {
                const errorText = await syncResponse.text();
                console.error("Failed to sync local cart:", syncResponse.status, errorText);
              }
            } catch (error) {
              console.debug("⚠️ Error syncing local cart (non-critical):", error instanceof Error ? error.message : error);
            }
          } else {
            // Use backend cart as source of truth
            setCartItems(data.cart);
          }
          break; // Exit loop on success
        } else if (response.status === 401) {
          const errorData = await response.json().catch(() => ({}));
          console.error("❌ Cart fetch: 401 Unauthorized");
          console.error("Error response:", errorData);
          
          // TEMPORARILY DISABLED AUTO-LOGOUT - just log the error
          console.warn("⚠️ Cart fetch failed with 401 - but NOT logging out");
          setHasInitialFetch(true);
          break; // Exit loop on 401
        } else {
          const errorText = await response.text();
          console.error("Failed to fetch cart from backend:", response.status);
          console.error("Error response:", errorText);
          setHasInitialFetch(true); // Mark as attempted even if failed
          break; // Exit loop on failure
        }
      } catch (error) {
        console.debug("⚠️ Error fetching cart from backend (will retry):", error instanceof Error ? error.message : error);
        setHasInitialFetch(true); // Mark as attempted even if failed
        if (attempt < maxRetries) {
          console.log("🔄 Retrying cart fetch...");
        }
      }
    }
  };

  // Sync cart to backend
  const syncCartToBackend = async (cart: CartItem[]) => {
    if (!user) {
      console.debug("⚠️ No user, skipping cart sync");
      return;
    }
    
    if (!accessToken) {
      console.debug("⚠️ No access token, skipping cart sync");
      return;
    }
    
    // Don't sync if we just logged in (wait for initial fetch first)
    if (!hasInitialFetch) {
      console.debug("⚠️ Initial fetch not completed yet, skipping cart sync");
      return;
    }
    
    // Check if cart has actually changed since last sync
    const currentCartString = JSON.stringify(cart);
    if (lastSyncedCartRef.current === currentCartString) {
      console.debug("⏭️ Cart unchanged since last sync, skipping");
      return;
    }
    
    try {
      console.log("🔐 Syncing cart for user:", user.id);
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${API_BASE}/cart/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${publicAnonKey}`, // Platform validation
          "X-Custom-Auth": accessToken || "", // Our custom JWT
        },
        body: JSON.stringify({ cart, userId: user.id }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log("✅ Cart synced to backend");
        // Store the synced cart state to avoid redundant syncs
        lastSyncedCartRef.current = currentCartString;
      } else if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ Cart sync: Token expired or invalid");
        console.error("Error details:", errorData);
        
        // TEMPORARILY DISABLED AUTO-LOGOUT - just log the error
        console.warn("⚠️ Cart sync failed with 401 - but NOT logging out");
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error("Failed to sync cart to backend:", response.status);
        console.error("Error response:", errorText);
      }
    } catch (error) {
      // Silently fail - cart sync is not critical for user experience
      // Cart is stored locally, so user won't lose their items
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.debug("⏱️ Cart sync timed out (backend may be slow)");
        } else if (error.message === 'Failed to fetch') {
          console.debug("🌐 Cart sync skipped: Network unavailable or backend unreachable");
        } else {
          console.debug("⚠️ Cart sync skipped:", error.message);
        }
      } else {
        console.debug("⚠️ Cart sync skipped: Unknown error");
      }
    }
  };

  // Sync cart whenever it changes (debounced) - but only after initial fetch
  useEffect(() => {
    if (user && accessToken && !isSyncing && hasInitialFetch) {
      const timer = setTimeout(() => {
        syncCartToBackend(cartItems);
      }, 500); // Debounce 500ms

      return () => clearTimeout(timer);
    }
  }, [cartItems, user, accessToken, isSyncing, hasInitialFetch]);

  const addToCart = (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    // Validate item before adding
    if (!item || typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      console.error("Failed to validate cart item - Invalid or missing price:");
      console.error("Item data:", JSON.stringify(item, null, 2));
      console.error("Price type:", typeof item?.price);
      console.error("Price value:", item?.price);
      return;
    }
    
    const quantityToAdd = item.quantity || 1;
    // Create unique key combining id and category
    const cartItemKey = `${item.id}-${item.category || 'regular'}`;
    
    setCartItems((prev) => {
      const existing = prev.find((i) => {
        const existingKey = `${i.id}-${i.category || 'regular'}`;
        return existingKey === cartItemKey;
      });
      if (existing) {
        // Item exists, add the new quantity to existing quantity
        return prev.map((i) => {
          const existingKey = `${i.id}-${i.category || 'regular'}`;
          return existingKey === cartItemKey ? { ...i, quantity: i.quantity + quantityToAdd, cartItemKey } : i;
        });
      }
      // New item, add with specified quantity
      return [...prev, { ...item, quantity: quantityToAdd, cartItemKey }];
    });
  };

  // Sets the exact quantity for an item (replaces, doesn't add)
  const setItemQuantity = (item: Omit<CartItem, "quantity">, quantity: number) => {
    console.log("🛒 setItemQuantity called with:", {
      item: item,
      quantity: quantity,
      itemKeys: Object.keys(item || {}),
      priceType: typeof item?.price,
      priceValue: item?.price,
      idType: typeof item?.id,
      idValue: item?.id
    });
    
    // Validate item before setting
    if (!item) {
      console.error("❌ Validation failed: item is null or undefined");
      return;
    }
    
    if (typeof item.price !== 'number') {
      console.error("❌ Validation failed: price is not a number", {
        priceType: typeof item.price,
        priceValue: item.price
      });
      return;
    }
    
    if (isNaN(item.price)) {
      console.error("❌ Validation failed: price is NaN");
      return;
    }
    
    if (item.price < 0) {
      console.error("❌ Validation failed: price is negative", item.price);
      return;
    }
    
    console.log("✅ Item validation passed");
    
    // Create unique key combining id and category
    const cartItemKey = `${item.id}-${item.category || 'regular'}`;
    console.log("🔑 Cart item key:", cartItemKey);
    
    if (quantity <= 0) {
      console.log("🗑️ Removing item (quantity <= 0)");
      // Remove by cartItemKey instead of just id
      setCartItems((prev) => prev.filter((i) => {
        const existingKey = `${i.id}-${i.category || 'regular'}`;
        return existingKey !== cartItemKey;
      }));
      return;
    }
    
    setCartItems((prev) => {
      const existing = prev.find((i) => {
        const existingKey = `${i.id}-${i.category || 'regular'}`;
        return existingKey === cartItemKey;
      });
      if (existing) {
        console.log("📝 Updating existing item quantity");
        // Item exists, update quantity
        return prev.map((i) => {
          const existingKey = `${i.id}-${i.category || 'regular'}`;
          return existingKey === cartItemKey ? { ...i, quantity, cartItemKey } : i;
        });
      }
      console.log("➕ Adding new item to cart");
      // New item, add with specified quantity
      const newItem = { ...item, quantity, cartItemKey } as CartItem;
      console.log("🆕 New item structure:", newItem);
      return [...prev, newItem];
    });
    
    console.log("✅ setItemQuantity completed");
  };

  const removeFromCart = (itemKey: string) => {
    setCartItems((prev) => prev.filter((item) => item.cartItemKey !== itemKey));
  };

  const updateQuantity = (itemKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemKey);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => (item.cartItemKey === itemKey ? { ...item, quantity } : item))
    );
  };

  const updateCart = (items: CartItem[]) => {
    setCartItems(items);
  };

  const clearCart = async () => {
    console.log("🗑️ Clearing cart...");
    
    // Clear local state immediately
    setCartItems([]);
    
    // Also clear localStorage immediately to prevent any race conditions
    if (typeof window !== "undefined") {
      localStorage.setItem("cart", JSON.stringify([]));
    }
    
    // Also clear cart on backend if user is logged in
    if (user && accessToken && hasInitialFetch) {
      console.log("🗑️ Clearing backend cart for user:", user.id);
      try {
        const response = await fetch(`${API_BASE}/cart/clear`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken,
          },
        });

        if (response.ok) {
          console.log("✅ Backend cart cleared successfully");
          // Force a small delay to ensure backend has processed the clear
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.error("❌ Failed to clear backend cart:", response.status);
        }
      } catch (error) {
        console.error("❌ Error clearing backend cart:", error);
      }
    }
  };

  const syncCart = async () => {
    if (user && accessToken) {
      await fetchCartFromBackend();
    }
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce(
    (sum, item) => {
      const itemPrice = typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
      const itemQuantity = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
      return sum + itemPrice * itemQuantity;
    },
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        setItemQuantity,
        removeFromCart,
        updateQuantity,
        updateCart,
        clearCart,
        totalItems,
        totalPrice,
        syncCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Add display name for better debugging and HMR support
CartProvider.displayName = 'CartProvider';

// Default cart context for when provider is temporarily unavailable (e.g., during HMR)
const defaultCartContext: CartContextType = {
  cartItems: [],
  addToCart: () => {},
  setItemQuantity: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  updateCart: () => {},
  clearCart: async () => {},
  totalItems: 0,
  totalPrice: 0,
  syncCart: async () => {},
};

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    // During HMR, the provider may be temporarily unavailable.
    // Return a safe default instead of throwing to prevent crash loops.
    console.warn("useCart: CartContext not available, returning default (likely HMR)");
    return defaultCartContext;
  }
  return context;
}