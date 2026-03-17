import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { ArrowLeft, Plus, Minus, ShoppingCart, Award, ChevronLeft, ChevronRight, Share2, ChevronRight as ChevronRightIcon } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { FlashSaleTimer } from "../components/FlashSaleTimer";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { motion } from "motion/react";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import { MediaOverlay } from "../components/MediaOverlay";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface FlashSaleItem {
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
  endTime?: string | null;
}

export default function FlashSale() {
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId: string }>();
  const { user, accessToken } = useAuth();
  const { setItemQuantity, totalItems, cartItems } = useCart();
  const [items, setItems] = useState<FlashSaleItem[]>([]);
  const [currentItem, setCurrentItem] = useState<FlashSaleItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [userPoints, setUserPoints] = useState(0);
  const sliderRef = useRef<any>(null);

  const BRAND = APP_CONFIG.brand.primaryColor;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .fs-slider .slick-dots {
        bottom: 12px;
      }
      .fs-slider .slick-dots li {
        margin: 0 3px;
      }
      .fs-slider .slick-dots li button:before {
        font-size: 8px;
        color: white;
        opacity: 0.5;
      }
      .fs-slider .slick-dots li.slick-active button:before {
        opacity: 1;
        color: white;
      }
      .fs-slider .slick-slide img {
        display: block;
        width: 100%;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    fetchItems();
    if (user && accessToken) fetchUserPoints();
  }, [user, accessToken]);

  const fetchItems = async () => {
    try {
      const response = await fetchWithRetry(`${API_BASE}/flash-sale`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        const activeItems = (data.items || []).filter((item: FlashSaleItem) => {
          if (!item.endTime) return true;
          return new Date(item.endTime).getTime() > new Date().getTime();
        });
        setItems(activeItems);

        if (itemId && activeItems.length > 0) {
          const targetItem = activeItems.find((item: FlashSaleItem) => item.id === parseInt(itemId));
          if (targetItem) {
            setCurrentItem(targetItem);
            const targetIndex = activeItems.findIndex((item: FlashSaleItem) => item.id === parseInt(itemId));
            if (sliderRef.current && targetIndex >= 0) {
              setTimeout(() => { sliderRef.current?.slickGoTo(targetIndex); }, 100);
            }
          } else {
            setCurrentItem(activeItems[0]);
          }
        } else if (activeItems.length > 0) {
          setCurrentItem(activeItems[0]);
        }
      } else {
        console.error("Failed to fetch flash sale items:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Error fetching flash sale:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPoints = async () => {
    if (!accessToken) return;
    try {
      const response = await fetchWithRetry(`${API_BASE}/points/summary`, {
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
        const currentKey = `${currentItem.id}-Flash Sale`;
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
      category: "Flash Sale",
    };
    setItemQuantity(cartItem, quantity);
  };

  const isAddToCartDisabled = () => {
    if (!currentItem) return true;
    const cartItem = cartItems.find(item => {
      const itemKey = `${item.id}-${item.category || 'regular'}`;
      const currentKey = `${currentItem.id}-Flash Sale`;
      return itemKey === currentKey;
    });
    return cartItem && cartItem.quantity === quantity;
  };

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const calculatePoints = (price: number) => Math.floor((price * quantity) / 1000);

  const handleShare = async () => {
    if (!currentItem) return;
    const shareUrl = `${window.location.origin}/flash-sale/${currentItem.id}`;
    const shareText = `Check out this amazing Flash Sale deal: ${currentItem.name} - ${currentItem.discountPercentage}% OFF! Rp ${currentItem.finalPrice.toLocaleString("id-ID")}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Flash Sale: ${currentItem.name}`, text: shareText, url: shareUrl });
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

  const handleOrderNow = () => {
    if (!user) { navigate("/login"); return; }
    if (!currentItem) return;
    navigate("/order", {
      state: {
        offerId: `flash-sale-${currentItem.id}`,
        offerData: {
          id: `flash-sale-${currentItem.id}`,
          title: currentItem.name,
          price: currentItem.finalPrice,
          discountedPrice: currentItem.finalPrice,
          image: currentItem.image,
          quantity: quantity,
        },
      },
    });
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
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: `#FF3B30 transparent #FF3B30 #FF3B30` }}></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header
          className="sticky top-0 z-10 shadow-md"
          style={{ background: "linear-gradient(135deg, #E8336D, #FF3B30, #E8336D)", borderRadius: "0 0 20px 20px" }}
        >
          <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-center">
              <h1 className="text-lg font-bold text-white">Flash Sale</h1>
              <p className="text-xs text-white/80 font-medium">⚡ Limited Time Offer</p>
            </div>
            <div className="w-10"></div>
          </div>
        </header>
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">No flash sale items available at the moment.</p>
          <button onClick={() => navigate("/")} className="mt-4 font-medium hover:underline" style={{ color: BRAND }}>
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* Flash Sale Header with rounded bottom + pulse animation */}
      <header
        className="sticky top-0 z-20 shadow-lg"
        style={{ background: "linear-gradient(135deg, #E8336D, #FF3B30, #E8336D)", borderRadius: "0 0 20px 20px" }}
      >
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <motion.div
            className="flex flex-col items-center"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <h1 className="text-lg font-bold text-white">Flash Sale</h1>
            <p className="text-[11px] text-white/90 font-semibold">⚡ Limited Time Offer</p>
          </motion.div>
          <button onClick={() => navigate("/cart")} className="relative p-2 -mr-2 text-white active:scale-90 transition-transform">
            <ShoppingCart className="w-6 h-6" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-yellow-400 text-gray-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Timer ribbon */}
        {currentItem?.endTime && (
          <div className="max-w-md mx-auto px-4 pb-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center justify-center gap-2">
              <span className="text-xs text-white/90 font-medium">Offer ends in</span>
              <FlashSaleTimer
                endTime={currentItem.endTime}
                variant="default"
                onExpire={() => fetchItems()}
              />
            </div>
          </div>
        )}
      </header>

      <div className="max-w-md mx-auto">
        {/* Hero Image Carousel — edge-to-edge */}
        <div className="fs-slider">
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
                      <Share2 className="w-5 h-5" style={{ color: "#FF3B30" }} />
                    </button>

                    {/* Discount Badge */}
                    {item.discountPercentage > 0 && (
                      <div className="absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-xs font-extrabold text-white shadow-lg z-10 bg-gradient-to-r from-pink-600 to-red-500">
                        {item.discountPercentage}% OFF
                      </div>
                    )}

                    {/* Custom badge */}
                    {item.badgeText && item.badgeText !== `${item.discountPercentage}% OFF` && (
                      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-lg z-10 bg-gradient-to-r from-pink-600 to-red-500">
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

                    {/* Bottom gradient */}
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
                      Rp {currentItem.originalPrice.toLocaleString("id-ID")}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white bg-gradient-to-r from-pink-600 to-red-500">
                      {currentItem.discountPercentage}% OFF
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold" style={{ color: "#FF3B30" }}>
                    Rp {currentItem.finalPrice.toLocaleString("id-ID")}
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
                  className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-red-400 text-red-500 transition-colors active:scale-90"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold w-8 text-center text-gray-900">{quantity}</span>
                <button
                  onClick={incrementQuantity}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-r from-pink-600 to-red-500 text-white transition-colors active:scale-90"
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
              <span className="text-2xl font-extrabold" style={{ color: "#FF3B30" }}>
                Rp {(currentItem.finalPrice * quantity).toLocaleString("id-ID")}
              </span>
            </div>
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                className={`py-3.5 rounded-2xl font-bold text-[15px] transition-all flex items-center justify-center gap-2 active:scale-95 ${
                  isAddToCartDisabled()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    : 'bg-white border-2 border-red-400 text-red-500 hover:bg-red-50'
                }`}
                disabled={isAddToCartDisabled()}
              >
                <ShoppingCart className="w-5 h-5" />
                {isAddToCartDisabled() ? 'In Cart' : 'Add to Cart'}
              </button>
              <button
                onClick={() => navigate('/cart')}
                className="py-3.5 rounded-2xl font-bold text-[15px] text-white transition-all flex items-center justify-center gap-1.5 active:scale-95 hover:opacity-90 bg-gradient-to-r from-pink-600 to-red-500"
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