/**
 * OrderTimeline — Beautiful vertical timeline showing the complete story of an order.
 * Displays status changes, who performed them, and when.
 */
import { 
  Clock, ShoppingCart, CheckCircle2, Flame, UtensilsCrossed, Truck, Package, 
  XCircle, CreditCard, CalendarClock, DollarSign, User, Shield, ChefHat, 
  Bike, Settings
} from "lucide-react";
import { BRAND_COLOR } from "../lib/config";

interface Actor {
  name: string;
  role: string;
}

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  label: string;
  actor?: Actor;
}

interface OrderTimelineProps {
  statusHistory: StatusHistoryItem[];
  createdAt?: string;
  customerName?: string;
}

const STATUS_ICON_MAP: Record<string, any> = {
  pending: ShoppingCart,
  confirmed: CheckCircle2,
  cooking: Flame,
  ready: UtensilsCrossed,
  out_for_delivery: Truck,
  delivered: Package,
  closed: CheckCircle2,
  cancelled: XCircle,
  payment_received: CreditCard,
  delivery_fee_set: DollarSign,
  scheduled: CalendarClock,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: "bg-orange-500",
  confirmed: "bg-teal-500",
  cooking: "bg-orange-600",
  ready: "bg-purple-500",
  out_for_delivery: "bg-blue-500",
  delivered: "bg-green-500",
  closed: "bg-green-600",
  cancelled: "bg-red-500",
  payment_received: "bg-emerald-500",
  delivery_fee_set: "bg-indigo-500",
  scheduled: "bg-blue-400",
};

const ROLE_ICON_MAP: Record<string, any> = {
  customer: User,
  admin: Shield,
  superuser: Shield,
  manager: Shield,
  kitchen: ChefHat,
  delivery: Bike,
  cashier: CreditCard,
  system: Settings,
  user: User,
  staff: User,
};

const ROLE_LABEL_MAP: Record<string, string> = {
  customer: "Customer",
  admin: "Admin",
  superuser: "Super User",
  manager: "Manager",
  kitchen: "Kitchen",
  delivery: "Delivery",
  cashier: "Cashier",
  system: "System",
  user: "User",
  staff: "Staff",
};

function formatTimelineDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago - ${timeStr}`;
  if (diffHours < 24) return `${diffHours}h ago - ${timeStr}`;
  
  return date.toLocaleDateString([], { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
}

function getTimeBetween(from: string, to: string): string {
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  if (diffMs < 0) return "";
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  const remainMins = diffMins % 60;
  if (diffHours < 24) return `${diffHours}h ${remainMins}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

export function OrderTimeline({ statusHistory, createdAt, customerName }: OrderTimelineProps) {
  if (!statusHistory || statusHistory.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No timeline data available</p>
      </div>
    );
  }

  // Sort by timestamp ascending
  const sorted = [...statusHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="relative pl-1">
      {/* Vertical line */}
      <div 
        className="absolute left-[15px] top-3 bottom-3 w-[2px] rounded-full"
        style={{ backgroundColor: `${BRAND_COLOR}20` }}
      />

      <div className="space-y-0">
        {sorted.map((item, index) => {
          const IconComponent = STATUS_ICON_MAP[item.status] || Clock;
          const colorClass = STATUS_COLOR_MAP[item.status] || "bg-gray-400";
          const RoleIcon = item.actor ? (ROLE_ICON_MAP[item.actor.role] || User) : null;
          const roleLabel = item.actor ? (ROLE_LABEL_MAP[item.actor.role] || item.actor.role) : null;
          const isFirst = index === 0;
          const isLast = index === sorted.length - 1;
          const isCancelled = item.status === "cancelled";
          const timeBetween = index > 0 ? getTimeBetween(sorted[index - 1].timestamp, item.timestamp) : null;

          return (
            <div key={`${item.status}-${index}`} className="relative flex items-start gap-3 group">
              {/* Timeline dot */}
              <div 
                className={`relative z-10 flex-shrink-0 w-[32px] h-[32px] rounded-full flex items-center justify-center shadow-sm ${
                  isCancelled ? 'bg-red-500' : isLast ? colorClass : colorClass + ' opacity-90'
                }`}
                style={!isCancelled && isLast ? {} : {}}
              >
                <IconComponent className="w-4 h-4 text-white" />
              </div>

              {/* Content */}
              <div className={`flex-1 pb-5 ${isLast ? 'pb-1' : ''}`}>
                {/* Time between indicator */}
                {timeBetween && (
                  <div className="absolute -top-1 left-[40px] text-[10px] text-gray-400 font-mono">
                    +{timeBetween}
                  </div>
                )}

                <div className={`rounded-lg border p-3 ${
                  isCancelled ? 'border-red-200 bg-red-50' :
                  isLast ? 'border-gray-200 bg-white shadow-sm' : 
                  'border-gray-100 bg-gray-50/50'
                } ${timeBetween ? 'mt-3' : 'mt-0'}`}>
                  {/* Status label */}
                  <p className={`font-semibold text-sm ${
                    isCancelled ? 'text-red-700' : 'text-gray-800'
                  }`}>
                    {item.label}
                  </p>

                  {/* Actor info */}
                  {item.actor && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {RoleIcon && (
                        <RoleIcon className="w-3 h-3 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{item.actor.name}</span>
                        {roleLabel && (
                          <span className="text-gray-400"> ({roleLabel})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Timestamp */}
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimelineDate(item.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total duration */}
      {sorted.length >= 2 && (
        <div 
          className="mt-3 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2"
          style={{ backgroundColor: `${BRAND_COLOR}08`, color: BRAND_COLOR }}
        >
          <Clock className="w-3.5 h-3.5" />
          Total time: {getTimeBetween(sorted[0].timestamp, sorted[sorted.length - 1].timestamp)}
        </div>
      )}
    </div>
  );
}