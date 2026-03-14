import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useCart } from "../lib/cart";
import { APP_CONFIG } from "../lib/config";
import { ArrowLeft, Plus, ShoppingCart } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuItem {
  id: number;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  image: string;
  category?: string;
}

export default function Menu() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { addToCart, totalItems } = useCart();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Define category titles
  const categoryTitles: Record<string, string> = {
    specials: "Today's Special",
    kids: "Kids Menu",
    "flash-sale": "Flash Sale",
    regular: "Regular Menu",
  };

  useEffect(() => {
    fetchMenuItems();
  }, [category]);

  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      // Fetch special offers
      const specialsResponse = await fetch(`${API_BASE}/special-offers`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (specialsResponse.ok) {
        const specialsData = await specialsResponse.json();
        
        // Filter based on category
        if (category === "specials" || category === "flash-sale") {
          // Show special offers for specials and flash sale
          setMenuItems(specialsData.offers || []);
        } else if (category === "kids") {
          // Filter for kids items (you can customize this logic)
          const kidsItems = (specialsData.offers || []).slice(0, 3);
          setMenuItems(kidsItems);
        } else {
          // Show all items for regular menu
          setMenuItems(specialsData.offers || []);
        }
      }
    } catch (error) {
      console.error("Error fetching menu items:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (item: MenuItem) => {
    addToCart({
      id: item.id,
      title: item.title,
      description: item.description,
      price: item.originalPrice || item.price,
      originalPrice: item.originalPrice || item.price,
      image: item.image,
      category: item.category || categoryTitles[category || 'regular'] || 'Regular Menu',
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const categoryTitle = categoryTitles[category || "regular"] || "Menu";

  const BRAND = APP_CONFIG.brand.primaryColor;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#FFF5F7" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-4 shadow-sm"
        style={{ backgroundColor: BRAND }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">{categoryTitle}</h1>
          <button
            onClick={() => navigate("/cart")}
            className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ShoppingCart className="w-6 h-6 text-white" />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: BRAND }}
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 py-6">
        <div className="max-w-md mx-auto space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-pink-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Loading menu...</p>
            </div>
          ) : menuItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No items available in this category.</p>
              <button
                onClick={() => navigate("/")}
                className="mt-4 px-6 py-2 rounded-full text-white font-semibold"
                style={{ backgroundColor: BRAND }}
              >
                Back to Home
              </button>
            </div>
          ) : (
            menuItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4 p-4">
                  {/* Item Image */}
                  <div className="flex-shrink-0">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-24 h-24 object-cover rounded-xl"
                    />
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1 truncate">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {item.description}
                    </p>

                    {/* Price */}
                    <div className="flex items-center justify-between">
                      <div>
                        {item.originalPrice && item.originalPrice !== item.price ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400 line-through">
                              {formatPrice(item.originalPrice)}
                            </span>
                            <span className="font-bold" style={{ color: BRAND }}>
                              {formatPrice(item.price)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-gray-900">
                            {formatPrice(item.price || item.originalPrice)}
                          </span>
                        )}
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        onClick={() => handleAddToCart(item)}
                        className="p-2 rounded-full transition-all active:scale-95"
                        style={{ backgroundColor: BRAND }}
                      >
                        <Plus className="w-5 h-5 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}