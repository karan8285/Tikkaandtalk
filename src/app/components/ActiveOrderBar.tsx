import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { getShortOrderId } from "../lib/orderUtils";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ChevronRight } from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface ActiveOrder {
  id: string;
  orderNumber?: string;
  status: string;
  deliveryMethod: string;
  items: Array<{ title: string; quantity: number }>;
  createdAt: string;
}

const DELIVERY_STEPS = [
  { key: "pending", label: "Placed", emoji: "📝" },
  { key: "confirmed", label: "Confirmed", emoji: "✅" },
  { key: "cooking", label: "Cooking", emoji: "🍳" },
  { key: "ready", label: "Ready", emoji: "📦" },
  { key: "out_for_delivery", label: "On the Way", emoji: "🛵" },
];

const PICKUP_STEPS = [
  { key: "pending", label: "Placed", emoji: "📝" },
  { key: "confirmed", label: "Confirmed", emoji: "✅" },
  { key: "cooking", label: "Cooking", emoji: "🍳" },
  { key: "ready", label: "Pickup!", emoji: "📦" },
];

const statusMeta: Record<string, { label: string; color: string; bgColor: string; emoji: string }> = {
  pending:          { label: "Preparing your order",  color: "#D91A60", bgColor: "#FFF0F5", emoji: "🕐" },
  confirmed:        { label: "Preparing your order",  color: "#D91A60", bgColor: "#FFF0F5", emoji: "✅" },
  cooking:          { label: "Preparing your order",  color: "#D91A60", bgColor: "#FFF0F5", emoji: "🍳" },
  ready:            { label: "Order Ready!",          color: "#9B59B6", bgColor: "#F5F0FF", emoji: "📦" },
  out_for_delivery: { label: "On the Way",            color: "#D91A60", bgColor: "#FFF0F5", emoji: "🚗" },
  delivered:        { label: "Delivered!",             color: "#00AA99", bgColor: "#F0FFF8", emoji: "🎉" },
};

const ACTIVE_STATUSES = ["pending", "confirmed", "cooking", "ready", "out_for_delivery"];

export const ActiveOrderBar = memo(function ActiveOrderBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [visible, setVisible] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevOrderIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const fetchLatestOrder = useCallback(async (): Promise<ActiveOrder | null> => {
    if (!user?.id) return null;
    try {
      const customToken = localStorage.getItem("customToken");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${API_BASE}/orders?userId=${user.id}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          ...(customToken && { "X-Custom-Auth": customToken }),
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      const orders = data.orders || [];

      // Sort by most recently created, find the latest active one
      const sorted = orders.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const active = sorted.find((o: any) => ACTIVE_STATUSES.includes(o.status));
      if (active) return active;

      // If no active, check if the previously-tracked order just became delivered
      if (prevOrderIdRef.current) {
        const prev = sorted.find((o: any) => o.id === prevOrderIdRef.current);
        if (prev?.status === "delivered") {
          return { ...prev, status: "delivered" };
        }
      }

      return null;
    } catch {
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;

    if (!user?.id) {
      setOrder(null);
      setVisible(false);
      prevOrderIdRef.current = null;
      return;
    }

    let celebrationTimeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const latest = await fetchLatestOrder();
      if (!mountedRef.current) return;

      if (!latest) {
        // No active order and no recent delivery — hide
        if (!celebrating) {
          setVisible(false);
          setTimeout(() => {
            if (mountedRef.current) {
              setOrder(null);
              prevOrderIdRef.current = null;
            }
          }, 400);
        }
        return;
      }

      if (latest.status === "delivered" && !celebrating) {
        // Just delivered — show celebration then auto-dismiss
        setCelebrating(true);
        setOrder(latest);
        setVisible(true);

        celebrationTimeout = setTimeout(() => {
          if (mountedRef.current) {
            setVisible(false);
            setTimeout(() => {
              if (mountedRef.current) {
                setOrder(null);
                setCelebrating(false);
                prevOrderIdRef.current = null;
              }
            }, 400);
          }
        }, 3500);
        return;
      }

      if (ACTIVE_STATUSES.includes(latest.status)) {
        setOrder(latest);
        prevOrderIdRef.current = latest.id;
        setCelebrating(false);
        setVisible(true);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 15000);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (celebrationTimeout) clearTimeout(celebrationTimeout);
    };
  }, [user?.id, fetchLatestOrder]);

  if (!order) return null;

  const isDelivery = order.deliveryMethod === "delivery";
  const steps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const meta = statusMeta[order.status] || statusMeta.pending;
  const shortId = order.orderNumber ? getShortOrderId(order.orderNumber) : getShortOrderId(order.id);
  const itemCount = order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
  const itemSummary =
    itemCount === 1 ? order.items[0]?.title || "1 item" : `${itemCount} items`;

  return (
    <div
      className={`px-3 sm:px-6 pb-1.5 transition-all duration-400 ease-in-out ${
        visible
          ? "opacity-100 max-h-[200px] translate-y-0"
          : "opacity-0 max-h-0 -translate-y-2 overflow-hidden"
      }`}
    >
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate(`/order-tracking/${order.id}`)}
          className="w-full rounded-2xl p-4 shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] text-left relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #FFF8E8 0%, #FFF3D6 50%, #FFEFC2 100%)",
            border: "2px solid #E8C547",
          }}
        >
          {/* Celebration shimmer */}
          {celebrating && (
            <div className="absolute inset-0 pointer-events-none celebrating-shimmer" />
          )}

          {/* Golden shimmer overlay */}
          {!celebrating && (
            <div className="absolute inset-0 pointer-events-none golden-shimmer opacity-40" />
          )}

          {/* Top row: LIVE badge + preparing text */}
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-[11px] font-extrabold text-white bg-red-500 px-1.5 py-0.5 rounded-sm tracking-wide">
                LIVE
              </span>
            </span>
            <span className="text-sm font-bold text-gray-800">
              {celebrating ? "Order delivered! 🎉" : `${meta.label}...`}
            </span>
          </div>

          {/* Middle row: order info */}
          {!celebrating ? (
            <>
              <div className="flex items-center justify-between mb-3 bg-white/60 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isDelivery ? "#FFF0E6" : "#E8F5E9",
                      color: isDelivery ? "#E67E22" : "#2E7D32",
                      border: `1px solid ${isDelivery ? "#E67E2230" : "#2E7D3230"}`,
                    }}
                  >
                    {isDelivery ? "🛵 Delivery" : "🏪 Pickup"}
                  </span>
                  <span className="text-xs font-medium text-gray-600 truncate max-w-[100px]">
                    {order.items?.[0]?.title || itemSummary}
                  </span>
                  {itemCount > 1 && (
                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">
                      +{itemCount - 1} more
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-0.5 flex-shrink-0">
                  Tap to track <span className="text-sm">→</span>
                </span>
              </div>

              {/* Progress stepper with icons */}
              <div className="flex items-stretch justify-between mb-1.5">
                {steps.map((step, index) => {
                  const isCompleted = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  return (
                    <div key={step.key} className="flex-1 flex flex-col items-center">
                      {/* Emoji icon with pop effect */}
                      <span
                        className={`text-base mb-1 transition-all duration-500 ease-out ${
                          isCurrent
                            ? "step-icon-pop scale-125"
                            : isCompleted
                            ? "scale-100 opacity-90"
                            : "scale-75 opacity-40 grayscale"
                        }`}
                        style={{
                          display: "inline-block",
                          filter: !isCompleted ? "grayscale(0.8)" : "none",
                        }}
                      >
                        {step.emoji}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="relative mb-1.5">
                <div className="w-full h-[5px] rounded-full bg-amber-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
                      background: "linear-gradient(90deg, #E8C547, #F0D060, #E8C547)",
                    }}
                  />
                </div>
              </div>

              {/* Step labels */}
              <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                  const isCompleted = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  return (
                    <div key={step.key} className="flex-1 flex justify-center">
                      <span
                        className="text-[10px] font-semibold transition-colors duration-300 text-center"
                        style={{
                          color: isCurrent ? "#D91A60" : isCompleted ? "#B8860B" : "#C4A96A",
                          fontWeight: isCurrent ? 700 : 500,
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-lg animate-bounce">🎉</span>
              <span className="text-sm font-bold" style={{ color: "#00AA99" }}>
                Your order has been delivered!
              </span>
              <span
                className="text-lg animate-bounce"
                style={{ animationDelay: "0.15s" }}
              >
                🎉
              </span>
            </div>
          )}
        </button>
      </div>

      <style>{`
        .step-icon-pop {
          animation: iconPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, iconBreathe 2s ease-in-out 0.6s infinite;
        }
        @keyframes iconPop {
          0% { transform: scale(0.6); opacity: 0.5; }
          50% { transform: scale(1.4); }
          100% { transform: scale(1.25); opacity: 1; }
        }
        @keyframes iconBreathe {
          0%, 100% { transform: scale(1.25); }
          50% { transform: scale(1.35); }
        }
        .active-step-pulse {
          animation: stepPulse 1.5s ease-in-out infinite;
        }
        @keyframes stepPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .celebrating-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(0,170,153,0.12) 50%, transparent 100%);
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .golden-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(232,197,71,0.15) 50%, transparent 100%);
          animation: shimmer 2.5s infinite;
        }
      `}</style>
    </div>
  );
});