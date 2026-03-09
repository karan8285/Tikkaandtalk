import { Button } from "./ui/button";
import { ShoppingCart } from "lucide-react";
import { formatIDR } from "../lib/currency";

interface SpecialCardProps {
  title: string;
  description: string;
  originalPrice: number;
  discountedPrice: number;
  image: string;
  onUnlock: () => void;
  onAddToCart?: () => void;
}

export function SpecialCard({
  title,
  description,
  originalPrice,
  discountedPrice,
  image,
  onUnlock,
  onAddToCart,
}: SpecialCardProps) {
  const discount = Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="relative h-48">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-3 right-3 bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-semibold">
          {discount}% OFF
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">
              {formatIDR(discountedPrice)}
            </span>
            <span className="text-sm text-muted-foreground line-through">
              {formatIDR(originalPrice)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {onAddToCart && (
            <Button
              onClick={onAddToCart}
              variant="outline"
              className="flex-1 border-primary text-primary hover:bg-primary/10"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Add to Cart
            </Button>
          )}
          <Button
            onClick={onUnlock}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Order Now
          </Button>
        </div>
      </div>
    </div>
  );
}