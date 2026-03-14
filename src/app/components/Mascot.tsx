import { useState, useEffect, useMemo } from "react";
import { APP_CONFIG } from "../lib/config";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { useMascot } from "../lib/mascot-context";
import { X } from "lucide-react";
import defaultMascotImage from "figma:asset/368d19b64b9fd96f08e72da8cb3e1e0183c602ac.png";

// ─── Page types the mascot understands ──────────────────────────

export type MascotPage =
  | "home"
  | "menu"
  | "cart"
  | "rewards"
  | "orderHistory"
  | "orderTracking"
  | "profile"
  | "celebrations";

export type MascotVariant = "inline" | "floating";

// ─── Context-aware message system ───────────────────────────────

interface MascotContext {
  page: MascotPage;
  userName?: string;
  isLoggedIn: boolean;
  cartItemCount: number;
  activeOrders: number;
  availableRewards: number;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getMealSuggestion(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Start your day with a delicious breakfast!";
  if (hour < 15) return "What would you like to eat today?";
  if (hour < 18) return "Time for a tasty snack!";
  return "Ready for a hearty dinner?";
}

// Page-specific messages with contextual awareness
function getMascotMessage(ctx: MascotContext): { greeting: string; message: string; emoji: string } {
  const timeGreeting = getTimeGreeting();
  const name = ctx.userName || "there";
  const greeting = `${timeGreeting}, ${name}!`;
  const shortGreeting = ctx.userName ? `Hey ${name}!` : "Hey there!";

  switch (ctx.page) {
    // ── Home: full contextual greeting ──
    case "home": {
      if (ctx.activeOrders > 0) {
        return {
          greeting,
          message: ctx.activeOrders === 1
            ? "Your order is being prepared with love! Track it anytime."
            : `You have ${ctx.activeOrders} active orders cooking!`,
          emoji: "👨‍🍳",
        };
      }
      if (ctx.cartItemCount > 0) {
        return {
          greeting,
          message: ctx.cartItemCount === 1
            ? "You have 1 item waiting in your cart. Ready to order?"
            : `${ctx.cartItemCount} delicious items in your cart!`,
          emoji: "🛒",
        };
      }
      if (ctx.availableRewards > 0) {
        return {
          greeting,
          message: `You have ${ctx.availableRewards} reward${ctx.availableRewards > 1 ? "s" : ""} to redeem!`,
          emoji: "🎁",
        };
      }
      if (!ctx.isLoggedIn) {
        return {
          greeting: `${timeGreeting}!`,
          message: APP_CONFIG.mascot.guestMessage,
          emoji: "👋",
        };
      }
      return { greeting, message: getMealSuggestion(), emoji: "🤤" };
    }

    // ── Menu: food exploration tips ──
    case "menu": {
      const tips = [
        { message: "Our chef recommends trying something spicy today!", emoji: "🌶️" },
        { message: "Looking for something new? Check our bestsellers!", emoji: "⭐" },
        { message: "Pair your main with a refreshing lassi!", emoji: "🥤" },
        { message: "Don't miss our special naan varieties!", emoji: "🫓" },
        { message: "Everything is made fresh to order!", emoji: "✨" },
      ];
      const tip = tips[Math.floor(Date.now() / 60000) % tips.length]; // rotate every minute
      if (ctx.cartItemCount > 0) {
        return {
          greeting: shortGreeting,
          message: `${ctx.cartItemCount} item${ctx.cartItemCount > 1 ? "s" : ""} in cart. Add more or checkout!`,
          emoji: "🛒",
        };
      }
      return { greeting: shortGreeting, ...tip };
    }

    // ── Cart: checkout encouragement ──
    case "cart": {
      if (ctx.cartItemCount === 0) {
        return {
          greeting: shortGreeting,
          message: "Your cart is empty. Let's fill it with something delicious!",
          emoji: "🍽️",
        };
      }
      if (ctx.cartItemCount >= 3) {
        return {
          greeting: "Great choices!",
          message: "That's a feast! Ready to place your order?",
          emoji: "🎉",
        };
      }
      return {
        greeting: "Almost there!",
        message: "Your food is just a tap away. Checkout now!",
        emoji: "😋",
      };
    }

    // ── Rewards: points & motivation ──
    case "rewards": {
      if (ctx.availableRewards > 0) {
        return {
          greeting: "Congrats! 🎊",
          message: `You have ${ctx.availableRewards} reward${ctx.availableRewards > 1 ? "s" : ""} ready to use!`,
          emoji: "🏆",
        };
      }
      return {
        greeting: shortGreeting,
        message: "Keep ordering to earn more points and unlock rewards!",
        emoji: "💎",
      };
    }

    // ── Order History: reorder nudge ──
    case "orderHistory": {
      return {
        greeting: shortGreeting,
        message: "Craving something you had before? Reorder with one tap!",
        emoji: "🔄",
      };
    }

    // ── Order Tracking: patience & fun ──
    case "orderTracking": {
      const trackingMsgs = [
        { message: "Your food is being prepared with love!", emoji: "❤️" },
        { message: "Our chef is working on your order right now!", emoji: "👨‍🍳" },
        { message: "Good things take a little time. Almost ready!", emoji: "⏳" },
        { message: "The aroma is building up in the kitchen!", emoji: "😍" },
      ];
      const msg = trackingMsgs[Math.floor(Date.now() / 30000) % trackingMsgs.length];
      return { greeting: "Sit tight!", ...msg };
    }

    // ── Profile ──
    case "profile": {
      return {
        greeting: shortGreeting,
        message: "You're looking great! Keep earning loyalty points!",
        emoji: "⭐",
      };
    }

    // ── Celebrations / Party Packages ──
    case "celebrations": {
      const partyMsgs = [
        { message: "Planning a party? We'll make it unforgettable!", emoji: "🎉" },
        { message: "Let us handle the food & fun for your special day!", emoji: "🥳" },
        { message: "From birthdays to corporate events — we've got you!", emoji: "🎊" },
      ];
      const partyMsg = partyMsgs[Math.floor(Date.now() / 60000) % partyMsgs.length];
      return { greeting: shortGreeting, ...partyMsg };
    }

    default:
      return { greeting, message: APP_CONFIG.mascot.defaultMessage, emoji: "🍛" };
  }
}

// ─── Size config per page ───────────────────────────────────────

function getMascotSize(page: MascotPage): number {
  switch (page) {
    case "home": return 110;
    case "cart": return 90;
    case "menu": return 75;
    case "rewards": return 80;
    case "orderHistory": return 70;
    case "orderTracking": return 70;
    case "profile": return 75;
    case "celebrations": return 90;
    default: return 75;
  }
}

function getVariantForPage(page: MascotPage): MascotVariant {
  switch (page) {
    case "home":
    case "cart":
    case "celebrations":
      return "inline";
    default:
      return "floating";
  }
}

// ─── Main Mascot Component ──────────────────────────────────────

interface MascotProps {
  page?: MascotPage;
  activeOrders?: number;
  availableRewards?: number;
  className?: string;
  /** Override variant (otherwise auto-determined by page) */
  variant?: MascotVariant;
  /** Position mode for floating variant: "fixed" for mobile, "absolute" for desktop phone frame */
  positionMode?: "fixed" | "absolute";
}

export function Mascot({
  page = "home",
  activeOrders = 0,
  availableRewards = 0,
  className = "",
  variant: variantOverride,
  positionMode = "fixed",
}: MascotProps) {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const { isMascotVisible, hideMascot } = useMascot();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const variant = variantOverride ?? getVariantForPage(page);
  const size = getMascotSize(page);

  // Fade in on mount
  useEffect(() => {
    if (!isMascotVisible) return;
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, [isMascotVisible]);

  const { greeting, message, emoji } = useMemo(
    () =>
      getMascotMessage({
        page,
        userName: user?.name?.split(" ")[0],
        isLoggedIn: !!user,
        cartItemCount: totalItems,
        activeOrders,
        availableRewards,
      }),
    [page, user, totalItems, activeOrders, availableRewards]
  );

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      hideMascot();
      setIsDismissing(false);
      setIsVisible(false);
    }, 300);
  };

  if (!isMascotVisible) return null;

  const brandColor = APP_CONFIG.brand.primaryColor;
  const mascotSrc = APP_CONFIG.mascot.customImageUrl || defaultMascotImage;
  const animatingOut = isDismissing;

  // ── Floating variant (bottom-right bubble) ──
  if (variant === "floating") {
    const posClass = positionMode === "absolute" ? "absolute" : "fixed";

    return (
      <>
        <div
          className={`${posClass} z-40 ${className}`}
          style={{
            bottom: "80px",
            right: "12px",
            opacity: isVisible && !animatingOut ? 1 : 0,
            transform: isVisible && !animatingOut ? "translateY(0) scale(1)" : "translateY(20px) scale(0.8)",
            transition: "opacity 0.35s ease-out, transform 0.35s ease-out",
            pointerEvents: isVisible && !animatingOut ? "auto" : "none",
          }}
        >
          {/* Speech bubble above mascot */}
          <div
            className="relative rounded-xl px-3 py-2.5 shadow-md mb-1 max-w-[200px]"
            style={{
              backgroundColor: "white",
              border: `1.5px solid ${brandColor}25`,
            }}
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
              aria-label="Dismiss mascot"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>

            <p className="text-xs font-semibold leading-snug" style={{ color: brandColor }}>
              {greeting}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
              {message} {emoji}
            </p>

            {/* Bubble arrow pointing down */}
            <div
              className="absolute -bottom-[7px] right-6 w-0 h-0"
              style={{
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "7px solid white",
                filter: `drop-shadow(0 1px 0 ${brandColor}20)`,
              }}
            />
          </div>

          {/* Mascot image */}
          <div className="flex justify-end mascot-float">
            <img
              src={mascotSrc}
              alt={`${APP_CONFIG.restaurant.name} mascot`}
              className="object-contain"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))",
              }}
            />
          </div>
        </div>

        <style>{`
          .mascot-float {
            animation: mascotFloat 3s ease-in-out infinite;
          }
          @keyframes mascotFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
        `}</style>
      </>
    );
  }

  // ── Inline variant (speech bubble + mascot side by side) ──
  return (
    <div
      className={`px-4 sm:px-5 ${className}`}
      style={{
        opacity: isVisible && !animatingOut ? 1 : 0,
        transform: isVisible && !animatingOut ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
      }}
    >
      <div className="max-w-lg mx-auto flex items-center gap-1 relative">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-sm bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
          aria-label="Dismiss mascot"
        >
          <X className="w-3 h-3 text-gray-400" />
        </button>

        {/* Speech Bubble */}
        <div className="flex-1 min-w-0">
          <div
            className="relative rounded-2xl p-3.5 sm:p-4 shadow-sm"
            style={{
              backgroundColor: "white",
              border: `1.5px solid ${brandColor}20`,
            }}
          >
            {/* Bubble arrow pointing right */}
            <div
              className="absolute top-1/2 -right-[8px] -translate-y-1/2 w-0 h-0"
              style={{
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "8px solid white",
                filter: `drop-shadow(1px 0 0 ${brandColor}20)`,
              }}
            />
            <p
              className="text-sm sm:text-base font-semibold leading-snug"
              style={{ color: brandColor }}
            >
              {greeting}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 leading-snug">
              {message} {emoji}
            </p>
          </div>
        </div>

        {/* Mascot Character */}
        <div className="flex-shrink-0 mascot-float" style={{ width: `${size}px`, height: `${size}px` }}>
          <img
            src={mascotSrc}
            alt={`${APP_CONFIG.restaurant.name} mascot`}
            className="w-full h-full object-contain"
            style={{
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.12))",
            }}
          />
        </div>
      </div>

      <style>{`
        .mascot-float {
          animation: mascotFloat 3s ease-in-out infinite;
        }
        @keyframes mascotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}