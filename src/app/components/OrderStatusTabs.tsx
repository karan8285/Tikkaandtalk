/**
 * OrderStatusTabs — Horizontal scrollable status-based tabs for orders.
 * Used across Admin, StaffAdmin, and StaffCashier portals.
 */
import { useRef, useEffect } from "react";
import {
  ShoppingCart, Clock, CheckCircle, ChefHat, Package, Truck,
  CircleCheck, Archive, XCircle, CalendarClock, List
} from "lucide-react";

const ORDER_STATUS_TAB_CONFIG: {
  value: string;
  label: string;
  icon: React.ElementType;
  color: string;
  activeTextClass?: string;
}[] = [
  { value: "all", label: "All", icon: List, color: "#6B7280" },
  { value: "pending", label: "Pending", icon: Clock, color: "#F97316" },
  { value: "confirmed", label: "Confirmed", icon: CheckCircle, color: "#14B8A6" },
  { value: "cooking", label: "Cooking", icon: ChefHat, color: "#EA580C" },
  { value: "ready", label: "Ready", icon: Package, color: "#8B5CF6" },
  { value: "out_for_delivery", label: "Out for Delivery", icon: Truck, color: "#F59E0B" },
  { value: "delivered", label: "Delivered", icon: CircleCheck, color: "#10B981" },
  { value: "scheduled", label: "Scheduled", icon: CalendarClock, color: "#3B82F6" },
  { value: "closed", label: "Closed", icon: Archive, color: "#6B7280" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "#EF4444" },
];

interface OrderStatusTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  statusCounts: Record<string, number>;
  totalOrders: number;
  brandColor?: string;
}

export function OrderStatusTabs({
  activeTab,
  onTabChange,
  statusCounts,
  totalOrders,
  brandColor = "#E11D48",
}: OrderStatusTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view on mount and when activeTab changes
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const tab = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();

      // Check if tab is outside the visible area
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeTab]);

  const getCount = (status: string): number => {
    if (status === "all") return totalOrders;
    return statusCounts[status] || 0;
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
        {ORDER_STATUS_TAB_CONFIG.map((tab) => {
          const count = getCount(tab.value);
          const isActive = activeTab === tab.value;
          const Icon = tab.icon;
          const tabColor = tab.value === "all" ? brandColor : tab.color;

          return (
            <button
              key={tab.value}
              ref={isActive ? activeTabRef : undefined}
              onClick={() => onTabChange(tab.value)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap
                transition-all duration-200 shrink-0 border
                ${isActive
                  ? "text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-50 border-gray-200"
                }
              `}
              style={isActive ? {
                backgroundColor: tabColor,
                borderColor: tabColor,
              } : {}}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-[10px] min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full font-bold leading-none ${
                    isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { ORDER_STATUS_TAB_CONFIG };
