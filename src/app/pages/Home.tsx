import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ShoppingCart, Gift, AlertCircle, MessageCircle, Package } from "lucide-react";
import { getIconComponent } from "../lib/iconMap";
import { setWhatsAppConfig, getWhatsAppDisplay, getWhatsAppLink } from "../lib/whatsapp";
import { ActiveOrderBar } from "../components/ActiveOrderBar";
import { APP_CONFIG, LOGO_ALT, whatsAppOrderMessage } from "../lib/config";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { useRestaurantLogo, cacheRestaurantLogo, notifyLogoUpdate } from "../lib/useRestaurantLogo";
import { cacheRestaurantMascot, notifyMascotUpdate } from "../lib/useRestaurantMascot";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Mascot } from "../components/Mascot";
import { useMascot } from "../lib/mascot-context";

interface MenuCounts {
  todaysSpecial: number;
  kidsMenu: number;
  flashSale: number;
  regularMenu: number;
}

interface UserCounts {
  activeOrders: number;
  availableRewards: number;
}

interface RestaurantStatus {
  isOpen: boolean;
  acceptingOrders: boolean;
  reason?: string;
  whatsappNumber?: string;
  whatsappDisplay?: string;
  restaurantAddress?: string;
  restaurantLogoUrl?: string;
  mascotImageUrl?: string;
}

interface HomeCategory {
  id: string;
  title: string;
  icon: string;
  route: string;
  visible: boolean;
  order: number;
  countKey: string | null;
  isBuiltIn: boolean;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const { logo: cachedLogo, loading: logoLoading } = useRestaurantLogo();
  const [menuCounts, setMenuCounts] = useState<MenuCounts>({
    todaysSpecial: 0,
    kidsMenu: 0,
    flashSale: 0,
    regularMenu: 0,
  });
  const [userCounts, setUserCounts] = useState<UserCounts>({
    activeOrders: 0,
    availableRewards: 0,
  });
  const [homeCategories, setHomeCategories] = useState<HomeCategory[]>([]);
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [restaurantStatus, setRestaurantStatus] = useState<RestaurantStatus>({
    isOpen: true,
    acceptingOrders: true,
  });

  // Fetch restaurant status
  useEffect(() => {
    const fetchRestaurantStatus = async () => {
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
        const response = await fetch(`${API_BASE}/restaurant-status`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        
        if (response.ok) {
          const status = await response.json();
          setRestaurantStatus(status);
          // Update WhatsApp config from admin settings
          if (status.whatsappNumber) {
            setWhatsAppConfig(status.whatsappNumber, status.whatsappDisplay);
          }
          // Cache logo URL in localStorage for instant display on next visit
          cacheRestaurantLogo(status.restaurantLogoUrl || null);
          notifyLogoUpdate();
          // Cache mascot image URL
          cacheRestaurantMascot(status.mascotImageUrl || null);
          notifyMascotUpdate();
        } else {
          // Silently fail - restaurant is accepting orders by default
          setRestaurantStatus({ isOpen: true, acceptingOrders: true });
        }
      } catch {
        setRestaurantStatus({ isOpen: true, acceptingOrders: true });
      }
    };

    fetchRestaurantStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchRestaurantStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch home layout categories from server
  useEffect(() => {
    const fetchHomeLayout = async () => {
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
        const res = await fetch(`${API_BASE}/home-layout`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.categories?.length > 0) {
            setHomeCategories(data.categories);
          }
        }
      } catch (error) {
        console.log("Could not fetch home layout - using defaults");
      }
    };
    fetchHomeLayout();
  }, []);

  // Fetch menu counts
  useEffect(() => {
    const fetchMenuCounts = async () => {
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

        // Fetch all menu data in parallel
        const [todaysSpecialRes, kidsMenuRes, flashSaleRes, regularMenuRes] = await Promise.all([
          fetch(`${API_BASE}/todays-special`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
          fetch(`${API_BASE}/kids-menu`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
          fetch(`${API_BASE}/flash-sale`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
          fetch(`${API_BASE}/regular-menu`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
        ]);

        const todaysSpecial = await todaysSpecialRes.json();
        const kidsMenu = await kidsMenuRes.json();
        const flashSale = await flashSaleRes.json();
        const regularMenu = await regularMenuRes.json();

        setMenuCounts({
          todaysSpecial: todaysSpecial.items?.filter((item: any) => item.enabled !== false)?.length || 0,
          kidsMenu: kidsMenu.items?.filter((item: any) => item.enabled !== false)?.length || 0,
          flashSale: flashSale.items?.filter((item: any) => item.enabled !== false)?.length || 0,
          regularMenu: regularMenu.items?.filter((item: any) => item.isAvailable !== false)?.length || 0,
        });
      } catch (error) {
        console.error("Failed to fetch menu counts:", error);
      }
    };

    fetchMenuCounts();
  }, []);

  // Fetch user-specific counts (orders and rewards)
  useEffect(() => {
    const fetchUserCounts = async () => {
      if (!user?.id) return;

      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
        const customToken = localStorage.getItem("customToken");

        // Fetch orders with timeout
        const ordersController = new AbortController();
        const ordersTimeout = setTimeout(() => ordersController.abort(), 10000); // 10s timeout

        try {
          const ordersRes = await fetch(`${API_BASE}/orders?userId=${user.id}`, {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
              ...(customToken && { "X-Custom-Auth": customToken }),
            },
            signal: ordersController.signal,
          });
          clearTimeout(ordersTimeout);

          if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            // Count active orders (exclude closed, cancelled, and delivered orders)
            const activeOrders = ordersData.orders?.filter(
              (order: any) => !["closed", "cancelled", "delivered"].includes(order.status)
            )?.length || 0;

            // Fetch rewards with timeout
            const rewardsController = new AbortController();
            const rewardsTimeout = setTimeout(() => rewardsController.abort(), 10000); // 10s timeout

            try {
              const rewardsRes = await fetch(`${API_BASE}/rewards`, {
                headers: {
                  Authorization: `Bearer ${publicAnonKey}`,
                  ...(customToken && { "X-Custom-Auth": customToken }),
                },
                signal: rewardsController.signal,
              });
              clearTimeout(rewardsTimeout);

              let availableRewards = 0;
              if (rewardsRes.ok) {
                const rewardsData = await rewardsRes.json();
                availableRewards = rewardsData.rewards?.filter((reward: any) => reward.enabled !== false)?.length || 0;
              }

              setUserCounts({
                activeOrders,
                availableRewards,
              });
            } catch (rewardsError) {
              clearTimeout(rewardsTimeout);
              // Silently fail for rewards, just set orders count
              setUserCounts({
                activeOrders,
                availableRewards: 0,
              });
            }
          }
        } catch (ordersError) {
          clearTimeout(ordersTimeout);
          // Silently fail - network might be temporarily unavailable
          console.log("Could not fetch user counts - will retry on next visit");
        }
      } catch (error) {
        // Silently handle errors - this is not critical functionality
        console.log("User counts fetch skipped");
      }
    };

    fetchUserCounts();
  }, [user]);

  const DEFAULT_ADDRESS = APP_CONFIG.restaurant.defaultAddress;

  // Derive display values from restaurant status
  const displayAddress = restaurantStatus.restaurantAddress || DEFAULT_ADDRESS;
  const displayLogoSrc = restaurantStatus.restaurantLogoUrl || cachedLogo;

  // Use server-fetched layout or fall back to defaults
  const defaultCategories: HomeCategory[] = [
    { id: "todays-special", title: "Today's Special", icon: "ChefHat", route: "/todays-special", visible: true, order: 0, countKey: "todaysSpecial", isBuiltIn: true },
    { id: "kids-menu", title: "Kids Menu", icon: "Baby", route: "/kids-menu", visible: true, order: 1, countKey: "kidsMenu", isBuiltIn: true },
    { id: "flash-sale", title: "Flash Sale", icon: "Zap", route: "/flash-sale", visible: true, order: 2, countKey: "flashSale", isBuiltIn: true },
    { id: "regular-menu", title: "Regular Menu", icon: "UtensilsCrossed", route: "/regular-menu", visible: true, order: 3, countKey: "regularMenu", isBuiltIn: true },
    { id: "celebrations", title: "Celebrations", icon: "PartyPopper", route: "/celebrations", visible: true, order: 4, countKey: null, isBuiltIn: true },
  ];
  const menuCategories = homeCategories.length > 0 ? homeCategories : defaultCategories;

  // Fetch counts for custom /menu/ categories
  useEffect(() => {
    const customCats = menuCategories.filter(
      (c) => !c.isBuiltIn && c.route.startsWith("/menu/")
    );
    if (customCats.length === 0) return;

    const fetchCustomCounts = async () => {
      const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
      const counts: Record<string, number> = {};
      await Promise.all(
        customCats.map(async (cat) => {
          try {
            const slug = cat.route.replace("/menu/", "");
            const res = await fetch(`${API_BASE}/custom-menu/${slug}`, {
              headers: { Authorization: `Bearer ${publicAnonKey}` },
            });
            if (res.ok) {
              const data = await res.json();
              counts[cat.id] = data.items?.length || 0;
            }
          } catch {
            // silently ignore
          }
        })
      );
      setCustomCounts(counts);
    };
    fetchCustomCounts();
  }, [homeCategories]);

  const handleCategoryClick = (route: string) => {
    navigate(route);
  };

  const handleOrderLineClick = () => {
    window.open(getWhatsAppLink(whatsAppOrderMessage()), "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: APP_CONFIG.brand.backgroundTint }}>
      {/* Login/Register Link */}
      <div className="px-5 sm:px-7 pt-4 sm:pt-5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {user ? (
            <button
              onClick={() => navigate("/profile")}
              className="text-base font-medium hover:underline"
              style={{ color: APP_CONFIG.brand.primaryColor }}
            >
              {user.name || user.phone}
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="text-base font-medium hover:underline"
              style={{ color: APP_CONFIG.brand.primaryColor }}
            >
              Login / Register
            </button>
          )}
          
          {/* Cart Icon */}
          <button
            onClick={() => navigate("/cart")}
            className="relative p-2.5 -mr-2"
          >
            <ShoppingCart className="w-6 sm:w-7 h-6 sm:h-7" style={{ color: APP_CONFIG.brand.primaryColor }} />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: APP_CONFIG.brand.primaryColor }}
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Logo Section */}
      <div className="text-center pt-1.5 sm:pt-3 pb-3 sm:pb-4 px-5">
        {/* Restaurant Logo */}
        <div className="flex justify-center">
          {logoLoading ? (
            /* Skeleton placeholder while logo is loading - avoids SVG fallback flash */
            <div 
              className="w-48 sm:w-64 h-12 sm:h-16 rounded-lg animate-pulse"
              style={{ backgroundColor: `${APP_CONFIG.brand.primaryColor}15` }}
            />
          ) : (
            <img 
              src={displayLogoSrc} 
              alt={LOGO_ALT} 
              className="w-48 sm:w-64 h-auto max-w-full mx-auto"
              style={{ 
                filter: `drop-shadow(0 2px 8px ${APP_CONFIG.brand.primaryShadow})`,
                objectFit: "contain",
                mixBlendMode: "multiply"
              }}
            />
          )}
        </div>
      </div>

      {/* Mascot Greeting Section */}
      {APP_CONFIG.mascot.enabled && (
        <Mascot
          page="home"
          activeOrders={userCounts.activeOrders}
          availableRewards={userCounts.availableRewards}
          className="pb-3 sm:pb-4"
        />
      )}

      {/* Store Closed Message - Full Page */}
      {(!restaurantStatus.isOpen || !restaurantStatus.acceptingOrders) ? (
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-20">
          <div className="max-w-lg w-full text-center space-y-4 sm:space-y-6">
            {/* Closed Icon */}
            <div className="flex justify-center">
              <div 
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FEE2E2" }}
              >
                <AlertCircle className="w-12 h-12 text-red-600" />
              </div>
            </div>

            {/* Sorry Message */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gray-800">
                Sorry, We're Closed
              </h1>
              <p className="text-lg text-gray-600">
                {restaurantStatus.reason || "Restaurant is currently not accepting orders"}
              </p>
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">
                For urgent inquiries, please contact us:
              </p>
              <button
                onClick={handleOrderLineClick}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl transition-all duration-200 hover:opacity-90"
                style={{ backgroundColor: "#25D366" }}
              >
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-white font-semibold">
                  WhatsApp: {getWhatsAppDisplay()}
                </span>
              </button>
            </div>

            {/* My Orders & Rewards still accessible */}
            <div className="pt-4">
              <p className="text-sm text-gray-500 mb-3">Quick Access</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate("/order-history")}
                  className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center gap-2"
                >
                  <Package className="w-6 h-6" style={{ color: APP_CONFIG.brand.primaryColor }} />
                  <span className="text-sm font-semibold text-gray-700">My Orders</span>
                </button>
                <button
                  onClick={() => navigate("/rewards")}
                  className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center gap-2"
                >
                  <Gift className="w-6 h-6" style={{ color: APP_CONFIG.brand.primaryColor }} />
                  <span className="text-sm font-semibold text-gray-700">My Rewards</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Menu Categories - Horizontal Scrollable Icon Row */}
          <div className="px-1 pb-4 sm:pb-5">
            <div className="max-w-lg mx-auto">
              {/* Section Label */}
              <div className="px-4 mb-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Explore Menu
                </span>
              </div>

              {/* Scrollable Row */}
              <div
                className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-hide"
                style={{
                  scrollSnapType: "x mandatory",
                  WebkitOverflowScrolling: "touch",
                  msOverflowStyle: "none",
                  scrollbarWidth: "none",
                }}
              >
                {menuCategories.map((category) => {
                  const IconComponent = getIconComponent(category.icon);
                  const count = category.countKey
                    ? menuCounts[category.countKey as keyof MenuCounts] || 0
                    : customCounts[category.id] || 0;

                  return (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryClick(category.route)}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform duration-150 px-2 py-1"
                      style={{ scrollSnapAlign: "start", minWidth: "72px" }}
                    >
                      {/* Circular Icon Container */}
                      <div className="relative">
                        <div
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-sm transition-shadow duration-200 hover:shadow-md"
                          style={{
                            background: `linear-gradient(135deg, ${APP_CONFIG.brand.primaryColor}10, ${APP_CONFIG.brand.primaryColor}20)`,
                            border: `2px solid ${APP_CONFIG.brand.primaryColor}25`,
                          }}
                        >
                          <IconComponent
                            className="w-6 h-6 sm:w-7 sm:h-7"
                            strokeWidth={2.2}
                            style={{ color: APP_CONFIG.brand.primaryColor }}
                          />
                        </div>
                        {/* Count Badge */}
                        {count > 0 && (
                          <span
                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white shadow-sm"
                            style={{ backgroundColor: APP_CONFIG.brand.primaryColor }}
                          >
                            {count}
                          </span>
                        )}
                      </div>
                      {/* Label */}
                      <span
                        className="text-[11px] sm:text-xs font-semibold text-center leading-tight max-w-[72px]"
                        style={{ color: "#5A5A5A" }}
                      >
                        {category.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* My Orders & My Rewards Buttons - Always visible */}
          <div className="px-4 sm:px-7 pb-3 sm:pb-5">
            <div className="grid grid-cols-2 gap-3.5 sm:gap-5 max-w-lg mx-auto">
              {/* My Orders */}
              <button
                onClick={() => navigate("/order-history")}
                className="relative bg-white rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2.5 sm:gap-3.5 active:scale-95"
              >
                {user && userCounts.activeOrders > 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge 
                      count={userCounts.activeOrders}
                      style={{ backgroundColor: APP_CONFIG.brand.primaryColor, color: "white" }}
                    />
                  </div>
                )}
                <Package className="w-6 h-6 sm:w-7 sm:h-7" style={{ color: APP_CONFIG.brand.primaryColor }} />
                <span className="text-sm sm:text-base font-semibold" style={{ color: "#4A4A4A" }}>
                  My Orders
                </span>
              </button>

              {/* My Rewards */}
              <button
                onClick={() => navigate("/rewards")}
                className="relative bg-white rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2.5 sm:gap-3.5 active:scale-95"
              >
                {user && userCounts.availableRewards > 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge 
                      count={userCounts.availableRewards}
                      style={{ backgroundColor: APP_CONFIG.brand.primaryColor, color: "white" }}
                    />
                  </div>
                )}
                <Gift className="w-6 h-6 sm:w-7 sm:h-7" style={{ color: APP_CONFIG.brand.primaryColor }} />
                <span className="text-sm sm:text-base font-semibold" style={{ color: "#4A4A4A" }}>
                  My Rewards
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bottom section: Active Order + Footer - always pushed to bottom */}
      <div className="mt-auto">
        {/* Active Order Tracking Bar */}
        <ActiveOrderBar />

        {/* Footer Section */}
        <div 
          className="py-2 sm:py-3 px-5 sm:px-7"
          style={{
            background: `linear-gradient(180deg, ${APP_CONFIG.brand.gradientStart} 0%, ${APP_CONFIG.brand.gradientEnd} 100%)`
          }}
        >
          <div className="max-w-lg mx-auto text-center space-y-2 sm:space-y-2.5">
            {/* WhatsApp Order Line - Inline Text Style */}
            <div
              onClick={handleOrderLineClick}
              className="flex items-center justify-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <svg className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span className="text-white text-xl sm:text-2xl font-semibold">{getWhatsAppDisplay()}</span>
            </div>

            {/* Address */}
            <div className="flex items-start justify-center gap-2">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <p className="text-white leading-tight text-xs sm:text-[13px] line-clamp-2">
                {displayAddress}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}