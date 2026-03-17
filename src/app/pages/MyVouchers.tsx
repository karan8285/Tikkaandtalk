/**
 * MyVouchers — Customer page for viewing and managing dine-in vouchers.
 * Shows QR codes for staff to scan, voucher status, and ability to claim bulk codes.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { APP_CONFIG } from "../lib/config";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Header } from "../components/Header";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  Ticket, Loader2, QrCode, Clock, CheckCircle, XCircle, Plus,
  Percent, DollarSign, Copy, RefreshCw, ChevronRight, Gift,
} from "lucide-react";
import { formatIDR } from "../lib/currency";

const BRAND = APP_CONFIG.brand.primaryColor;

interface DineInVoucher {
  assignmentId: string;
  voucherId: string;
  code: string;
  title: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount: number;
  expiryDate: string | null;
  status: "active" | "used" | "expired" | "inactive";
  redeemed: boolean;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

export default function MyVouchers() {
  const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [vouchers, setVouchers] = useState<DineInVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<DineInVoucher | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "used" | "expired">("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    fetchVouchers();
  }, [user, authLoading]);

  const fetchVouchers = async (showRefresh = false) => {
    if (!user?.id) return;
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await fetchWithRetry(`${API_BASE}/my-dinein-vouchers?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Fetched vouchers:", JSON.stringify(data.vouchers?.map((v: any) => ({ assignmentId: v.assignmentId, code: v.code, title: v.title }))));
        setVouchers(data.vouchers || []);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Fetch vouchers error:", err);
      }
    } catch (e: any) {
      console.error("Fetch vouchers error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleClaim = async () => {
    if (!claimCode.trim() || !user?.id) return;
    try {
      setClaiming(true);
      const res = await fetchWithRetry(`${API_BASE}/claim-dinein-voucher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ userId: user.id, code: claimCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Voucher "${data.voucher.title}" claimed!`);
        setShowClaimDialog(false);
        setClaimCode("");
        fetchVouchers();
      } else {
        toast.error(data.error || "Failed to claim voucher");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to claim voucher");
    } finally {
      setClaiming(false);
    }
  };

  const filteredVouchers = vouchers.filter(v => {
    if (activeFilter === "all") return true;
    return v.status === activeFilter;
  });

  const activeCount = vouchers.filter(v => v.status === "active").length;
  const usedCount = vouchers.filter(v => v.status === "used").length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="My Dine-In Vouchers" />
        <main className="max-w-md mx-auto px-4 py-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: BRAND }} />
          <p className="text-sm text-muted-foreground">Loading vouchers...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        showBack
        title="My Dine-In Vouchers"
        rightContent={
          <button
            onClick={() => fetchVouchers(true)}
            disabled={refreshing}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        {/* Hero Banner */}
        <div className="rounded-2xl p-5 mb-5 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${BRAND}, ${BRAND}CC)` }}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 bg-white -translate-y-8 translate-x-8" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Ticket className="w-5 h-5" />
              <span className="text-sm font-semibold opacity-90">Dine-In Vouchers</span>
            </div>
            <p className="text-2xl font-bold mb-1">{activeCount} Active</p>
            <p className="text-xs opacity-75">{usedCount} used | {vouchers.length} total</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-4">
          <Button
            onClick={() => setShowClaimDialog(true)}
            variant="outline"
            className="flex-1 h-11"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Claim Voucher Code
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {([
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "used", label: "Used" },
            { key: "expired", label: "Expired" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                activeFilter === tab.key
                  ? "text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={activeFilter === tab.key ? { backgroundColor: BRAND } : {}}
            >
              {tab.label}
              {tab.key === "active" && activeCount > 0 && (
                <span className="ml-1 bg-white/30 rounded-full px-1.5 text-[10px]">{activeCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Voucher Cards */}
        {filteredVouchers.length === 0 ? (
          <div className="text-center py-12">
            <Gift className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-muted-foreground mb-1">
              {activeFilter === "all" ? "No dine-in vouchers yet" : `No ${activeFilter} vouchers`}
            </p>
            <p className="text-xs text-gray-400">Claim a voucher code to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVouchers.map(v => (
              <button
                key={v.assignmentId}
                onClick={() => v.status === "active" ? setSelectedVoucher(v) : undefined}
                className={`w-full text-left bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                  v.status === "active"
                    ? "hover:shadow-md active:scale-[0.99] cursor-pointer border-gray-200"
                    : "opacity-60 cursor-default border-gray-100"
                }`}
              >
                {/* Voucher ticket design with dashed left border */}
                <div className="flex">
                  {/* Left color strip */}
                  <div
                    className="w-2 flex-shrink-0"
                    style={{
                      backgroundColor:
                        v.status === "active" ? BRAND
                        : v.status === "used" ? "#9CA3AF"
                        : "#EF4444"
                    }}
                  />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-gray-900">{v.title}</h3>
                        {v.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{v.description}</p>
                        )}
                      </div>
                      {v.status === "active" && (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                    </div>

                    {/* Discount badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ backgroundColor: `${BRAND}12` }}>
                        {v.discountType === "percentage" ? (
                          <Percent className="w-3 h-3" style={{ color: BRAND }} />
                        ) : (
                          <DollarSign className="w-3 h-3" style={{ color: BRAND }} />
                        )}
                        <span className="text-xs font-bold" style={{ color: BRAND }}>
                          {v.discountType === "percentage" ? `${v.discountValue}% OFF` : formatIDR(v.discountValue)}
                        </span>
                      </div>

                      {/* Status badge */}
                      {v.status === "active" && (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-0">
                          <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Active
                        </Badge>
                      )}
                      {v.status === "used" && (
                        <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                          <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Used
                        </Badge>
                      )}
                      {v.status === "expired" && (
                        <Badge className="text-[10px] bg-red-100 text-red-600 border-0">
                          <XCircle className="w-2.5 h-2.5 mr-0.5" /> Expired
                        </Badge>
                      )}
                    </div>

                    {/* Footer info */}
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      {v.minOrderAmount > 0 && (
                        <span>Min order: {formatIDR(v.minOrderAmount)}</span>
                      )}
                      {v.expiryDate && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          Expires {new Date(v.expiryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {v.redeemed && v.redeemedAt && (
                        <span>
                          Used {new Date(v.redeemedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* QR Code Dialog — shown when customer taps on an active voucher */}
      <Dialog open={!!selectedVoucher} onOpenChange={(open) => { if (!open) setSelectedVoucher(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedVoucher?.title}</DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <div className="text-center space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-2xl shadow-inner border-2" style={{ borderColor: `${BRAND}30` }}>
                  {selectedVoucher.assignmentId ? (
                    <QRCodeSVG
                      value={`DINEIN:${selectedVoucher.assignmentId}`}
                      size={200}
                      fgColor="#1F2937"
                      bgColor="#FFFFFF"
                      level="M"
                      includeMargin={true}
                    />
                  ) : (
                    <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-xs text-red-500 px-4">QR code unavailable. Please try refreshing.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <p className="text-xs text-gray-500">
                Show this QR code to the staff to redeem your discount
              </p>

              {/* Assignment ID for manual entry fallback */}
              {selectedVoucher.assignmentId && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">
                    ID: {selectedVoucher.assignmentId.slice(0, 8)}...
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`DINEIN:${selectedVoucher.assignmentId}`);
                      toast.success("QR data copied! Staff can paste this to verify.");
                    }}
                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                  >
                    <Copy className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Voucher Code */}
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono font-bold text-lg tracking-wider" style={{ color: BRAND }}>
                  {selectedVoucher.code}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedVoucher.code);
                    toast.success("Code copied!");
                  }}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <Copy className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Discount info */}
              <div className="px-4 py-3 rounded-xl" style={{ backgroundColor: `${BRAND}08` }}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {selectedVoucher.discountType === "percentage" ? (
                    <Percent className="w-4 h-4" style={{ color: BRAND }} />
                  ) : (
                    <DollarSign className="w-4 h-4" style={{ color: BRAND }} />
                  )}
                  <span className="text-lg font-bold" style={{ color: BRAND }}>
                    {selectedVoucher.discountType === "percentage"
                      ? `${selectedVoucher.discountValue}% OFF`
                      : formatIDR(selectedVoucher.discountValue)
                    }
                  </span>
                </div>
                {selectedVoucher.minOrderAmount > 0 && (
                  <p className="text-[10px] text-gray-500">Min. order: {formatIDR(selectedVoucher.minOrderAmount)}</p>
                )}
                {selectedVoucher.expiryDate && (
                  <p className="text-[10px] text-gray-500">
                    Valid until {new Date(selectedVoucher.expiryDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>

              {selectedVoucher.description && (
                <p className="text-xs text-gray-500 italic">{selectedVoucher.description}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Claim Voucher Code Dialog */}
      <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Claim Voucher Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Enter the voucher code to add it to your account</p>
            <Input
              value={claimCode}
              onChange={e => setClaimCode(e.target.value.toUpperCase())}
              placeholder="Enter voucher code"
              className="text-center font-mono font-bold text-lg tracking-widest"
            />
            <Button
              onClick={handleClaim}
              disabled={!claimCode.trim() || claiming}
              className="w-full h-11 text-white"
              style={{ backgroundColor: BRAND }}
            >
              {claiming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming...</>
              ) : (
                <><Gift className="w-4 h-4 mr-2" /> Claim Voucher</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}