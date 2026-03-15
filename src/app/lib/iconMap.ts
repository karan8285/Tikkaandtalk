// ================================================================
//  ICON MAP  —  Maps string icon names to lucide-react components
// ================================================================
//
//  Used by Home.tsx (to render categories from server config)
//  and by HomeLayoutAdmin.tsx (for the icon picker).
//
//  To add a new icon option, just add it to this object.
// ================================================================

import {
  ChefHat,
  Baby,
  Zap,
  UtensilsCrossed,
  PartyPopper,
  Pizza,
  Coffee,
  IceCreamCone,
  Salad,
  Soup,
  Sandwich,
  Wine,
  Beer,
  CakeSlice,
  Drumstick,
  Flame,
  Heart,
  Star,
  Sparkles,
  Gift,
  ShoppingBag,
  Percent,
  Clock,
  Truck,
  Leaf,
  Fish,
  Egg,
  Cherry,
  Apple,
  Grape,
  Citrus,
  Cookie,
  Croissant,
  Popcorn,
  Candy,
  Milk,
  GlassWater,
  HandPlatter,
  Crown,
  Trophy,
  Gem,
  Tag,
  Ticket,
  CalendarHeart,
  Store,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  ChefHat,
  Baby,
  Zap,
  UtensilsCrossed,
  PartyPopper,
  Pizza,
  Coffee,
  IceCreamCone,
  Salad,
  Soup,
  Sandwich,
  Wine,
  Beer,
  CakeSlice,
  Drumstick,
  Flame,
  Heart,
  Star,
  Sparkles,
  Gift,
  ShoppingBag,
  Percent,
  Clock,
  Truck,
  Leaf,
  Fish,
  Egg,
  Cherry,
  Apple,
  Grape,
  Citrus,
  Cookie,
  Croissant,
  Popcorn,
  Candy,
  Milk,
  GlassWater,
  HandPlatter,
  Crown,
  Trophy,
  Gem,
  Tag,
  Ticket,
  CalendarHeart,
  Store,
  Utensils,
};

// Grouped for the icon picker UI
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: "Food & Drinks",
    icons: [
      "ChefHat", "UtensilsCrossed", "Utensils", "HandPlatter", "Pizza", "Sandwich",
      "Salad", "Soup", "Drumstick", "Fish", "Egg", "CakeSlice", "Cookie",
      "Croissant", "IceCreamCone", "Popcorn", "Candy", "Coffee", "Wine",
      "Beer", "Milk", "GlassWater",
    ],
  },
  {
    label: "Fruits & Vegetables",
    icons: ["Cherry", "Apple", "Grape", "Citrus", "Leaf"],
  },
  {
    label: "Specials & Promos",
    icons: [
      "Zap", "Flame", "Star", "Sparkles", "Percent", "Tag", "Ticket",
      "Crown", "Trophy", "Gem",
    ],
  },
  {
    label: "Categories",
    icons: [
      "Baby", "PartyPopper", "CalendarHeart", "Gift", "Heart",
      "ShoppingBag", "Clock", "Truck", "Store",
    ],
  },
];

// Get icon component by name with fallback
export function getIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] || UtensilsCrossed;
}
