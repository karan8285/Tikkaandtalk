/**
 * PointsHistory — Customer-facing component showing points ledger history.
 * Displays earned, expired, and deducted points in a collapsible timeline.
 */
import { useState, useEffect } from "react";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import {
  ChevronDown, ChevronUp, Clock, TrendingUp, TrendingDown,
  AlertTriangle, Loader2, History, ShoppingBag, RefreshCw,
} from "lucide-react";

const BRAND = APP_CONFIG.brand.primaryColor;

interface HistoryEntry {
  id: string;
  type: "earned" | "expired" | "deduction";
  amount: number;
  remaining: number;
  source: string;
  orderId?: string;
  date: string;
  expiresAt: string | null;
  expired: boolean;
  expiredAt?: string;
  expiredAmount?: number;
  note?: string;
}

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function PointsHistory({ userId }: { userId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 5;

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetchWithRetry(`${API_BASE}/my-points-history?userId=${userId}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setExpiryEnabled(data.expiryEnabled || false);
      }
    } catch (e) {
      console.error("Failed to fetch points history:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" style={{ color: BRAND }} />
        <p className="text-xs text-gray-400">Loading points history...</p>
      </div>
    );
  }

  // Filter out 'migration' source entries with 0 remaining (not interesting to users)
  const meaningfulHistory = history.filter(h => {
    if (h.source === "migration" && !h.expired && h.remaining === h.amount) {
      return true; // Show initial migration
    }
    return true;
  });

  if (meaningfulHistory.length === 0) {
    return null; // Don't show empty history
  }

  // Calculate summary
  const totalEarned = meaningfulHistory
    .filter(h => h.type === "earned" && h.amount > 0)
    .reduce((sum, h) => sum + h.amount, 0);
  const totalExpired = meaningfulHistory
    .filter(h => h.expired)
    .reduce((sum, h) => sum + (h.expiredAmount || 0), 0);
  const soonToExpire = meaningfulHistory
    .filter(h => {
      if (h.expired || h.remaining <= 0 || !h.expiresAt || h.source === "deduction") return false;
      const expiry = new Date(h.expiresAt);
      const now = new Date();
      const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 30;
    })
    .reduce((sum, h) => sum + h.remaining, 0);

  const displayHistory = expanded
    ? meaningfulHistory
    : meaningfulHistory.slice(0, PREVIEW_COUNT);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getIcon = (entry: HistoryEntry) => {
    if (entry.type === "deduction") return <TrendingDown className="w-4 h-4 text-orange-500" />;
    if (entry.expired) return <AlertTriangle className="w-4 h-4 text-red-400" />;
    return <TrendingUp className="w-4 h-4 text-green-500" />;
  };

  const getSourceLabel = (entry: HistoryEntry) => {
    if (entry.source === "order") return "Order reward";
    if (entry.source === "migration") return "Initial balance";
    if (entry.source === "manual") return "Manual adjustment";
    if (entry.source === "deduction") return entry.note || "Points used";
    if (entry.source === "refund") return "Refund";
    return entry.source;
  };

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: BRAND }} />
            <h3 className="text-sm font-bold" style={{ color: "#333" }}>Points History</h3>
          </div>
          {expiryEnabled && soonToExpire > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50">
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-600">
                {soonToExpire} pts expiring soon
              </span>
            </div>
          )}
        </div>

        {/* Mini summary row */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 text-center bg-green-50 rounded-lg py-1.5 px-2">
            <p className="text-[10px] text-green-600 font-medium">Earned</p>
            <p className="text-sm font-bold text-green-700">{totalEarned.toLocaleString()}</p>
          </div>
          {totalExpired > 0 && (
            <div className="flex-1 text-center bg-red-50 rounded-lg py-1.5 px-2">
              <p className="text-[10px] text-red-500 font-medium">Expired</p>
              <p className="text-sm font-bold text-red-600">{totalExpired.toLocaleString()}</p>
            </div>
          )}
          {expiryEnabled && soonToExpire > 0 && (
            <div className="flex-1 text-center bg-amber-50 rounded-lg py-1.5 px-2">
              <p className="text-[10px] text-amber-500 font-medium">Expiring</p>
              <p className="text-sm font-bold text-amber-600">{soonToExpire.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline list */}
      <div className="px-4 pb-2">
        <div className="space-y-0">
          {displayHistory.map((entry, idx) => (
            <div
              key={entry.id}
              className={`flex items-start gap-3 py-2.5 ${
                idx < displayHistory.length - 1 ? "border-b border-gray-50" : ""
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  entry.type === "deduction"
                    ? "bg-orange-50"
                    : entry.expired
                    ? "bg-red-50"
                    : "bg-green-50"
                }`}>
                  {getIcon(entry)}
                </div>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {getSourceLabel(entry)}
                  </p>
                  <span className={`text-sm font-bold flex-shrink-0 ml-2 ${
                    entry.type === "deduction"
                      ? "text-orange-500"
                      : entry.expired
                      ? "text-red-500"
                      : "text-green-600"
                  }`}>
                    {entry.type === "deduction" || entry.expired
                      ? `-${Math.abs(entry.expiredAmount || entry.amount).toLocaleString()}`
                      : `+${entry.amount.toLocaleString()}`
                    }
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-400">{formatDate(entry.date)}</span>
                  {entry.expiresAt && !entry.expired && entry.remaining > 0 && entry.source !== "deduction" && (
                    <span className="text-[10px] text-gray-400">
                      Expires {formatDate(entry.expiresAt)}
                    </span>
                  )}
                  {entry.expired && entry.expiredAt && (
                    <span className="text-[10px] text-red-400">
                      Expired {formatDate(entry.expiredAt)}
                    </span>
                  )}
                </div>
                {/* Show remaining for active earned entries */}
                {entry.type === "earned" && !entry.expired && entry.remaining > 0 && entry.remaining < entry.amount && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {entry.remaining.toLocaleString()} remaining of {entry.amount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expand/Collapse */}
      {meaningfulHistory.length > PREVIEW_COUNT && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2.5 flex items-center justify-center gap-1 text-xs font-semibold border-t border-gray-100 hover:bg-gray-50 transition-colors"
          style={{ color: BRAND }}
        >
          {expanded ? (
            <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>View All ({meaningfulHistory.length}) <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
}
