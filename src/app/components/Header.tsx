import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router";
import { useCart } from "../lib/cart";
import logoImage from "../lib/logo";

interface HeaderProps {
  showBack?: boolean;
  title?: string;
  showCart?: boolean;
  rightContent?: React.ReactNode;
}

export function Header({ showBack = false, title, showCart = true, rightContent }: HeaderProps) {
  const navigate = useNavigate();
  const { totalItems } = useCart();

  return (
    <header className="bg-secondary text-secondary-foreground py-4 px-4 sticky top-0 z-50">
      <div className="max-w-md mx-auto flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1">
          {title ? (
            <h1 className="text-lg font-semibold">{title}</h1>
          ) : (
            <img 
              src={logoImage} 
              alt="Tikka N Talk - An Indian Kitchen" 
              className="h-10 w-auto"
              style={{ 
                filter: "brightness(0) invert(1)",
                objectFit: "contain"
              }}
            />
          )}
        </div>
        {rightContent || (showCart && (
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
        ))}
      </div>
    </header>
  );
}