// Helper function to assign appropriate image based on dish name and category
export function getImageForDish(name: string, category: string): string {
  const dishName = name.toLowerCase();
  
  // Soup images
  if (category === "Soup") {
    if (dishName.includes("tomato")) return "https://images.unsplash.com/photo-1713374989663-e5b165462fef?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("corn")) return "https://images.unsplash.com/photo-1665594051407-7385d281ad76?w=400&h=300&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1713374989663-e5b165462fef?w=400&h=300&fit=crop&q=80"; // Default soup
  }
  
  // Appetizer Veg images
  if (category === "Appetizer Veg") {
    if (dishName.includes("samosa")) return "https://images.unsplash.com/photo-1591465619339-60fce055bc82?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("fries")) return "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("pakora") || dishName.includes("pakoda")) return "https://images.unsplash.com/photo-1666190091191-0cd0c5c8c5b5?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("paneer tikka")) return "https://images.unsplash.com/photo-1666001120694-3ebe8fd207be?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("chilli paneer")) return "https://images.unsplash.com/photo-1690401767645-595de0e0e5f8?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("paneer")) return "https://images.unsplash.com/photo-1666001120694-3ebe8fd207be?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("momos")) return "https://images.unsplash.com/photo-1694850184798-320a8e10bb5e?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("gobhi") || dishName.includes("cauliflower")) return "https://images.unsplash.com/photo-1613743983303-b3e89f8a2b80?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("mushroom")) return "https://images.unsplash.com/photo-1690809867449-c22269f65070?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("chat") || dishName.includes("chaat") || dishName.includes("pani") || dishName.includes("tikki")) return "https://images.unsplash.com/photo-1769019401093-38f564d6408a?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("papad")) return "https://images.unsplash.com/photo-1646242234718-ab86cd1b2bfa?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("seekh") || dishName.includes("kabab") || dishName.includes("kebab")) return "https://images.unsplash.com/photo-1673238111115-18d3da6ec22b?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("manchurian")) return "https://images.unsplash.com/photo-1666190091191-0cd0c5c8c5b5?w=400&h=300&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1666190091191-0cd0c5c8c5b5?w=400&h=300&fit=crop&q=80"; // Default veg appetizer
  }
  
  // Appetizer Non-Veg images
  if (category === "Appetizer Non-Veg") {
    if (dishName.includes("chicken tikka")) return "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("tandoori chicken")) return "https://images.unsplash.com/photo-1727280376746-b89107a5b0df?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("seekh") || dishName.includes("kabab") || dishName.includes("kebab") || dishName.includes("tangdi") || dishName.includes("kalmi") || dishName.includes("gilafi")) return "https://images.unsplash.com/photo-1705359573325-f2006d5e459f?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("chicken 65")) return "https://images.unsplash.com/photo-1711670546671-d15cd432fc4c?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("lollipop")) return "https://images.unsplash.com/photo-1766589221509-61951995e435?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("chicken pakora")) return "https://images.unsplash.com/photo-1666190091191-0cd0c5c8c5b5?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("manchurian") || dishName.includes("chilli chicken") || dishName.includes("dragon")) return "https://images.unsplash.com/photo-1682622110433-65513a55d7da?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("fish")) return "https://images.unsplash.com/photo-1564677877393-2dbc65af5e41?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("prawn")) return "https://images.unsplash.com/photo-1669032667712-4402633fb1e0?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("momos")) return "https://images.unsplash.com/photo-1694850184798-320a8e10bb5e?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("egg bhurji")) return "https://images.unsplash.com/photo-1644289450169-bc58aa16bacb?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("egg boil")) return "https://images.unsplash.com/photo-1591100497919-d3f8bab8ffab?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("egg")) return "https://images.unsplash.com/photo-1644289450169-bc58aa16bacb?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("mutton")) return "https://images.unsplash.com/photo-1652545296892-3787063f8b4d?w=400&h=300&fit=crop&q=80";
    if (dishName.includes("afghani") || dishName.includes("bhuna")) return "https://images.unsplash.com/photo-1727280376746-b89107a5b0df?w=400&h=300&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop&q=80"; // Default chicken tikka
  }
  
  // Set Thali images
  if (category === "Set Thali") {
    return "https://images.unsplash.com/photo-1672477179695-7276b0602fa9?w=400&h=300&fit=crop&q=80";
  }
  
  // Default fallback
  return "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop&q=80";
}
