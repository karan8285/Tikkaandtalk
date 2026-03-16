import React from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useCart } from "../lib/cart";
import { useRestaurantLogo } from "../lib/useRestaurantLogo";
import { LOGO_ALT, APP_CONFIG } from "../lib/config";
import { NotificationBell } from "./NotificationBell";

interface HeaderProps {
  showBack?: boolean;
  title?: string;
  showCart?: boolean;
  rightContent?: React.ReactNode;
  onBack?: () => void;
}

export function Header({ showBack = false, title, showCart = true, rightContent, onBack }: HeaderProps) {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const { logo, loading: logoLoading } = useRestaurantLogo();

  return (
    <header className="bg-secondary text-secondary-foreground py-3 sm:py-4 px-4 sticky top-0 z-50">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => {
              if (onBack) {
                onBack();
              } else if (window.history.state?.idx > 0) {
                navigate(-1);
              } else {
                navigate("/", { replace: true });
              }
            }}
            className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {title ? (
            <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
          ) : logoLoading ? (
            /* Show text fallback while logo is loading to avoid SVG flash */
            <span className="text-base sm:text-lg font-bold truncate opacity-90">
              {APP_CONFIG.restaurant.name}
            </span>
          ) : (
            <img
              src={logo}
              alt={LOGO_ALT}
              className="h-8 sm:h-10 w-auto"
              style={{
                filter: "brightness(0) invert(1)",
                objectFit: "contain"
              }}
            />
          )}
        </div>
        {rightContent || (showCart && (
          <div className="flex items-center gap-0.5">
            <NotificationBell />
            <button
              onClick={() => navigate("/cart")}
              className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="View cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </header>
  );
}