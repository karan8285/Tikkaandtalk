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
  { key: "pending", label: "Placed", emoji: "🕐" },
  { key: "confirmed", label: "Confirmed", emoji: "✅" },
  { key: "cooking", label: "Cooking", emoji: "🍳" },
  { key: "ready", label: "Ready", emoji: "📦" },
  { key: "out_for_delivery", label: "On the Way", emoji: "🚗" },
];

const PICKUP_STEPS = [
  { key: "pending", label: "Placed", emoji: "🕐" },
  { key: "confirmed", label: "Confirmed", emoji: "✅" },
  { key: "cooking", label: "Cooking", emoji: "🍳" },
  { key: "ready", label: "Pickup!", emoji: "📦" },
];

const statusMeta: Record<string, { label: string; color: string; bgColor: string; emoji: string }> = {
  pending:          { label: "Order Placed",  color: "#D91A60", bgColor: "#FFF0F5", emoji: "🕐" },
  confirmed:        { label: "Confirmed",     color: "#D91A60", bgColor: "#FFF0F5", emoji: "✅" },
  cooking:          { label: "Preparing",     color: "#D91A60", bgColor: "#FFF0F5", emoji: "🍳" },
  ready:            { label: "Ready!",        color: "#9B59B6", bgColor: "#F5F0FF", emoji: "📦" },
  out_for_delivery: { label: "On the Way",    color: "#D91A60", bgColor: "#FFF0F5", emoji: "🚗" },
  delivered:        { label: "Delivered!",     color: "#00AA99", bgColor: "#F0FFF8", emoji: "🎉" },
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
          className="w-full rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] text-left relative overflow-hidden"
          style={{
            backgroundColor: meta.bgColor,
            border: `1.5px solid ${meta.color}20`,
          }}
        >
          {/* Celebration shimmer */}
          {celebrating && (
            <div className="absolute inset-0 pointer-events-none celebrating-shimmer" />
          )}

          {/* Top row: status + order ID */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg flex-shrink-0">{meta.emoji}</span>
              <div className="min-w-0">
                <span className="text-sm font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {shortId && (
                  <span className="text-[11px] text-gray-500 ml-1.5 font-medium">
                    #{shortId}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[11px] text-gray-400 font-medium truncate max-w-[80px]">
                {itemSummary}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Progress stepper or celebration */}
          {!celebrating ? (
            <div className="flex items-center gap-0.5">
              {steps.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
                    {/* Progress bar segment */}
                    <div
                      className="w-full h-[3px] rounded-full overflow-hidden"
                      style={{ backgroundColor: "#F3D5DF" }}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          isCurrent ? "active-step-pulse" : ""
                        }`}
                        style={{
                          width: isCompleted ? "100%" : "0%",
                          backgroundColor: isCompleted ? "#D91A60" : "transparent",
                        }}
                      />
                    </div>
                    {/* Step label */}
                    <span
                      className="text-[9px] leading-tight font-medium transition-colors duration-300"
                      style={{
                        color: isCompleted ? "#D91A60" : "#CCAAB5",
                        fontWeight: isCurrent ? 700 : 500,
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-1">
              <span className="text-base animate-bounce">🎉</span>
              <span className="text-sm font-bold" style={{ color: "#00AA99" }}>
                Your order has been delivered!
              </span>
              <span
                className="text-base animate-bounce"
                style={{ animationDelay: "0.15s" }}
              >
                🎉
              </span>
            </div>
          )}

          {/* Bottom row: delivery badge + tap hint */}
          <div className="flex items-center justify-between mt-2">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${meta.color}15`,
                color: meta.color,
              }}
            >
              {isDelivery ? "🛵 Delivery" : "🏪 Pickup"}
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              Tap to track →
            </span>
          </div>
        </button>
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
});