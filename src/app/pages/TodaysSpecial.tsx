import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { ArrowLeft, Plus, Minus, ShoppingCart, Award, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface TodaysSpecialItem {
  id: number;
  name: string;
  subtitle?: string;
  description: string;
  image: string;
  originalPrice: number;
  discountPercentage: number;
  finalPrice: number;
  badgeText?: string;
  enabled?: boolean;
  displayOrder?: number;
}

export default function TodaysSpecial() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const { setItemQuantity, totalItems, cartItems } = useCart();
  const [items, setItems] = useState<TodaysSpecialItem[]>([]);
  const [currentItem, setCurrentItem] = useState<TodaysSpecialItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [userPoints, setUserPoints] = useState(0);
  const sliderRef = useRef<any>(null);

  useEffect(() => {
    // Add custom carousel styles
    const style = document.createElement('style');
    style.textContent = `
      .slick-dots {
        bottom: 16px;
      }
      .slick-dots li button:before {
        font-size: 10px;
        color: white;
        opacity: 0.5;
      }
      .slick-dots li.slick-active button:before {
        opacity: 1;
        color: ${APP_CONFIG.brand.primaryColor};
      }
      .slick-slide img {
        display: block;
        width: 100%;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    fetchItems();
    if (user) {
      fetchUserPoints();
    }
  }, [user]);

  const fetchItems = async () => {
    try {
      const response = await fetch(`${API_BASE}/todays-special`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
        if (data.items && data.items.length > 0) {
          setCurrentItem(data.items[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching today's special:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPoints = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(`${API_BASE}/points/summary`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserPoints(data.totalPoints || 0);
      }
    } catch (error) {
      console.error("Error fetching points:", error);
    }
  };

  // Sync quantity with cart when currentItem changes
  useEffect(() => {
    if (currentItem) {
      const cartItem = cartItems.find(item => {
        const itemKey = `${item.id}-${item.category || 'regular'}`;
        const currentKey = `${currentItem.id}-Today's Special`;
        return itemKey === currentKey;
      });
      setQuantity(cartItem ? cartItem.quantity : 1);
    }
  }, [currentItem, cartItems]);

  const handleAddToCart = async () => {
    if (!currentItem) return;

    const cartItem = {
      id: currentItem.id,
      title: currentItem.name, // Cart expects 'title' not 'name'
      description: currentItem.description,
      price: currentItem.finalPrice,
      originalPrice: currentItem.originalPrice,
      discountPercentage: currentItem.discountPercentage,
      image: currentItem.image,
      category: "Today's Special",
    };

    setItemQuantity(cartItem, quantity);
  };

  // Check if the "Add to Cart" button should be disabled
  const isAddToCartDisabled = () => {
    if (!currentItem) return true;
    const cartItem = cartItems.find(item => {
      const itemKey = `${item.id}-${item.category || 'regular'}`;
      const currentKey = `${currentItem.id}-Today's Special`;
      return itemKey === currentKey;
    });
    return cartItem && cartItem.quantity === quantity;
  };

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const calculatePoints = (price: number) => {
    return Math.floor((price * quantity) / 1000);
  };

  const handleShare = async () => {
    if (!currentItem) return;
    
    const shareUrl = `${window.location.origin}/todays-special/${currentItem.id}`;
    const shareText = `Check out this amazing Today's Special deal: ${currentItem.name} - ${currentItem.discountPercentage}% OFF! Rp ${(currentItem.finalPrice || 0).toLocaleString("id-ID")}`;
    
    // Try native share API for mobile
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Today's Special: ${currentItem.name}`,
          text: shareText,
          url: shareUrl,
        });
        toast.success("Shared successfully!");
      } catch (error) {
        // User cancelled or error occurred
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error("Error sharing:", error);
          toast.error("Failed to share");
        }
      }
    } else {
      toast.info("Sharing is not supported on this device");
    }
  };

  const sliderSettings = {
    dots: true,
    infinite: items.length > 1,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    afterChange: (index: number) => {
      setCurrentItem(items[index]);
      setQuantity(1);
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
          <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">Today's Special</h1>
            <div className="w-10"></div>
          </div>
        </header>

        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">No special offers available at the moment.</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-primary font-medium hover:underline"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">Today's Special</h1>
          <button
            onClick={() => navigate("/cart")}
            className="relative p-2 -mr-2"
          >
            <ShoppingCart className="w-6 h-6" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Carousel Section */}
      <div className="max-w-md mx-auto">
        <Slider ref={sliderRef} {...sliderSettings}>
          {items.map((item) => (
            <div key={item.id}>
              <div className="relative">
                {/* Hero Image */}
                <div className="relative h-72 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                  
                  {/* Share Button */}
                  <button
                    onClick={handleShare}
                    className="absolute top-4 left-4 bg-white/90 hover:bg-white p-2.5 rounded-full shadow-lg transition-colors z-10"
                  >
                    <Share2 className="w-5 h-5 text-primary" />
                  </button>

                  {/* Badge */}
                  {item.badgeText && (
                    <div className="absolute top-4 right-4 bg-accent text-accent-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                      {item.badgeText}
                    </div>
                  )}

                  {/* Navigation Arrows */}
                  {items.length > 1 && (
                    <>
                      <button
                        onClick={() => sliderRef.current?.slickPrev()}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-800" />
                      </button>
                      <button
                        onClick={() => sliderRef.current?.slickNext()}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-800" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Slider>
      </div>

      {/* Content Section */}
      {currentItem && (
        <div className="max-w-md mx-auto px-4 mt-6 space-y-6">
          {/* Title & Description */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">
              {currentItem.name}
            </h2>
            {currentItem.subtitle && (
              <p className="text-sm text-muted-foreground mb-3">
                {currentItem.subtitle}
              </p>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentItem.description}
            </p>
          </div>

          {/* Pricing Card */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-sm text-muted-foreground line-through">
                Rp {(currentItem.originalPrice || 0).toLocaleString("id-ID")}
              </span>
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded">
                {currentItem.discountPercentage || 0}% OFF
              </span>
            </div>
            <div className="text-3xl font-bold text-primary">
              Rp {(currentItem.finalPrice || 0).toLocaleString("id-ID")}
            </div>
          </div>

          {/* Loyalty Points */}
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-teal-600" />
              <span className="font-semibold text-teal-900">Loyalty Rewards</span>
            </div>
            <p className="text-sm text-teal-700">
              Earn <span className="font-bold">{calculatePoints(currentItem.finalPrice)} points</span> with this order
            </p>
            {user && (
              <p className="text-xs text-teal-600 mt-1">
                Your balance: {userPoints.toLocaleString()} points
              </p>
            )}
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
            <span className="font-medium text-foreground">Quantity</span>
            <div className="flex items-center gap-4">
              <button
                onClick={decrementQuantity}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xl font-bold w-8 text-center">{quantity}</span>
              <button
                onClick={incrementQuantity}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Total Price */}
          <div className="flex items-center justify-between text-lg font-semibold">
            <span className="text-muted-foreground">Total</span>
            <span className="text-2xl text-primary">
              Rp {((currentItem.finalPrice || 0) * quantity).toLocaleString("id-ID")}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleAddToCart}
              className={`py-4 rounded-xl font-semibold text-lg transition-colors shadow-lg flex items-center justify-center gap-2 ${
                isAddToCartDisabled() 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
              disabled={isAddToCartDisabled()}
            >
              <ShoppingCart className="w-5 h-5" />
              {isAddToCartDisabled() ? 'In Cart' : 'Add to Cart'}
            </button>
            <button
              onClick={() => navigate('/cart')}
              className="bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}