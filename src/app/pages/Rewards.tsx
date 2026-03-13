import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Gift, ChevronLeft, Award, Ticket, Car, UtensilsCrossed, RefreshCw, Percent, Truck, Tag, Clock, CheckCircle, Crown, Copy } from "lucide-react";
import { toast } from "sonner";
import logoImage from "../lib/logo";
import { getWhatsAppNumber, getWhatsAppDisplay, getWhatsAppLink } from "../lib/whatsapp";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Voucher {
  id: string;
  title: string;
  description: string;
  expiryDate: string;
  quantity: number;
  type: string;
  icon: string;
  conditions: string;
  discountType?: "percentage" | "fixed" | "free_delivery" | "freebie" | null;
  discountValue?: number | null;
  minOrderAmount?: number;
  applicableCategories?: string[];
}

interface TierBenefit {
  id: string;
  tier: string;
  icon: string;
  title: string;
  description: string;
  quantity: string;
  expiryDate: string;
  conditions: string;
}

interface UserVoucher {
  id: string;
  voucherId: string;
  userId: string;
  claimed: boolean;
  claimedAt: string | null;
  used: boolean;
  voucher: Voucher;
  promoCode?: string;
  usedCount?: number;
}

export default function Rewards() {
  const navigate = useNavigate();
  const { user, loading, accessToken, refreshProfile } = useAuth();
  const [loadingData, setLoadingData] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [userVouchers, setUserVouchers] = useState<any[]>([]);
  const [tierBenefits, setTierBenefits] = useState<TierBenefit[]>([]);
  const [refreshingPoints, setRefreshingPoints] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    // Refresh profile first to get latest points
    // Only refresh if user is logged in with access token
    if (accessToken) {
      console.log("🔄 Rewards: Refreshing profile to get latest points...");
      setRefreshingPoints(true);
      refreshProfile().then(() => {
        console.log("✅ Rewards: Profile refreshed, now fetching vouchers...");
        setRefreshingPoints(false);
        fetchData();
      });

      // Set up periodic refresh every 30 seconds to catch admin updates
      const intervalId = setInterval(() => {
        if (accessToken) {
          console.log("⏰ Rewards: Auto-refreshing points (30s interval)...");
          refreshProfile();
        }
      }, 30000); // 30 seconds

      // Cleanup interval on unmount
      return () => {
        console.log("🧹 Rewards: Cleaning up auto-refresh interval");
        clearInterval(intervalId);
      };
    } else {
      // No access token, just fetch data
      setRefreshingPoints(false);
      fetchData();
    }
  }, [user?.id, loading, navigate]);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      
      // Fetch user vouchers
      const vouchersResponse = await fetch(`${API_BASE}/user-vouchers?userId=${user?.id}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
      });
      
      if (vouchersResponse.ok) {
        const vouchersData = await vouchersResponse.json();
        setUserVouchers(vouchersData.vouchers || []);
      }

      // Fetch tier benefits
      const benefitsResponse = await fetch(`${API_BASE}/tier-benefits`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      
      if (benefitsResponse.ok) {
        const benefitsData = await benefitsResponse.json();
        setTierBenefits(benefitsData.benefits || []);
      }
    } catch (error) {
      console.error("Error fetching rewards data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleRefreshPoints = async () => {
    if (!accessToken) {
      console.log("ℹ️ Cannot refresh points without access token");
      toast.error("Please sign in to refresh points");
      return;
    }
    
    console.log("🔄 Manual refresh points triggered");
    setRefreshingPoints(true);
    try {
      await refreshProfile();
      toast.success("Points updated!");
      console.log("✅ Points refreshed successfully");
    } catch (error) {
      console.error("❌ Failed to refresh points:", error);
      toast.error("Failed to refresh points");
    } finally {
      setRefreshingPoints(false);
    }
  };

  const handleClaimVoucher = async (userVoucherId: string) => {
    if (!accessToken) return;
    
    setClaiming(userVoucherId);
    try {
      const response = await fetch(`${API_BASE}/claim-voucher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ userVoucherId }),
      });

      const data = await response.json();

      if (response.ok) {
        const promoCode = data.assignment?.promoCode;
        toast.success(
          promoCode
            ? `Voucher claimed! Your promo code: ${promoCode}`
            : "Voucher claimed successfully!"
        );
        fetchData(); // Refresh data
      } else {
        toast.error(data.error || "Failed to claim voucher");
      }
    } catch (error) {
      toast.error("Failed to claim voucher");
      console.error("Claim error:", error);
    } finally {
      setClaiming(null);
    }
  };

  if (loading || !user) {
    return null;
  }

  const getTierInfo = () => {
    const points = user.points || 0;
    if (points < 5000) {
      return { current: "Silver", next: "Gold", progress: points, target: 5000, color: "#9CA3AF" };
    } else if (points < 10000) {
      return { current: "Gold", next: "Diamond", progress: points - 5000, target: 5000, color: "#FFC107" };
    } else if (points < 20000) {
      return { current: "Diamond", next: "Platinum", progress: points - 10000, target: 10000, color: "#00BCD4" };
    } else {
      return { current: "Platinum", next: "Platinum", progress: 20000, target: 20000, color: "#9C27B0" };
    }
  };

  const tierInfo = getTierInfo();
  const progressPercentage = (tierInfo.progress / tierInfo.target) * 100;

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case "ticket":
        return <Ticket className="w-12 h-12" />;
      case "car":
        return <Car className="w-12 h-12" />;
      case "utensils":
        return <UtensilsCrossed className="w-12 h-12" />;
      case "award":
        return <Award className="w-12 h-12" />;
      default:
        return <Gift className="w-12 h-12" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Gold":
        return "#FFC107";
      case "Diamond":
        return "#00BCD4";
      case "Platinum":
        return "#9C27B0";
      default:
        return "#9CA3AF";
    }
  };

  // Get benefits for each tier
  const goldBenefits = tierBenefits.filter(b => b.tier === "Gold");
  const diamondBenefits = tierBenefits.filter(b => b.tier === "Diamond");
  const platinumBenefits = tierBenefits.filter(b => b.tier === "Platinum");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
      {/* Header */}
      <header className="px-6 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-lg font-medium"
              style={{ color: "#D91A60" }}
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-center flex-1" style={{ color: "#333333" }}>
              My Rewards
            </h1>
            <button
              onClick={handleRefreshPoints}
              disabled={refreshingPoints}
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/50 transition-colors"
              style={{ color: "#D91A60" }}
              title="Refresh points"
            >
              <RefreshCw className={`w-5 h-5 ${refreshingPoints ? "animate-spin" : ""}`} />
            </button>
          </div>
          
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logoImage} alt="Logo" className="h-24" />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-24 space-y-4">
        {/* User Tier Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 relative">
          {refreshingPoints && (
            <div className="absolute top-2 right-2">
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "#D91A60" }} />
            </div>
          )}
          <div className="flex items-start gap-4">
            {/* Tier Badge */}
            <div className="flex-shrink-0">
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center border-4"
                style={{ borderColor: tierInfo.color, backgroundColor: "#F5F5F5" }}
              >
                <Award className="w-10 h-10" style={{ color: tierInfo.color }} />
              </div>
            </div>
            
            {/* User Info */}
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1" style={{ color: "#333333" }}>
                {user.name || "Member"}
              </h2>
              <p className="text-sm mb-3" style={{ color: "#666666" }}>
                You are a <span className="font-bold">{tierInfo.current} Member!</span>
              </p>
              
              {tierInfo.current !== "Platinum" && (
                <>
                  <p className="text-sm mb-2" style={{ color: "#666666" }}>
                    {tierInfo.progress.toLocaleString()} / {tierInfo.target.toLocaleString()} points to reach{" "}
                    <span className="font-bold" style={{ color: getTierColor(tierInfo.next) }}>
                      {tierInfo.next}
                    </span>
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full transition-all duration-500"
                      style={{
                        width: `${progressPercentage}%`,
                        backgroundColor: "#D91A60",
                      }}
                    />
                  </div>
                </>
              )}
              
              {tierInfo.current === "Platinum" && (
                <p className="text-sm font-bold" style={{ color: getTierColor("Platinum") }}>
                  You've reached the highest tier!
                </p>
              )}
            </div>
          </div>
          
          {/* Total Points Display */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "#666666" }}>
              Total Loyalty Points
            </span>
            <span className="text-2xl font-bold" style={{ color: "#D91A60" }}>
              {user.points?.toLocaleString() || 0}
            </span>
          </div>
        </div>

        {/* Your Vouchers & Benefits */}
        <div>
          <h3 className="text-lg font-bold mb-3" style={{ color: "#333333" }}>
            Your Vouchers & Benefits
          </h3>
          
          {userVouchers.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-8 text-center">
              <Gift className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-muted-foreground">No vouchers available yet</p>
              <p className="text-xs text-gray-400 mt-1">Vouchers from the restaurant will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Active vouchers first, then claimed, then used */}
              {[...userVouchers]
                .sort((a, b) => {
                  // Fully used vouchers go to end
                  const aFullyUsed = a.used && (a.usedCount || 0) >= (a.voucher?.quantity || 1);
                  const bFullyUsed = b.used && (b.usedCount || 0) >= (b.voucher?.quantity || 1);
                  if (aFullyUsed && !bFullyUsed) return 1;
                  if (!aFullyUsed && bFullyUsed) return -1;
                  if (a.claimed && !b.claimed) return 1;
                  if (!a.claimed && b.claimed) return -1;
                  return 0;
                })
                .map((userVoucher) => {
                  const v = userVoucher.voucher;
                  const maxUses = v?.quantity || 1;
                  const usedCount = userVoucher.usedCount || 0;
                  const isFullyUsed = userVoucher.used && usedCount >= maxUses;
                  const hasRemainingUses = usedCount > 0 && usedCount < maxUses;
                  const isClaimed = userVoucher.claimed;
                  
                  const getDiscountBadge = () => {
                    if (v.discountType === "percentage" && v.discountValue) return `${v.discountValue}% OFF`;
                    if (v.discountType === "fixed" && v.discountValue) return `${formatIDR(v.discountValue)} OFF`;
                    if (v.discountType === "free_delivery") return "FREE DELIVERY";
                    if (v.discountType === "freebie") return "FREE ITEM";
                    return null;
                  };
                  
                  const discountBadge = getDiscountBadge();
                  
                  return (
                    <div
                      key={userVoucher.id}
                      className={`bg-white rounded-2xl shadow-md overflow-hidden transition-all ${
                        isFullyUsed ? "opacity-60" : ""
                      }`}
                    >
                      {/* Discount banner */}
                      {discountBadge && (
                        <div
                          className="px-4 py-1.5 text-center"
                          style={{
                            backgroundColor: isFullyUsed ? "#9CA3AF" : "#D91A60",
                          }}
                        >
                          <span className="text-white text-xs font-bold tracking-wider">
                            {discountBadge}
                          </span>
                        </div>
                      )}
                      
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Icon */}
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isFullyUsed ? "#E5E7EB" : "#D91A60" }}
                          >
                            <div className="text-white scale-75">
                              {getIconComponent(v.icon)}
                            </div>
                          </div>
                          
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-bold text-sm" style={{ color: isFullyUsed ? "#9CA3AF" : "#333333" }}>
                                {v.title}
                              </h4>
                              {/* Status badge */}
                              {isFullyUsed ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-500 shrink-0">
                                  <CheckCircle className="w-3 h-3" /> Used
                                </span>
                              ) : isClaimed ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-600 shrink-0">
                                  <CheckCircle className="w-3 h-3" /> Claimed
                                </span>
                              ) : null}
                            </div>
                            
                            {v.description && (
                              <p className="text-xs mb-1" style={{ color: "#666666" }}>
                                {v.description}
                              </p>
                            )}
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 text-xs" style={{ color: "#D91A60" }}>
                                <Clock className="w-3 h-3" />
                                Expires {v.expiryDate}
                              </span>
                              {maxUses > 1 && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  isFullyUsed
                                    ? "bg-gray-100 text-gray-400"
                                    : hasRemainingUses
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-gray-100 text-gray-600"
                                }`}>
                                  {isFullyUsed
                                    ? `0/${maxUses} left`
                                    : `${maxUses - usedCount}/${maxUses} left`}
                                </span>
                              )}
                            </div>
                            
                            {v.minOrderAmount > 0 && (
                              <p className="text-xs mt-1 text-gray-400">
                                Min. order {formatIDR(v.minOrderAmount)}
                              </p>
                            )}
                            
                            {v.conditions && (
                              <p className="text-xs mt-0.5" style={{ color: "#999999" }}>
                                {v.conditions}
                              </p>
                            )}
                            
                            {v.applicableCategories && v.applicableCategories.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                <span className="text-[10px] text-purple-600 font-medium">Valid for:</span>
                                {v.applicableCategories.map((cat) => (
                                  <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Claim button - only show if not yet claimed */}
                        {!isClaimed && !isFullyUsed && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <Button
                              onClick={() => handleClaimVoucher(userVoucher.id)}
                              disabled={claiming === userVoucher.id}
                              className="w-full rounded-full font-bold text-sm"
                              style={{ backgroundColor: "#D91A60", color: "#FFFFFF" }}
                            >
                              {claiming === userVoucher.id ? "Claiming..." : "CLAIM VOUCHER"}
                            </Button>
                          </div>
                        )}

                        {/* Promo code display - show after claiming */}
                        {isClaimed && !isFullyUsed && userVoucher.promoCode && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-1.5 text-center">Your Promo Code</p>
                            <div className="flex items-center gap-2">
                              <div
                                className="flex-1 bg-gray-50 border-2 border-dashed rounded-lg py-2 px-3 text-center"
                                style={{ borderColor: "#D91A60" }}
                              >
                                <span className="text-base font-bold tracking-widest" style={{ color: "#D91A60" }}>
                                  {userVoucher.promoCode}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(userVoucher.promoCode);
                                  toast.success("Promo code copied!");
                                }}
                                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                title="Copy code"
                              >
                                <Copy className="w-4 h-4 text-gray-600" />
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center mt-1.5">
                              Apply this code at checkout to get your discount
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Tier Upgrade Info */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <p className="text-center text-sm mb-6" style={{ color: "#666666" }}>
            Upgrade to{" "}
            <span className="font-bold" style={{ color: getTierColor("Gold") }}>Gold</span>,{" "}
            <span className="font-bold" style={{ color: getTierColor("Diamond") }}>Diamond</span>, or{" "}
            <span className="font-bold" style={{ color: getTierColor("Platinum") }}>Platinum</span>{" "}
            Badge & <span className="font-bold">unlock more benefits!</span>
          </p>
          
          {/* Tier Progress Visual */}
          <div className="relative mb-8">
            {/* Connection Line */}
            <div className="absolute top-8 left-0 right-0 flex items-center px-6 sm:px-12">
              <div className="flex-1 h-0.5 bg-gray-300 relative">
                {["Silver", "Gold", "Diamond", "Platinum"].map((tier, index) => {
                  const isActive = 
                    (tier === "Silver" && user.points >= 0) ||
                    (tier === "Gold" && user.points >= 5000) ||
                    (tier === "Diamond" && user.points >= 10000) ||
                    (tier === "Platinum" && user.points >= 20000);
                  
                  if (index === 3) return null; // Skip last dot
                  
                  return (
                    <div
                      key={`dot-${tier}`}
                      className="absolute w-3 h-3 rounded-full -translate-y-1/2"
                      style={{
                        left: `${(index / 3) * 100}%`,
                        backgroundColor: isActive ? getTierColor(tier) : "#E5E7EB",
                        top: "50%",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Tier Icons */}
            <div className="relative flex items-center justify-between px-4">
              {["Silver", "Gold", "Diamond", "Platinum"].map((tier, index) => {
                const isActive = 
                  (tier === "Silver" && user.points >= 0) ||
                  (tier === "Gold" && user.points >= 5000) ||
                  (tier === "Diamond" && user.points >= 10000) ||
                  (tier === "Platinum" && user.points >= 20000);
                
                const isCurrent = tier === tierInfo.current;
                
                return (
                  <div key={tier} className="relative z-10 flex flex-col items-center">
                    {/* Tier Badge */}
                    <div
                      className={`rounded-full flex items-center justify-center transition-all ${
                        isCurrent 
                          ? "w-16 h-16 border-4" 
                          : "w-12 h-12 border-3"
                      }`}
                      style={{
                        backgroundColor: isActive ? getTierColor(tier) : "#F3F4F6",
                        border: isCurrent ? `3px solid ${getTierColor(tier)}` : "none",
                        boxShadow: isCurrent ? `0 4px 12px ${getTierColor(tier)}50` : "0 2px 4px rgba(0,0,0,0.1)",
                      }}
                    >
                      <Award
                        className={isCurrent ? "w-8 h-8" : "w-6 h-6"}
                        style={{ color: isActive ? "#FFFFFF" : "#D1D5DB" }}
                      />
                    </div>
                    
                    {/* Tier Name */}
                    <p 
                      className={`font-bold mt-2 ${isCurrent ? "text-sm" : "text-xs"}`}
                      style={{ color: isActive ? getTierColor(tier) : "#9CA3AF" }}
                    >
                      {tier}
                    </p>
                    
                    {/* Current Badge */}
                    {isCurrent && (
                      <div 
                        className="mt-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ 
                          backgroundColor: `${getTierColor(tier)}20`,
                          color: getTierColor(tier)
                        }}
                      >
                        (Current)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tier Benefits Preview Cards */}
          <div className="overflow-x-auto pb-2 -mx-2 px-2">
            <div className="flex gap-3 min-w-max">
              {/* Gold Tier Card */}
              <div 
                className="flex-shrink-0 w-64 rounded-xl p-4 border-2 transition-all hover:shadow-lg"
                style={{
                  borderColor: tierInfo.current === "Gold" ? getTierColor("Gold") : "#E5E7EB",
                  backgroundColor: tierInfo.current === "Gold" ? `${getTierColor("Gold")}08` : "#FFFFFF"
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: getTierColor("Gold") }}
                  >
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold text-sm" style={{ color: getTierColor("Gold") }}>
                    GOLD MEMBER
                  </h4>
                </div>
                <div className="space-y-2 text-xs">
                  {goldBenefits.length > 0 ? (
                    goldBenefits.slice(0, 3).map((benefit, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Gold") }} />
                        <p style={{ color: "#333333" }}>
                          <span className="font-semibold">{benefit.title}</span>
                          {benefit.quantity && <span className="text-gray-500"> {benefit.quantity}</span>}
                        </p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Gold") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">12% Discount</span> <span className="text-gray-500">x5</span></p>
                      </div>
                      <p className="text-gray-500 text-xs ml-3">Expires by end of March</p>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Gold") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">Free Delivery</span> <span className="text-gray-500">(Dine in visit - No conditions)</span></p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Diamond Tier Card */}
              <div 
                className="flex-shrink-0 w-64 rounded-xl p-4 border-2 transition-all hover:shadow-lg"
                style={{
                  borderColor: tierInfo.current === "Diamond" ? getTierColor("Diamond") : "#E5E7EB",
                  backgroundColor: tierInfo.current === "Diamond" ? `${getTierColor("Diamond")}08` : "#FFFFFF"
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: getTierColor("Diamond") }}
                  >
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold text-sm" style={{ color: getTierColor("Diamond") }}>
                    DIAMOND MEMBER
                  </h4>
                </div>
                <div className="space-y-2 text-xs">
                  {diamondBenefits.length > 0 ? (
                    diamondBenefits.slice(0, 3).map((benefit, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Diamond") }} />
                        <p style={{ color: "#333333" }}>
                          <span className="font-semibold">{benefit.title}</span>
                          {benefit.quantity && <span className="text-gray-500"> {benefit.quantity}</span>}
                        </p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Diamond") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">13% Discount</span> <span className="text-gray-500">x10</span></p>
                      </div>
                      <p className="text-gray-500 text-xs ml-3">Expires by end of March</p>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Diamond") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">Free Delivery</span> <span className="text-gray-500">(Dine in visit - No conditions)</span></p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Platinum Tier Card */}
              <div 
                className="flex-shrink-0 w-64 rounded-xl p-4 border-2 transition-all hover:shadow-lg"
                style={{
                  borderColor: tierInfo.current === "Platinum" ? getTierColor("Platinum") : "#E5E7EB",
                  backgroundColor: tierInfo.current === "Platinum" ? `${getTierColor("Platinum")}08` : "#FFFFFF"
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: getTierColor("Platinum") }}
                  >
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-bold text-sm" style={{ color: getTierColor("Platinum") }}>
                    PLATINUM MEMBER
                  </h4>
                </div>
                <div className="space-y-2 text-xs">
                  {platinumBenefits.length > 0 ? (
                    platinumBenefits.slice(0, 3).map((benefit, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Platinum") }} />
                        <p style={{ color: "#333333" }}>
                          <span className="font-semibold">{benefit.title}</span>
                          {benefit.quantity && <span className="text-gray-500"> {benefit.quantity}</span>}
                        </p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Platinum") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">15% Discount</span> <span className="text-gray-500">x10</span></p>
                      </div>
                      <p className="text-gray-500 text-xs ml-3">Expires by end of March</p>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getTierColor("Platinum") }} />
                        <p style={{ color: "#333333" }}><span className="font-semibold">Free Delivery</span> <span className="text-gray-500">(Dine in visit - No conditions)</span></p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits by Tier */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Gold Benefits */}
          {goldBenefits.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-4">
              <h4 
                className="text-center font-bold mb-3 pb-2 border-b-2"
                style={{ color: getTierColor("Gold"), borderColor: getTierColor("Gold") }}
              >
                <Award className="w-6 h-6 inline-block mr-1" />
                Gold Member
              </h4>
              <div className="space-y-3">
                {goldBenefits.map((benefit) => (
                  <div key={benefit.id} className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: getTierColor("Gold") + "20" }}
                    >
                      <div style={{ color: getTierColor("Gold") }}>
                        {getIconComponent(benefit.icon)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: "#333333" }}>
                        {benefit.title}{" "}
                        {benefit.quantity && (
                          <span className="text-xs" style={{ color: "#666666" }}>
                            {benefit.quantity}
                          </span>
                        )}
                      </p>
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: "#D91A60" }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: "#999999" }}>
                        {benefit.conditions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diamond Benefits */}
          {diamondBenefits.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-4">
              <h4 
                className="text-center font-bold mb-3 pb-2 border-b-2"
                style={{ color: getTierColor("Diamond"), borderColor: getTierColor("Diamond") }}
              >
                <Award className="w-6 h-6 inline-block mr-1" />
                Diamond Member
              </h4>
              <div className="space-y-3">
                {diamondBenefits.map((benefit) => (
                  <div key={benefit.id} className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: getTierColor("Diamond") + "20" }}
                    >
                      <div style={{ color: getTierColor("Diamond") }}>
                        {getIconComponent(benefit.icon)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: "#333333" }}>
                        {benefit.title}{" "}
                        {benefit.quantity && (
                          <span className="text-xs" style={{ color: "#666666" }}>
                            {benefit.quantity}
                          </span>
                        )}
                      </p>
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: "#D91A60" }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: "#999999" }}>
                        {benefit.conditions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platinum Benefits */}
          {platinumBenefits.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-4">
              <h4 
                className="text-center font-bold mb-3 pb-2 border-b-2"
                style={{ color: getTierColor("Platinum"), borderColor: getTierColor("Platinum") }}
              >
                <Award className="w-6 h-6 inline-block mr-1" />
                Platinum Member
              </h4>
              <div className="space-y-3">
                {platinumBenefits.map((benefit) => (
                  <div key={benefit.id} className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: getTierColor("Platinum") + "20" }}
                    >
                      <div style={{ color: getTierColor("Platinum") }}>
                        {getIconComponent(benefit.icon)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: "#333333" }}>
                        {benefit.title}{" "}
                        {benefit.quantity && (
                          <span className="text-xs" style={{ color: "#666666" }}>
                            {benefit.quantity}
                          </span>
                        )}
                      </p>
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: "#D91A60" }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: "#999999" }}>
                        {benefit.conditions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* WhatsApp Button */}
      <div className="sticky bottom-0 left-0 right-0 z-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => window.open(`https://wa.me/${getWhatsAppNumber()}`, "_blank")}
            className="w-full py-4 flex items-center justify-center gap-3 font-bold text-lg text-white"
            style={{ backgroundColor: "#D91A60" }}
          >
            <MessageCircle className="w-6 h-6" />
            {getWhatsAppDisplay()}
          </button>
        </div>
      </div>
    </div>
  );
}