import { projectId, publicAnonKey } from "/utils/supabase/info";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { toast } from "sonner";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Search, Plus, Minus, ShoppingCart, Heart, Flame, ChevronLeft, ChevronRight, Award, ChefHat } from "lucide-react";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  image?: string;
  isAvailable: boolean;
  isBestSeller?: boolean;
  isChefSpecial?: boolean;
}

interface FavoriteItem extends MenuItem {
  orderCount: number;
  isFavorited: boolean;
}

export default function RegularMenu() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addToCart, cartItems, updateQuantity } = useCart();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({});

  // Favorites state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [itemFrequency, setItemFrequency] = useState<Record<string, number>>({});
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [togglingFav, setTogglingFav] = useState<string | null>(null);
  const favSliderRef = useRef<HTMLDivElement>(null);

  // Calculate total items in cart
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    fetchMenuItems();
  }, []);

  // Fetch favorites when user is available and items are loaded
  useEffect(() => {
    if (user?.id && items.length > 0) {
      fetchFavorites();
    }
  }, [user?.id, items.length]);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      
      const [itemsRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE}/regular-menu`, {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }),
        fetch(`${API_BASE}/regular-menu/categories`, {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }),
      ]);

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(itemsData.items || []);
      }

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setCategories(categoriesData.categories || []);
      }
    } catch (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Failed to load menu items");
    } finally {
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    if (!user?.id) return;
    setLoadingFavorites(true);
    try {
      const res = await fetch(`${API_BASE}/user-favorites?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFavoriteIds(new Set(data.favorites || []));
        setItemFrequency(data.itemFrequency || {});
      }
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
    } finally {
      setLoadingFavorites(false);
    }
  };

  const handleToggleFavorite = async (itemId: string) => {
    if (!user?.id) {
      toast.error("Please sign in to add favorites");
      return;
    }
    setTogglingFav(itemId);
    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });

    try {
      const res = await fetch(`${API_BASE}/user-favorites/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ userId: user.id, itemId }),
      });
      if (!res.ok) {
        // Revert optimistic update
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (next.has(itemId)) {
            next.delete(itemId);
          } else {
            next.add(itemId);
          }
          return next;
        });
        toast.error("Failed to update favorite");
      }
    } catch (error) {
      console.error("Toggle favorite error:", error);
      // Revert
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    } finally {
      setTogglingFav(null);
    }
  };

  const getItemImage = (name: string, category: string) => {
    const searchTerm = `${name} indian food`.toLowerCase().replace(/\s+/g, "-");
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://source.unsplash.com/400x300/?${searchTerm}&sig=${hash}`;
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[itemId] || 1;
      const newQty = Math.max(1, current + delta);
      return { ...prev, [itemId]: newQty };
    });
  };

  const handleAddToCart = (item: MenuItem, qty?: number) => {
    const quantity = qty || quantities[item.id] || 1;
    
    addToCart({
      id: item.id,
      title: item.name,
      price: item.price,
      quantity: quantity,
      image: item.image || getItemImage(item.name, item.category),
      category: item.category,
    });

    toast.success(`Added ${quantity}x ${item.name} to cart`);
    
    // Reset quantity after adding
    setQuantities((prev) => {
      const updated = { ...prev };
      delete updated[item.id];
      return updated;
    });
  };

  // Build favorites section: combine manual favorites + frequently ordered items
  const favoriteItems: FavoriteItem[] = (() => {
    if (!user?.id) return [];
    const combined = new Map<string, FavoriteItem>();

    // Add items with order frequency
    for (const [itemId, count] of Object.entries(itemFrequency)) {
      const menuItem = items.find((i) => i.id === itemId);
      if (menuItem && menuItem.isAvailable) {
        combined.set(itemId, {
          ...menuItem,
          orderCount: count,
          isFavorited: favoriteIds.has(itemId),
        });
      }
    }

    // Add manually favorited items (even if never ordered)
    for (const favId of favoriteIds) {
      if (!combined.has(favId)) {
        const menuItem = items.find((i) => i.id === favId);
        if (menuItem && menuItem.isAvailable) {
          combined.set(favId, {
            ...menuItem,
            orderCount: 0,
            isFavorited: true,
          });
        }
      }
    }

    // Sort: favorited first, then by order count descending
    return Array.from(combined.values()).sort((a, b) => {
      if (a.isFavorited && !b.isFavorited) return -1;
      if (!a.isFavorited && b.isFavorited) return 1;
      return b.orderCount - a.orderCount;
    });
  })();

  const scrollFavSlider = (dir: "left" | "right") => {
    if (favSliderRef.current) {
      const scrollAmount = 200;
      favSliderRef.current.scrollBy({
        left: dir === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Filter items based on category and search
  const filteredItems = items.filter((item) => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Regular Menu" />
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Regular Menu" />

      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12"
            />
          </div>
        </div>

        {/* Favorites / Frequently Ordered Section - Only for logged-in users */}
        {user && favoriteItems.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FFF0F4" }}>
                  <Heart className="w-4 h-4 fill-current" style={{ color: "#D91A60" }} />
                </div>
                <h2 className="font-bold text-base">Your Favorites</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {favoriteItems.length}
                </span>
              </div>
              {favoriteItems.length > 2 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => scrollFavSlider("left")}
                    className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => scrollFavSlider("right")}
                    className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}
            </div>
            <div
              ref={favSliderRef}
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {favoriteItems.map((item) => (
                <div
                  key={`fav-${item.id}`}
                  className="flex-shrink-0 w-40 bg-white rounded-xl shadow-md overflow-hidden relative group"
                >
                  {/* Heart badge - top right */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(item.id);
                    }}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        item.isFavorited
                          ? "fill-current text-red-500"
                          : "text-gray-400"
                      }`}
                    />
                  </button>

                  {/* Order count badge - top left */}
                  {item.orderCount > 0 && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white shadow-sm">
                      <Flame className="w-3 h-3" />
                      {item.orderCount}x
                    </div>
                  )}

                  <img
                    src={item.image || getItemImage(item.name, item.category)}
                    alt={item.name}
                    className="w-full h-24 object-cover"
                  />
                  <div className="p-2.5">
                    <h4 className="font-semibold text-xs leading-tight line-clamp-2 mb-1">
                      {item.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 mb-1">{item.category}</p>
                    <p className="font-bold text-xs mb-2" style={{ color: "#D91A60" }}>
                      {formatIDR(item.price)}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleAddToCart(item, 1)}
                      className="w-full h-7 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: "#D91A60" }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add to Cart
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === "all"
                  ? "bg-primary text-white"
                  : "bg-white text-gray-700 border border-gray-200"
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? "bg-primary text-white"
                    : "bg-white text-gray-700 border border-gray-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No items found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const quantity = quantities[item.id] || 1;
              const isFav = favoriteIds.has(item.id);
              const freqCount = itemFrequency[item.id] || 0;
              
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-md overflow-hidden"
                >
                  <div className="flex gap-4 p-4">
                    <div className="relative">
                      <img
                        src={item.image || getItemImage(item.name, item.category)}
                        alt={item.name}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      {freqCount > 0 && (
                        <div className="absolute -top-1 -left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-orange-500 text-white shadow">
                          <Flame className="w-2.5 h-2.5" />
                          {freqCount}x ordered
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                          {/* Best Seller / Chef Special badges */}
                          {(item.isBestSeller || item.isChefSpecial) && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {item.isBestSeller && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  <Award className="w-3 h-3" />
                                  Best Seller
                                </span>
                              )}
                              {item.isChefSpecial && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                  <ChefHat className="w-3 h-3" />
                                  Chef Special
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground mb-2">
                            {item.category}
                          </p>
                        </div>
                        {/* Heart icon - only for logged-in users */}
                        {user && (
                          <button
                            onClick={() => handleToggleFavorite(item.id)}
                            disabled={togglingFav === item.id}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                              isFav
                                ? "bg-red-50 hover:bg-red-100"
                                : "bg-gray-50 hover:bg-gray-100"
                            } ${togglingFav === item.id ? "opacity-50" : ""}`}
                          >
                            <Heart
                              className={`w-5 h-5 transition-all ${
                                isFav
                                  ? "fill-current text-red-500 scale-110"
                                  : "text-gray-400 hover:text-red-400"
                              }`}
                            />
                          </button>
                        )}
                      </div>
                      <p className="text-primary font-bold text-lg">
                        {formatIDR(item.price)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Quantity Selector and Add to Cart */}
                  <div className="px-4 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="w-8 h-8 rounded-md bg-white flex items-center justify-center hover:bg-gray-50 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-semibold">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="w-8 h-8 rounded-md bg-white flex items-center justify-center hover:bg-gray-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <Button
                      onClick={() => handleAddToCart(item)}
                      className="bg-primary hover:bg-primary/90 text-white"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Add to Cart
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* View Cart Button (Fixed Bottom) */}
      {totalItems > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 max-w-md mx-auto">
          <Button
            onClick={() => navigate("/cart")}
            className="w-full bg-primary hover:bg-primary/90 text-white h-12 flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            <span>View Cart ({totalItems} items)</span>
          </Button>
        </div>
      )}
    </div>
  );
}