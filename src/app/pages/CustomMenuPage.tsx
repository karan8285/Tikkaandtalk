import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useCart } from "../lib/cart";
import { APP_CONFIG } from "../lib/config";
import { getIconComponent } from "../lib/iconMap";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import {
  ArrowLeft,
  Plus,
  Minus,
  ShoppingCart,
  Search,
  PackageOpen,
} from "lucide-react";
import { Input } from "../components/ui/input";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface CustomMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image?: string;
  enabled: boolean;
  displayOrder: number;
}

interface CategoryMeta {
  id: string;
  title: string;
  icon: string;
  route: string;
}

export default function CustomMenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addToCart, cartItems, totalItems, setItemQuantity } = useCart();

  const [items, setItems] = useState<CustomMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Fetch category metadata from home-layout
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${API_BASE}/home-layout`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          const match = data.categories?.find(
            (c: any) => c.route === `/menu/${slug}`
          );
          if (match) {
            setCategoryMeta(match);
          }
        }
      } catch {
        // silently fail — title will fallback
      }
    };
    if (slug) fetchMeta();
  }, [slug]);

  // Fetch items
  useEffect(() => {
    const fetchItems = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/custom-menu/${slug}`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        } else {
          console.error("Failed to fetch custom menu:", res.status);
        }
      } catch (error) {
        console.error("Error fetching custom menu:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [slug]);

  // Init quantities from cart
  useEffect(() => {
    const q: Record<string, number> = {};
    for (const item of items) {
      const cartItem = cartItems.find(
        (ci) =>
          String(ci.id) === String(item.id) &&
          ci.category === (categoryMeta?.title || slug)
      );
      if (cartItem) q[item.id] = cartItem.quantity;
    }
    setQuantities(q);
  }, [items, cartItems, categoryMeta, slug]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const handleAddToCart = (item: CustomMenuItem) => {
    const category = categoryMeta?.title || slug || "Custom";
    addToCart({
      id: item.id,
      title: item.name,
      description: item.description || "",
      price: item.price,
      originalPrice: item.originalPrice || item.price,
      image: item.image || "",
      category,
    });
    setQuantities((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    toast.success(`Added ${item.name} to cart`);
  };

  const handleQuantityChange = (item: CustomMenuItem, delta: number) => {
    const current = quantities[item.id] || 0;
    const next = Math.max(0, current + delta);
    setQuantities((prev) => ({ ...prev, [item.id]: next }));

    const category = categoryMeta?.title || slug || "Custom";
    const cartPayload = {
      id: item.id,
      title: item.name,
      description: item.description || "",
      price: item.price,
      originalPrice: item.originalPrice || item.price,
      image: item.image || "",
      category,
    };
    setItemQuantity(cartPayload, next);
  };

  const displayTitle = categoryMeta?.title || formatSlugToTitle(slug || "");
  const IconComponent = categoryMeta
    ? getIconComponent(categoryMeta.icon)
    : null;

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: APP_CONFIG.brand.backgroundTint }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 shadow-sm"
        style={{ backgroundColor: BRAND }}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex items-center gap-2">
            {IconComponent && (
              <IconComponent className="w-5 h-5 text-white" strokeWidth={2.2} />
            )}
            <h1 className="text-lg font-bold text-white">{displayTitle}</h1>
          </div>
          <button
            onClick={() => navigate("/cart")}
            className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ShoppingCart className="w-6 h-6 text-white" />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: "#FF4444" }}
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      {items.length > 3 && (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${displayTitle}...`}
              className="pl-9 bg-white border-gray-200 rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="px-4 py-4">
        <div className="max-w-lg mx-auto space-y-3">
          {loading ? (
            // Skeleton loading
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 animate-pulse"
                >
                  <div className="flex gap-4">
                    <div className="w-24 h-24 rounded-xl bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="h-3 bg-gray-100 rounded w-2/3" />
                      <div className="h-5 bg-gray-200 rounded w-1/3 mt-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${BRAND}10` }}
              >
                <PackageOpen className="w-10 h-10" style={{ color: BRAND }} />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1">
                {searchQuery ? "No items found" : "No items yet"}
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                {searchQuery
                  ? `No items match "${searchQuery}". Try a different search.`
                  : `Items for ${displayTitle} will appear here once the restaurant adds them.`}
              </p>
              <button
                onClick={() => navigate("/")}
                className="mt-6 px-6 py-2.5 rounded-full text-white font-semibold text-sm transition-all active:scale-95"
                style={{ backgroundColor: BRAND }}
              >
                Back to Home
              </button>
            </div>
          ) : (
            filteredItems.map((item) => {
              const qty = quantities[item.id] || 0;
              const hasDiscount =
                item.originalPrice && item.originalPrice > item.price;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-3 p-3 sm:p-4">
                    {/* Image */}
                    <div className="flex-shrink-0">
                      {item.image ? (
                        <ImageWithFallback
                          src={item.image}
                          alt={item.name}
                          className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl"
                        />
                      ) : (
                        <div
                          className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${BRAND}08` }}
                        >
                          {IconComponent ? (
                            <IconComponent
                              className="w-8 h-8"
                              style={{ color: `${BRAND}40` }}
                            />
                          ) : (
                            <PackageOpen
                              className="w-8 h-8"
                              style={{ color: `${BRAND}40` }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 mt-0.5">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-auto pt-2 flex items-end justify-between">
                        {/* Price */}
                        <div>
                          {hasDiscount ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400 line-through">
                                {formatIDR(item.originalPrice!)}
                              </span>
                              <span
                                className="font-bold text-sm sm:text-base"
                                style={{ color: BRAND }}
                              >
                                {formatIDR(item.price)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-sm sm:text-base text-gray-900">
                              {formatIDR(item.price)}
                            </span>
                          )}
                        </div>

                        {/* Add to Cart / Quantity Controls */}
                        {qty === 0 ? (
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-semibold transition-all active:scale-95"
                            style={{ backgroundColor: BRAND }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuantityChange(item, -1)}
                              className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors"
                              style={{ borderColor: BRAND, color: BRAND }}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-sm font-bold w-5 text-center">
                              {qty}
                            </span>
                            <button
                              onClick={() => handleQuantityChange(item, 1)}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
                              style={{ backgroundColor: BRAND }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Cart Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-20">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => navigate("/cart")}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl text-white font-semibold shadow-lg transition-all active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="text-sm">
                  {totalItems} item{totalItems > 1 ? "s" : ""} in cart
                </span>
              </div>
              <span className="text-sm font-bold">View Cart</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Convert slug like "beverages" to "Beverages" */
function formatSlugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}