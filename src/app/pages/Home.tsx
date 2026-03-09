import { ChefHat, Baby, Zap, UtensilsCrossed, MessageCircle, Package, Gift, ShoppingCart, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import logoImage from "figma:asset/eaec9b840a2852be3b4c61f12d73c18841efc0f2.png";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { projectId, publicAnonKey } from "/utils/supabase/info";

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
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
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
        } else {
          // Silently fail - restaurant is accepting orders by default
          console.log("Restaurant status not configured, defaulting to open");
          setRestaurantStatus({ isOpen: true, acceptingOrders: true });
        }
      } catch (error) {
        // Silently fail - restaurant is accepting orders by default
        console.log("Restaurant status endpoint unavailable, defaulting to open");
        setRestaurantStatus({ isOpen: true, acceptingOrders: true });
      }
    };

    fetchRestaurantStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchRestaurantStatus, 30000);
    return () => clearInterval(interval);
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

  const menuCategories = [
    {
      id: 1,
      title: "Today's Special",
      icon: ChefHat,
      color: "#D91A60",
      route: "/todays-special"
    },
    {
      id: 2,
      title: "Kids Menu",
      icon: Baby,
      color: "#D91A60",
      route: "/kids-menu"
    },
    {
      id: 3,
      title: "Flash Sale",
      icon: Zap,
      color: "#D91A60",
      route: "/flash-sale"
    },
    {
      id: 4,
      title: "Regular Menu",
      icon: UtensilsCrossed,
      color: "#D91A60",
      route: "/regular-menu"
    }
  ];

  const handleCategoryClick = (route: string) => {
    navigate(route);
  };

  const handleOrderLineClick = () => {
    window.open("https://wa.me/628192515550?text=Hello%20Tikka%20N%20Talk%2C%20I%20want%20to%20place%20an%20order.", "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FFF5F7" }}>
      {/* Login/Register Link */}
      <div className="px-6 pt-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {user ? (
            <button
              onClick={() => navigate("/profile")}
              className="text-sm font-medium hover:underline"
              style={{ color: "#D91A60" }}
            >
              {user.name || user.phone}
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-medium hover:underline"
              style={{ color: "#D91A60" }}
            >
              Login / Register
            </button>
          )}
          
          {/* Cart Icon */}
          <button
            onClick={() => navigate("/cart")}
            className="relative p-2 -mr-2"
          >
            <ShoppingCart className="w-6 h-6" style={{ color: "#D91A60" }} />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: "#D91A60" }}
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Logo Section */}
      <div className="text-center pt-2 pb-4 px-4">
        {/* Restaurant Logo */}
        <div className="flex justify-center">
          <img 
            src={logoImage} 
            alt="Tikka N Talk - An Indian Kitchen" 
            className="w-56 h-auto max-w-full mx-auto"
            style={{ 
              filter: "drop-shadow(0 2px 8px rgba(217, 26, 96, 0.15))",
              objectFit: "contain"
            }}
          />
        </div>
      </div>

      {/* Store Closed Message - Full Page */}
      {(!restaurantStatus.isOpen || !restaurantStatus.acceptingOrders) ? (
        <div className="flex-1 flex items-center justify-center px-6 pb-20">
          <div className="max-w-md w-full text-center space-y-6">
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
                  WhatsApp: 0819-2515-550
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
                  <Package className="w-6 h-6" style={{ color: "#D91A60" }} />
                  <span className="text-sm font-semibold text-gray-700">My Orders</span>
                </button>
                <button
                  onClick={() => navigate("/rewards")}
                  className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center gap-2"
                >
                  <Gift className="w-6 h-6" style={{ color: "#D91A60" }} />
                  <span className="text-sm font-semibold text-gray-700">My Rewards</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Menu Categories Grid */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 gap-5 max-w-md mx-auto">
              {menuCategories.map((category) => {
                const IconComponent = category.icon;
                const countKey = category.route.replace("/", "").replace("-", "") as keyof MenuCounts;
                let count = 0;
                
                // Map route to correct count
                if (category.route === "/todays-special") count = menuCounts.todaysSpecial;
                else if (category.route === "/kids-menu") count = menuCounts.kidsMenu;
                else if (category.route === "/flash-sale") count = menuCounts.flashSale;
                else if (category.route === "/regular-menu") count = menuCounts.regularMenu;
                
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category.route)}
                    className="relative bg-white rounded-3xl p-8 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center justify-center gap-4 active:scale-95"
                    style={{ minHeight: "160px" }}
                  >
                    {/* Badge at top-right */}
                    {count > 0 && (
                      <div className="absolute top-3 right-3">
                        <Badge 
                          count={count}
                          style={{ backgroundColor: "#D91A60", color: "white" }}
                        />
                      </div>
                    )}
                    
                    {/* Icon - Direct, No Circle Background */}
                    <IconComponent 
                      className="w-14 h-14" 
                      strokeWidth={2} 
                      style={{ color: category.color }}
                    />
                    
                    {/* Category Name */}
                    <span className="text-base font-semibold text-center leading-tight" style={{ color: "#4A4A4A" }}>
                      {category.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* My Orders & My Rewards Buttons - Always visible */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              {/* My Orders */}
              <button
                onClick={() => navigate("/order-history")}
                className="relative bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 active:scale-95"
              >
                {user && userCounts.activeOrders > 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge 
                      count={userCounts.activeOrders}
                      style={{ backgroundColor: "#D91A60", color: "white" }}
                    />
                  </div>
                )}
                <Package className="w-6 h-6" style={{ color: "#D91A60" }} />
                <span className="text-sm font-semibold" style={{ color: "#4A4A4A" }}>
                  My Orders
                </span>
              </button>

              {/* My Rewards */}
              <button
                onClick={() => navigate("/rewards")}
                className="relative bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 active:scale-95"
              >
                {user && userCounts.availableRewards > 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge 
                      count={userCounts.availableRewards}
                      style={{ backgroundColor: "#D91A60", color: "white" }}
                    />
                  </div>
                )}
                <Gift className="w-6 h-6" style={{ color: "#D91A60" }} />
                <span className="text-sm font-semibold" style={{ color: "#4A4A4A" }}>
                  My Rewards
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer Section */}
      <div 
        className="py-8 px-6 mx-[0px] mt-auto mb-[4px]"
        style={{
          background: "linear-gradient(180deg, #E91E63 0%, #C2185B 100%)"
        }}
      >
        <div className="max-w-md mx-auto text-center space-y-6">
          {/* WhatsApp Order Line - Inline Text Style */}
          <div
            onClick={handleOrderLineClick}
            className="flex items-center justify-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <svg className="w-10 h-10 flex-shrink-0" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            <span className="text-white text-xl font-semibold mx-[0px] mt-[0px] mb-[6px]">0819-2515-550</span>
          </div>

          {/* Address */}
          <div className="flex items-start justify-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <p className="text-white leading-tight text-[12px] line-clamp-2">
              Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}