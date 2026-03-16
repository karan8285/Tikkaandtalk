import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { ArrowLeft, Plus, Minus, ShoppingCart, Award, ChevronLeft, ChevronRight, Share2, ChevronRight as ChevronRightIcon } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { MediaOverlay } from "../components/MediaOverlay";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface TodaysSpecialItem {
  id: number;
  name: string;
  subtitle?: string;
  description: string;
  image: string;
  video?: string;
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

  const BRAND = APP_CONFIG.brand.primaryColor;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .ts-slider .slick-dots {
        bottom: 12px;
      }
      .ts-slider .slick-dots li {
        margin: 0 3px;
      }
      .ts-slider .slick-dots li button:before {
        font-size: 8px;
        color: white;
        opacity: 0.5;
      }
      .ts-slider .slick-dots li.slick-active button:before {
        opacity: 1;
        color: white;
      }
      .ts-slider .slick-slide img {
        display: block;
        width: 100%;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    fetchItems();
    if (user) fetchUserPoints();
  }, [user]);

  const fetchItems = async () => {
    try {
      const response = await fetch(`${API_BASE}/todays-special`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
        if (data.items && data.items.length > 0) setCurrentItem(data.items[0]);
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
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
      });
      if (response.ok) {
        const data = await response.json();
        setUserPoints(data.totalPoints || 0);
      }
    } catch (error) {
      console.error("Error fetching points:", error);
    }
  };

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
      title: currentItem.name,
      description: currentItem.description,
      price: currentItem.finalPrice,
      originalPrice: currentItem.originalPrice,
      discountPercentage: currentItem.discountPercentage,
      image: currentItem.image,
      category: "Today's Special",
    };
    setItemQuantity(cartItem, quantity);
  };

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

  const calculatePoints = (price: number) => Math.floor((price * quantity) / 1000);

  const handleShare = async () => {
    if (!currentItem) return;
    const shareUrl = `${window.location.origin}/todays-special/${currentItem.id}`;
    const shareText = `Check out this amazing Today's Special deal: ${currentItem.name} - ${currentItem.discountPercentage}% OFF! Rp ${(currentItem.finalPrice || 0).toLocaleString("id-ID")}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Today's Special: ${currentItem.name}`, text: shareText, url: shareUrl });
        toast.success("Shared successfully!");
      } catch (error) {
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
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: `${BRAND} transparent ${BRAND} ${BRAND}` }}></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header
          className="sticky top-0 z-10 shadow-md"
          style={{ backgroundColor: BRAND, borderRadius: "0 0 20px 20px" }}
        >
          <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-white">Today's Special</h1>
            <div className="w-10"></div>
          </div>
        </header>
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">No special offers available at the moment.</p>
          <button onClick={() => navigate("/")} className="mt-4 font-medium hover:underline" style={{ color: BRAND }}>
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* Header with rounded bottom */}
      <header
        className="sticky top-0 z-20 shadow-lg"
        style={{ backgroundColor: BRAND, borderRadius: "0 0 20px 20px" }}
      >
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-wide">Today's Special</h1>
          <button onClick={() => navigate("/cart")} className="relative p-2 -mr-2 text-white active:scale-90 transition-transform">
            <ShoppingCart className="w-6 h-6" />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center text-white"
                style={{ backgroundColor: "#FF6B35" }}
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto">
        {/* Hero Image Carousel — edge-to-edge */}
        <div className="ts-slider">
          <Slider ref={sliderRef} {...sliderSettings}>
            {items.map((item) => (
              <div key={item.id}>
                <div className="relative">
                  <MediaOverlay
                    image={item.image}
                    video={item.video}
                    alt={item.name}
                    heightClass="h-80"
                  >
                    {/* Share Button */}
                    <button
                      onClick={handleShare}
                      className="absolute top-4 left-4 bg-white/90 hover:bg-white p-2.5 rounded-full shadow-lg transition-colors z-10"
                    >
                      <Share2 className="w-5 h-5" style={{ color: BRAND }} />
                    </button>

                    {/* Discount Badge on image */}
                    {item.discountPercentage > 0 && (
                      <div
                        className="absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-xs font-extrabold text-white shadow-lg z-10"
                        style={{ backgroundColor: "#FF3B30" }}
                      >
                        {item.discountPercentage}% OFF
                      </div>
                    )}

                    {/* Custom badge (if different from discount) */}
                    {item.badgeText && item.badgeText !== `${item.discountPercentage}% OFF` && (
                      <div
                        className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-lg z-10"
                        style={{ backgroundColor: BRAND }}
                      >
                        {item.badgeText}
                      </div>
                    )}

                    {/* Navigation Arrows */}
                    {items.length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); sliderRef.current?.slickPrev(); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-md transition-colors z-10"
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); sliderRef.current?.slickNext(); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-md transition-colors z-10"
                        >
                          <ChevronRight className="w-5 h-5 text-gray-700" />
                        </button>
                      </>
                    )}

                    {/* Bottom gradient overlay for smooth transition to content */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50/80 to-transparent z-[1]" />
                  </MediaOverlay>
                </div>
              </div>
            ))}
          </Slider>
        </div>

        {/* Content Section */}
        {currentItem && (
          <div className="px-5 -mt-4 relative z-10 space-y-4">
            {/* Item Name & Description */}
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900 mb-0.5">{currentItem.name}</h2>
              {currentItem.subtitle && (
                <p className="text-sm text-gray-500 font-medium mb-2">{currentItem.subtitle}</p>
              )}
              <p className="text-sm text-gray-500 leading-relaxed">{currentItem.description}</p>
            </div>

            {/* Pricing Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-sm text-gray-400 line-through">
                      Rp {(currentItem.originalPrice || 0).toLocaleString("id-ID")}
                    </span>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: "#FF3B30" }}
                    >
                      {currentItem.discountPercentage || 0}% OFF
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold" style={{ color: BRAND }}>
                    Rp {(currentItem.finalPrice || 0).toLocaleString("id-ID")}
                  </div>
                </div>
              </div>
            </div>

            {/* Loyalty Rewards Bar */}
            <div
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 cursor-pointer hover:bg-emerald-100 transition-colors"
              onClick={() => navigate("/rewards")}
            >
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Award className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900">
                  Earn {calculatePoints(currentItem.finalPrice)} points
                </p>
                {user && (
                  <p className="text-xs text-emerald-600">
                    Your balance: {userPoints.toLocaleString()} pts
                  </p>
                )}
              </div>
              <ChevronRightIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            </div>

            {/* Quantity Selector */}
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800">Quantity</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={decrementQuantity}
                  className="w-9 h-9 flex items-center justify-center rounded-full border-2 transition-colors active:scale-90"
                  style={{ borderColor: BRAND, color: BRAND }}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold w-8 text-center text-gray-900">{quantity}</span>
                <button
                  onClick={incrementQuantity}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white transition-colors active:scale-90"
                  style={{ backgroundColor: BRAND }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      {currentItem && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-30">
          <div className="max-w-md mx-auto px-5 py-3.5">
            {/* Total */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">Total</span>
              <span className="text-2xl font-extrabold" style={{ color: BRAND }}>
                Rp {((currentItem.finalPrice || 0) * quantity).toLocaleString("id-ID")}
              </span>
            </div>
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                className={`py-3.5 rounded-2xl font-bold text-[15px] transition-all flex items-center justify-center gap-2 active:scale-95 ${
                  isAddToCartDisabled()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    : 'bg-white border-2 hover:bg-gray-50'
                }`}
                style={!isAddToCartDisabled() ? { borderColor: BRAND, color: BRAND } : {}}
                disabled={isAddToCartDisabled()}
              >
                <ShoppingCart className="w-5 h-5" />
                {isAddToCartDisabled() ? 'In Cart' : 'Add to Cart'}
              </button>
              <button
                onClick={() => navigate('/cart')}
                className="py-3.5 rounded-2xl font-bold text-[15px] text-white transition-all flex items-center justify-center gap-1.5 active:scale-95 hover:opacity-90"
                style={{ backgroundColor: BRAND }}
              >
                Checkout
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
