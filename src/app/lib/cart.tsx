import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo } from "react";
import { useAuth } from "./auth";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "./config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface CartItem {
  id: number | string;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  discountPercentage?: number;
  image: string;
  quantity: number;
  category?: string;
  cartItemKey?: string;
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

// Persist context across HMR reloads — when Vite hot-reloads this module,
// createContext() would create a NEW object, breaking existing consumers.
const CART_CTX_KEY = APP_CONFIG.keys.cartContextKey;
const CartContext = ((globalThis as any)[CART_CTX_KEY] ??=
  createContext<CartContextType | undefined>(undefined)) as React.Context<CartContextType | undefined>;

function getCartItemKey(item: { id: number | string; category?: string }): string {
  return `${item.id}-${item.category || 'regular'}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, accessToken, loading: authLoading } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cart");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter(item => 
              item && 
              (typeof item.id === 'number' || typeof item.id === 'string') && 
              typeof item.title === 'string' &&
              typeof item.price === 'number' &&
              !isNaN(item.price) &&
              typeof item.quantity === 'number' &&
              !isNaN(item.quantity) &&
              item.quantity > 0
            );
          }
        }
      } catch {
        localStorage.removeItem("cart");
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

  // Migrate stale cart item categories ("Regular Menu" → actual category like "Biryani")
  const hasMigratedRef = useRef(false);
  useEffect(() => {
    if (hasMigratedRef.current || cartItems.length === 0) return;
    const broadCategories = ["Regular Menu", "Uncategorized", undefined, ""];
    const needsMigration = cartItems.some(item => broadCategories.includes(item.category));
    if (!needsMigration) {
      hasMigratedRef.current = true;
      return;
    }
    hasMigratedRef.current = true;
    // Fetch actual menu categories and update cart items
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/regular-menu`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const menuItems: any[] = data.items || [];
        // Build lookup by id and by name
        const byId: Record<string, string> = {};
        const byName: Record<string, string> = {};
        for (const mi of menuItems) {
          if (mi.id !== undefined) byId[String(mi.id)] = mi.category || "";
          if (mi.name) byName[mi.name.toLowerCase().trim()] = mi.category || "";
        }
        setCartItems(prev => {
          let changed = false;
          const updated = prev.map(item => {
            if (!broadCategories.includes(item.category)) return item;
            const resolved = byId[String(item.id)] || byName[item.title.toLowerCase().trim()];
            if (resolved && resolved !== item.category) {
              console.log(`🔄 Cart migration: "${item.title}" category "${item.category}" → "${resolved}"`);
              changed = true;
              return { ...item, category: resolved, cartItemKey: `${item.id}-${resolved}` };
            }
            return item;
          });
          return changed ? updated : prev;
        });
      } catch (e) {
        console.warn("Cart category migration failed:", e);
      }
    })();
  }, [cartItems]);

  // Track when user logs in
  useEffect(() => {
    if (user && accessToken && !loginTime) {
      setLoginTime(Date.now());
      sessionStorage.setItem("justLoggedIn", Date.now().toString());
      setTimeout(() => sessionStorage.removeItem("justLoggedIn"), 5000);
    } else if (!user && loginTime) {
      setLoginTime(null);
    }
  }, [user, accessToken]);

  // Fetch cart from backend when user logs in
  useEffect(() => {
    if (authLoading) return;

    if (user && accessToken && !isSyncing && !hasInitialFetch) {
      const timeSinceLogin = loginTime ? Date.now() - loginTime : 0;
      const waitTime = Math.max(2000 - timeSinceLogin, 0);
      
      const timer = setTimeout(() => fetchCartFromBackend(), waitTime);
      return () => clearTimeout(timer);
    } else if (!user && hasInitialFetch) {
      setCartItems([]);
      setHasInitialFetch(false);
    }
  }, [user, accessToken, authLoading, loginTime]);

  const fetchCartFromBackend = async () => {
    if (!user) return;
    
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        const response = await fetch(
          `${API_BASE}/cart?userId=${user.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${publicAnonKey}`,
              "X-Custom-Auth": accessToken || "",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setHasInitialFetch(true);
          
          const localCart = cartItems;
          if (localCart.length > 0 && data.cart.length === 0) {
            try {
              await fetch(`${API_BASE}/cart/sync`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${publicAnonKey}`,
                  "X-Custom-Auth": accessToken || "",
                },
                body: JSON.stringify({ cart: localCart, userId: user.id }),
              });
            } catch {
              // Non-critical sync failure
            }
          } else {
            setCartItems(data.cart);
            // Reset migration flag so stale categories from backend get fixed too
            hasMigratedRef.current = false;
          }
          break;
        } else if (response.status === 401) {
          console.warn("Cart fetch: 401 Unauthorized");
          setHasInitialFetch(true);
          break;
        } else {
          console.error("Cart fetch failed:", response.status);
          setHasInitialFetch(true);
          break;
        }
      } catch (error) {
        setHasInitialFetch(true);
        if (attempt >= maxRetries) break;
      }
    }
  };

  const syncCartToBackend = async (cart: CartItem[]) => {
    if (!user || !accessToken || !hasInitialFetch) return;
    
    const currentCartString = JSON.stringify(cart);
    if (lastSyncedCartRef.current === currentCartString) return;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${API_BASE}/cart/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ cart, userId: user.id }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        lastSyncedCartRef.current = currentCartString;
      } else if (response.status === 401) {
        console.warn("Cart sync: 401 Unauthorized");
      } else {
        console.error("Cart sync failed:", response.status);
      }
    } catch {
      // Silently fail - cart is stored locally
    }
  };

  // Sync cart whenever it changes (debounced)
  useEffect(() => {
    if (user && accessToken && !isSyncing && hasInitialFetch) {
      const timer = setTimeout(() => syncCartToBackend(cartItems), 800);
      return () => clearTimeout(timer);
    }
  }, [cartItems, user, accessToken, isSyncing, hasInitialFetch]);

  const addToCart = (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    if (!item || typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      console.error("Invalid cart item:", item);
      return;
    }
    
    const quantityToAdd = item.quantity || 1;
    const cartItemKey = getCartItemKey(item);
    
    setCartItems((prev) => {
      const existing = prev.find((i) => getCartItemKey(i) === cartItemKey);
      if (existing) {
        return prev.map((i) =>
          getCartItemKey(i) === cartItemKey ? { ...i, quantity: i.quantity + quantityToAdd, cartItemKey } : i
        );
      }
      return [...prev, { ...item, quantity: quantityToAdd, cartItemKey }];
    });
  };

  const setItemQuantity = (item: Omit<CartItem, "quantity">, quantity: number) => {
    if (!item || typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      console.error("Invalid cart item for setItemQuantity:", item);
      return;
    }
    
    const cartItemKey = getCartItemKey(item);
    
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((i) => getCartItemKey(i) !== cartItemKey));
      return;
    }
    
    setCartItems((prev) => {
      const existing = prev.find((i) => getCartItemKey(i) === cartItemKey);
      if (existing) {
        return prev.map((i) =>
          getCartItemKey(i) === cartItemKey ? { ...i, quantity, cartItemKey } : i
        );
      }
      return [...prev, { ...item, quantity, cartItemKey } as CartItem];
    });
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
    setCartItems([]);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("cart", JSON.stringify([]));
    }
    
    if (user && accessToken && hasInitialFetch) {
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
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.error("Failed to clear backend cart:", response.status);
        }
      } catch (error) {
        console.error("Error clearing backend cart:", error);
      }
    }
  };

  const syncCart = async () => {
    if (user && accessToken) {
      await fetchCartFromBackend();
    }
  };

  const totalItems = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => {
      const p = typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
      const q = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
      return sum + p * q;
    }, 0),
    [cartItems]
  );

  return (
    <CartContext.Provider value={{
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

CartProvider.displayName = 'CartProvider';

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
    return defaultCartContext;
  }
  return context;
}