import { projectId, publicAnonKey } from "/utils/supabase/info";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { toast } from "sonner";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Search, Plus, Minus, ShoppingCart } from "lucide-react";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  image?: string;
  isAvailable: boolean;
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

  // Calculate total items in cart
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    // Fetch menu items regardless of authentication status
    // Guest users can browse the menu
    fetchMenuItems();
  }, []);

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

  const getItemImage = (name: string, category: string) => {
    // Generate unique Unsplash image based on item name and category
    const searchTerm = `${name} indian food`.toLowerCase().replace(/\s+/g, "-");
    // Use a hash of the name to get consistent but different images for each item
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

  const handleAddToCart = (item: MenuItem) => {
    const quantity = quantities[item.id] || 1;
    
    addToCart({
      id: item.id,
      title: item.name,
      price: item.price,
      quantity: quantity,
      image: item.image || getItemImage(item.name, item.category),
      category: "Regular Menu",
    });

    toast.success(`Added ${quantity}x ${item.name} to cart`);
    
    // Reset quantity after adding
    setQuantities((prev) => {
      const updated = { ...prev };
      delete updated[item.id];
      return updated;
    });
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
              
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-md overflow-hidden"
                >
                  <div className="flex gap-4 p-4">
                    <img
                      src={item.image || getItemImage(item.name, item.category)}
                      alt={item.name}
                      className="w-24 h-24 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {item.category}
                      </p>
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
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 max-w-md mx-auto">
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