/**
 * StaffCashier — Simplified orders & payments dashboard for cashier role.
 * Shows all active orders with payment status management.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth } from "../lib/staff-auth";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { CreditCard, Clock, Phone, Package, LogOut, RefreshCw, ShoppingCart, Archive, ChevronLeft, ChevronRight, Banknote, CircleDollarSign, Truck, MapPin, MessageSquare, Save, Filter, X, Share2, CheckSquare, Loader2, Ban, Plus, Star, Edit3, Volume2, VolumeX, KeyRound, AlertCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { formatPhoneForWhatsApp } from "../lib/whatsapp";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";
import { OrderModifyDialog } from "../components/OrderModifyDialog";
import { StaffAddToHomeScreen } from "../components/StaffAddToHomeScreen";
import { StaffPushToggle } from "../components/StaffPushToggle";
import { ChangePinDialog } from "../components/ChangePinDialog";
import { PaymentReceiptUpload, PaymentReceiptBadge } from "../components/PaymentReceiptUpload";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { OrderStatusTabs } from "../components/OrderStatusTabs";
import { PrinterSettings } from "../components/PrinterSettings";
import { isPrinterConnected, printInvoice, connectPrinter, ensureConnected } from "../lib/thermalPrinter";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", pending: "New", confirmed: "Confirmed",
  cooking: "Cooking", ready: "Ready", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", closed: "Closed", cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500", pending: "bg-orange-500", confirmed: "bg-teal-500",
  cooking: "bg-orange-600", ready: "bg-purple-500", out_for_delivery: "bg-orange-500",
  delivered: "bg-teal-500", closed: "bg-green-500", cancelled: "bg-red-500",
};

interface Order {
  id: string;
  itemTitle: string;
  total: number;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  phone: string;
  items?: any[];
  orderNumber?: string;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  promoDiscount?: number;
  adminMessage?: string;
  adminMessageAt?: string;
  deliveryNote?: string;
  deliveryNoteAt?: string;
  deliveryNoteBy?: string;
  rating?: number;
  ratingComment?: string;
  ratingAt?: string;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
  customCharges?: Array<{ id: string; name: string; amount: number; addedByAdmin?: boolean }>;
  remainingBalance?: number;
  paymentMethod?: string;
  promoCode?: string;
  taxRate?: number;
  modificationHistory?: any[];
  customerName?: string;
}

const ORDER_STATUSES = ["scheduled", "pending", "confirmed", "cooking", "ready", "out_for_delivery", "delivered", "closed", "cancelled"];

const STATUS_BG_STYLE: Record<string, { backgroundColor: string; borderColor: string }> = {
  scheduled: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  pending: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  confirmed: { backgroundColor: '#f0fdfa', borderColor: '#99f6e4' },
  cooking: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  ready: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  out_for_delivery: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  delivered: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  closed: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  cancelled: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
};

export default function StaffCashier() {
  const navigate = useNavigate();
  const { staff, accessToken, loading: authLoading, signOut } = useStaffAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [printerSettingsOpen, setPrinterSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [stats, setStats] = useState({ activeCount: 0, closedCount: 0, cancelledCount: 0, unpaidCount: 0, unpaidTotal: 0, paidCount: 0, paidTotal: 0, todayCount: 0, todayRevenue: 0, totalOrders: 0, statusCounts: {} as Record<string, number> });

  // Payment dialog
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState<string | null>(null);

  // Unified local edits per order
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [adminMessages, setAdminMessages] = useState<Record<string, string>>({});
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [savingOrder, setSavingOrder] = useState<string | null>(null);

  // Bulk actions
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Cancel order
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Modify order
  const [modifyOrderTarget, setModifyOrderTarget] = useState<Order | null>(null);

  const { checkForNewOrders, soundEnabled, enableSound } = useNewOrderAlert({ label: "Cashier" });
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchOrders = useCallback(async () => {
    if (!accessTokenRef.current) return;
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(), limit: "15",
        status: "all", payment: paymentFilter, delivery: deliveryFilter, date: "all", tab: activeTab,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetchWithRetry(`${API_BASE}/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessTokenRef.current },
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
        setTotalFiltered(data.totalFiltered);
        setTotalPages(data.totalPages);
        setCurrentPage(data.page);
        if (data.stats) setStats(data.stats);

        // Check for new orders and play sound alert (on non-closed/cancelled tabs)
        if (!["closed", "cancelled"].includes(activeTab)) {
          checkForNewOrders((data.orders || []).map((o: Order) => o.id));
        }
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, activeTab, paymentFilter, deliveryFilter, checkForNewOrders]);

  useEffect(() => {
    if (authLoading) return;
    if (!staff) { navigate("/staff"); return; }
    if (staff.role !== 'cashier' && staff.role !== 'superuser' && staff.role !== 'manager') {
      toast.error("Cashier access required");
      navigate("/staff");
      return;
    }
    fetchOrders();
    const interval = setInterval(() => fetchOrders(), 15000);
    return () => clearInterval(interval);
  }, [staff, authLoading, navigate, fetchOrders]);

  // fetchOrders is already re-created (via useCallback) when currentPage, debouncedSearch,
  // activeTab, paymentFilter, or deliveryFilter change — and the useEffect above already
  // depends on fetchOrders, so it will re-run automatically. No extra effect needed.

  // eslint-disable-next-line -- force recompile
  const handleAddPayment = async () => {
    if (!paymentOrder || !paymentAmount) return;
    const amount = parseInt(paymentAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Invalid amount"); return; }

    try {
      setPaymentLoading(true);
      const addPayment: any = { amount, method: paymentMethod };
      if (paymentReceiptUrl) addPayment.receiptUrl = paymentReceiptUrl;
      const response = await fetchWithRetry(`${API_BASE}/admin/orders/${paymentOrder.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ addPayment }),
      });
      if (response.ok) {
        toast.success(`Payment of ${formatIDR(amount)} recorded`);
        setPaymentOrder(null);
        setPaymentAmount("");
        setPaymentReceiptUrl(null);
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to record payment");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const markFullyPaid = async (order: Order) => {
    const remaining = order.total - (order.paidAmount || 0);
    if (remaining <= 0) return;
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ addPayment: { amount: remaining, method: "cash" } }),
      });
      if (response.ok) {
        toast.success("Order marked as fully paid");
        fetchOrders();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // ─── Print Invoice Handler ───
  const [printingOrder, setPrintingOrder] = useState<string | null>(null);

  const handlePrintInvoice = async (order: Order) => {
    setPrintingOrder(order.id);
    try {
      // Try silent reconnect first, then prompt scanner if needed
      const ready = await ensureConnected();
      if (!ready) {
        toast.info("Reconnecting to printer...");
        const result = await connectPrinter();
        if (!result.success) {
          toast.error(result.error || "Please connect your printer in Settings > Printer tab first.");
          return;
        }
        toast.success(`Connected to ${result.name}`);
        await new Promise(r => setTimeout(r, 500));
      }

      const restaurantName = (() => { try { return localStorage.getItem("tikka_restaurant_name") || APP_CONFIG.restaurant.name; } catch { return APP_CONFIG.restaurant.name; } })();
      const restaurantTagline = (() => { try { return localStorage.getItem("tikka_restaurant_tagline") || APP_CONFIG.restaurant.tagline; } catch { return APP_CONFIG.restaurant.tagline; } })();
      const restaurantAddress = (() => { try { return localStorage.getItem("tikka_restaurant_address") || APP_CONFIG.restaurant.defaultAddress; } catch { return APP_CONFIG.restaurant.defaultAddress; } })();
      const restaurantPhone = (() => { try { return localStorage.getItem("tikka_whatsapp_display") || APP_CONFIG.whatsapp.defaultDisplay; } catch { return APP_CONFIG.whatsapp.defaultDisplay; } })();

      const invoiceData = {
        name: restaurantName,
        tagline: restaurantTagline,
        address: restaurantAddress,
        phone: restaurantPhone,
      };

      const staffName = staff?.role === 'superuser' ? 'Admin' : (staff?.name || "Cashier");

      try {
        await printInvoice(order, invoiceData, staffName);
      } catch (firstErr: any) {
        console.warn("[Print] First attempt failed, trying reconnect:", firstErr.message);
        const reconnected = await ensureConnected();
        if (reconnected) {
          await new Promise(r => setTimeout(r, 300));
          await printInvoice(order, invoiceData, staffName);
        } else {
          throw firstErr;
        }
      }

      toast.success("Invoice printed successfully!");
    } catch (err: any) {
      console.error("[Print] Final failure:", err);
      toast.error(`Print failed: ${err.message}`);
    } finally {
      setPrintingOrder(null);
    }
  };

  // Unified save: status + admin message + delivery note in one API call
  const saveAllChanges = async (order: Order) => {
    const payload: Record<string, any> = {};
    const newStatus = pendingStatuses[order.id];
    const newMsg = adminMessages[order.id];
    const newNote = deliveryNotes[order.id];
    if (newStatus && newStatus !== order.status) payload.status = newStatus;
    if (newMsg !== undefined) payload.adminMessage = newMsg;
    if (newNote !== undefined) payload.deliveryNote = newNote;
    if (Object.keys(payload).length === 0) { toast.info("No changes to save"); return; }
    try {
      setSavingOrder(order.id);
      const response = await fetchWithRetry(`${API_BASE}/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const parts: string[] = [];
        if (payload.status) parts.push(`Status → ${STATUS_LABELS[payload.status]}`);
        if (payload.adminMessage !== undefined) parts.push("Customer message");
        if (payload.deliveryNote !== undefined) parts.push("Delivery note");
        toast.success(`Saved: ${parts.join(", ")}`);
        setPendingStatuses(prev => { const n = { ...prev }; delete n[order.id]; return n; });
        setAdminMessages(prev => { const n = { ...prev }; delete n[order.id]; return n; });
        setDeliveryNotes(prev => { const n = { ...prev }; delete n[order.id]; return n; });
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to save changes");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingOrder(null);
    }
  };

  // Check if an order has unsaved changes
  const hasChanges = (order: Order): boolean => {
    const statusChanged = pendingStatuses[order.id] !== undefined && pendingStatuses[order.id] !== order.status;
    const msgChanged = adminMessages[order.id] !== undefined;
    const noteChanged = deliveryNotes[order.id] !== undefined;
    return statusChanged || msgChanged || noteChanged;
  };

  const handleSignOut = () => { signOut(); navigate("/staff"); };

  // Bulk action handlers
  const toggleSelectAll = () => {
    const pageOrderIds = orders.map(o => o.id);
    const allPageSelected = pageOrderIds.length > 0 && pageOrderIds.every(id => selectedOrders.has(id));
    if (allPageSelected) {
      const newSet = new Set(selectedOrders);
      pageOrderIds.forEach(id => newSet.delete(id));
      setSelectedOrders(newSet);
    } else {
      setSelectedOrders(new Set([...selectedOrders, ...pageOrderIds]));
    }
  };

  const toggleSelectOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleBulkClose = async () => {
    if (selectedOrders.size === 0) {
      toast.error("No orders selected");
      return;
    }
    try {
      setBulkActionLoading(true);
      const orderIds = Array.from(selectedOrders);
      const ordersToClose = orderIds.filter(orderId => {
        const order = orders.find(o => o.id === orderId);
        return order && order.status !== "cancelled";
      });
      const skippedCount = orderIds.length - ordersToClose.length;
      let successCount = 0;
      let failCount = 0;

      for (const orderId of ordersToClose) {
        try {
          const response = await fetchWithRetry(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
              "X-Custom-Auth": accessToken || "",
            },
            body: JSON.stringify({ status: "closed" }),
          });
          if (response.ok) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) toast.success(`${successCount} order(s) closed successfully`);
      if (failCount > 0) toast.error(`${failCount} order(s) failed to close`);
      if (skippedCount > 0) toast.info(`${skippedCount} cancelled order(s) skipped`);
      setSelectedOrders(new Set());
      fetchOrders();
    } catch (error) {
      console.error("Bulk close failed:", error);
      toast.error("Failed to close orders");
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Cancel order handler
  const handleCancelOrder = async () => {
    if (!cancelOrderTarget || !cancelReason) return;
    try {
      setCancelLoading(true);
      const response = await fetchWithRetry(`${API_BASE}/admin/orders/${cancelOrderTarget.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({ status: "cancelled", cancellationReason: cancelReason }),
      });
      if (response.ok) {
        toast.success("Order cancelled successfully");
        setCancelOrderTarget(null);
        setCancelReason("");
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to cancel order");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCancelLoading(false);
    }
  };

  if (authLoading || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6" style={{ color: BRAND_COLOR }} />
            <div>
              <h1 className="text-lg font-bold">Cashier</h1>
              <p className="text-xs text-gray-500">{staff.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/staff/create-order")}><Plus className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={fetchOrders}><RefreshCw className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPrinterSettingsOpen(true)} title="Printer Settings"><Printer className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setChangePinOpen(true)} title="Change PIN"><KeyRound className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* Staff Add to Home Screen Banner */}
      <StaffAddToHomeScreen variant="banner" />
      <StaffPushToggle variant="banner" />

      {/* Sound alert prompt — shown when audio isn't primed yet */}
      {!soundEnabled && (
        <div className="max-w-3xl mx-auto px-4 pt-3">
          <button
            onClick={enableSound}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 active:bg-amber-200 transition-colors"
          >
            <VolumeX className="w-5 h-5 text-amber-600" />
            <span>Tap here to enable new order sound alerts</span>
            <Volume2 className="w-5 h-5 text-amber-600" />
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center border-l-4 border-l-red-500">
            <p className="text-xs text-gray-500">Unpaid</p>
            <p className="text-lg font-bold text-red-600">{stats.unpaidCount}</p>
            <p className="text-[10px] font-medium text-red-500">{formatIDR(stats.unpaidTotal)}</p>
          </Card>
          <Card className="p-3 text-center border-l-4 border-l-green-500">
            <p className="text-xs text-gray-500">Paid</p>
            <p className="text-lg font-bold text-green-600">{stats.paidCount}</p>
            <p className="text-[10px] font-medium text-green-500">{formatIDR(stats.paidTotal)}</p>
          </Card>
          <Card className="p-3 text-center" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
            <p className="text-xs text-gray-500">Today</p>
            <p className="text-lg font-bold">{stats.todayCount}</p>
            <p className="text-[10px] font-medium" style={{ color: BRAND_COLOR }}>{formatIDR(stats.todayRevenue)}</p>
          </Card>
        </div>

        {/* Status Tabs — horizontal scrollable */}
        <OrderStatusTabs
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setPaymentFilter("all");
            setDeliveryFilter("all");
            setSearchQuery("");
            setCurrentPage(1);
          }}
          statusCounts={stats.statusCounts || {}}
          totalOrders={stats.totalOrders || 0}
          brandColor={BRAND_COLOR}
        />

        {/* Search */}
        <Input placeholder="Search by order #, phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />

        {/* Filters Row */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Filters:</span>
          </div>
          <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <CircleDollarSign className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Payments</SelectItem>
              <SelectItem value="unpaid" className="text-xs">Unpaid</SelectItem>
              <SelectItem value="partial" className="text-xs">Partial</SelectItem>
              <SelectItem value="paid" className="text-xs">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deliveryFilter} onValueChange={(v) => { setDeliveryFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Truck className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Delivery" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Methods</SelectItem>
              <SelectItem value="delivery" className="text-xs">Delivery</SelectItem>
              <SelectItem value="pickup" className="text-xs">Pickup</SelectItem>
              <SelectItem value="dine_in" className="text-xs">Dine In</SelectItem>
            </SelectContent>
          </Select>
          {(paymentFilter !== "all" || deliveryFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-500 hover:text-gray-700"
              onClick={() => { setPaymentFilter("all"); setDeliveryFilter("all"); setCurrentPage(1); }}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Orders */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No orders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Bulk Select Bar — non-closed/cancelled tabs only */}
            {!["closed", "cancelled"].includes(activeTab) && (
              <Card className="p-3 bg-gray-50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={orders.length > 0 && orders.every(o => selectedOrders.has(o.id))}
                      onCheckedChange={toggleSelectAll}
                      id="select-all-cashier"
                    />
                    <Label htmlFor="select-all-cashier" className="cursor-pointer text-sm">
                      {selectedOrders.size > 0
                        ? `${selectedOrders.size} order(s) selected`
                        : `Select page (${orders.length})`}
                    </Label>
                  </div>

                  {selectedOrders.size > 0 && (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleBulkClose}
                        disabled={bulkActionLoading}
                        className="flex-1 sm:flex-none"
                      >
                        {bulkActionLoading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing...</>
                        ) : (
                          <><CheckSquare className="w-4 h-4 mr-2" /> Close Selected</>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedOrders(new Set())}
                        disabled={bulkActionLoading}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {orders.map(order => {
              const remaining = order.total - (order.paidAmount || 0);
              const isPaid = order.paymentStatus === 'paid' || remaining <= 0;
              const cardStyle = isPaid
                ? { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }
                : (STATUS_BG_STYLE[order.status] || { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' });
              return (
                <Card key={order.id} className={`p-4 ${selectedOrders.has(order.id) ? 'ring-2 ring-offset-1' : ''} shadow-sm`} style={{ ...cardStyle, ...(selectedOrders.has(order.id) ? { ringColor: BRAND_COLOR } : {}) }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {!["closed", "cancelled"].includes(activeTab) && (
                        <Checkbox
                          checked={selectedOrders.has(order.id)}
                          onCheckedChange={() => toggleSelectOrder(order.id)}
                          className="mt-1"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-gray-900">{getShortOrderId(order.orderNumber || order.id)}</span>
                          <Badge className={`text-[10px] text-white ${STATUS_COLORS[order.status]}`}>
                            {STATUS_LABELS[order.status]}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            title="Print Invoice"
                            disabled={printingOrder === order.id}
                            onClick={() => handlePrintInvoice(order)}
                          >
                            {printingOrder === order.id ? (
                              <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
                            ) : (
                              <Printer className="h-3.5 w-3.5" style={{ color: BRAND_COLOR }} />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm mt-1 text-gray-800">{order.itemTitle}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 flex-wrap">
                          {order.customerName && <span className="font-medium text-gray-900">{order.customerName}</span>}
                          {order.customerName && <span className="text-gray-300">|</span>}
                          <Phone className="w-3 h-3" />{order.phone}
                          <span>•</span>
                          <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleTimeString()}
                          {order.deliveryMethod === 'delivery' && <><Truck className="w-3 h-3 ml-1" /> Delivery</>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{formatIDR(order.total)}</p>
                      {order.promoDiscount && order.promoDiscount > 0 && (
                        <p className="text-[10px] text-green-600">-{formatIDR(order.promoDiscount)} promo</p>
                      )}
                    </div>
                  </div>

                  {/* Payment Status */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <div>
                      <Badge variant="outline" className={`text-xs ${
                        isPaid ? 'text-green-700 border-green-300 bg-green-50' :
                        order.paymentStatus === 'partial' ? 'text-orange-700 border-orange-300 bg-orange-50' :
                        'text-red-700 border-red-300 bg-red-50'
                      }`}>
                        <CircleDollarSign className="w-3 h-3 mr-1" />
                        {isPaid ? 'Paid' : order.paymentStatus === 'partial' ? `Partial (${formatIDR(order.paidAmount || 0)})` : 'Unpaid'}
                      </Badge>
                      {!isPaid && remaining > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">Remaining: {formatIDR(remaining)}</p>
                      )}
                    </div>

                    {!isPaid && order.status !== 'cancelled' && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPaymentOrder(order);
                            setPaymentAmount(remaining > 0 ? remaining.toString() : order.total.toString());
                          }}
                        >
                          <Banknote className="w-3.5 h-3.5 mr-1" /> Add
                        </Button>
                        <Button
                          size="sm"
                          className="text-white bg-green-600 hover:bg-green-700"
                          onClick={() => markFullyPaid(order)}
                        >
                          Full Pay
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Payment History */}
                  {order.paymentHistory && order.paymentHistory.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {order.paymentHistory.map((ph: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {formatIDR(ph.amount)} — {ph.method || 'cash'}
                            {ph.receiptUrl && <PaymentReceiptBadge receiptUrl={ph.receiptUrl} />}
                          </span>
                          <span className="shrink-0">{ph.date && !isNaN(new Date(ph.date).getTime()) ? new Date(ph.date).toLocaleTimeString() : ph.date || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Order Status Update */}
                  {order.status !== 'cancelled' && order.status !== 'closed' && (
                    <div className="mt-3 pt-3 border-t">
                      <Label className="text-xs font-medium mb-1.5 block">Update Status</Label>
                      <Select value={pendingStatuses[order.id] ?? order.status} onValueChange={(v) => setPendingStatuses(prev => ({ ...prev, [order.id]: v }))}>
                        <SelectTrigger className={`h-8 text-xs ${pendingStatuses[order.id] && pendingStatuses[order.id] !== order.status ? 'ring-2 ring-amber-400' : ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.filter(s => s !== 'cancelled').map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Save All Changes — right below status */}
                      {hasChanges(order) && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                          <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            You have unsaved changes
                          </p>
                          <Button
                            size="sm"
                            className="w-full h-9 text-xs font-semibold text-white"
                            style={{ backgroundColor: BRAND_COLOR }}
                            disabled={savingOrder === order.id}
                            onClick={() => saveAllChanges(order)}
                          >
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                            {savingOrder === order.id ? "Saving All Changes..." : "Save All Changes"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin Message to Customer */}
                  <div className="mt-3 pt-3 border-t">
                    <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
                      Message to Customer
                    </Label>
                    <Textarea
                      value={adminMessages[order.id] ?? order.adminMessage ?? ""}
                      onChange={(e) => setAdminMessages(prev => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="e.g. Your order is being prepared with extra care!"
                      rows={2}
                      className="text-xs resize-none mt-1"
                    />
                  </div>

                  {/* Delivery Note for Delivery Staff */}
                  <div className="mt-3 pt-3 border-t">
                    <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
                      Note to Delivery Guy
                    </Label>
                    <Textarea
                      value={deliveryNotes[order.id] ?? order.deliveryNote ?? ""}
                      onChange={(e) => setDeliveryNotes(prev => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="e.g. Call before delivery, Gate code: 1234, Leave at door"
                      rows={2}
                      className="text-xs resize-none mt-1"
                    />
                  </div>

                  {/* Share Tracking Link */}
                  {order.orderNumber && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => {
                            const trackingUrl = `${window.location.origin}/track/${order.orderNumber}`;
                            navigator.clipboard.writeText(trackingUrl);
                            toast.success("Tracking link copied!");
                          }}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                        >
                          <Share2 className="w-3.5 h-3.5 mr-1" /> Copy Link
                        </Button>
                        <Button
                          onClick={() => {
                            const trackingUrl = `${window.location.origin}/track/${order.orderNumber}`;
                            const message = `Track your order ${order.orderNumber} here: ${trackingUrl}`;
                            const whatsappUrl = `https://wa.me/${formatPhoneForWhatsApp(order.phone)}?text=${encodeURIComponent(message)}`;
                            window.open(whatsappUrl, '_blank');
                          }}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs bg-green-50 hover:bg-green-100"
                        >
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Modify Order Button */}
                  {order.status !== 'cancelled' && order.status !== 'closed' && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                        style={{ color: BRAND_COLOR }}
                        onClick={() => setModifyOrderTarget(order)}
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Modify Order (Add/Remove Items)
                      </Button>
                      {order.lastModifiedAt && (
                        <p className="text-[10px] text-gray-400 mt-1 text-center">
                          Last modified by {order.lastModifiedBy || 'Admin'} on {new Date(order.lastModifiedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cancel Order Button */}
                  {order.status !== 'cancelled' && order.status !== 'closed' && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                        onClick={() => { setCancelOrderTarget(order); setCancelReason(""); }}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1.5" /> Cancel Order
                      </Button>
                    </div>
                  )}

                  {/* Customer Rating Display */}
                  {order.rating && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-1">
                        <Star className="w-3.5 h-3.5 text-amber-500" fill="#F59E0B" />
                        <span className="text-xs font-semibold text-gray-700">Customer Rating</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className="w-4 h-4"
                            fill={s <= order.rating! ? '#F59E0B' : 'none'}
                            stroke={s <= order.rating! ? '#F59E0B' : '#D1D5DB'}
                          />
                        ))}
                        <span className="text-xs text-amber-600 font-bold ml-1">{order.rating}/5</span>
                      </div>
                      {order.ratingComment && (
                        <p className="text-xs text-gray-600 italic mt-1.5 bg-amber-50 rounded-md px-2 py-1.5">
                          "{order.ratingComment}"
                        </p>
                      )}
                      {order.ratingAt && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(order.ratingAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {currentPage}/{totalPages}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!paymentOrder} onOpenChange={(open) => { if (!open) { setPaymentOrder(null); setPaymentReceiptUrl(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" style={{ color: BRAND_COLOR }} />
              Record Payment
            </DialogTitle>
            <DialogDescription>
              Order {paymentOrder?.orderNumber || getShortOrderId(paymentOrder?.id || '')} — Total: {formatIDR(paymentOrder?.total || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (Rp)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Receipt (Optional)</Label>
              {paymentOrder && (
                <div className="mt-1.5">
                  <PaymentReceiptUpload
                    orderId={paymentOrder.id}
                    accessToken={accessToken || ""}
                    receiptUrl={paymentReceiptUrl}
                    onUploadComplete={(url) => setPaymentReceiptUrl(url)}
                    onClear={() => setPaymentReceiptUrl(null)}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOrder(null)}>Cancel</Button>
            <Button onClick={handleAddPayment} disabled={paymentLoading} className="text-white" style={{ backgroundColor: BRAND_COLOR }}>
              {paymentLoading ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={!!cancelOrderTarget} onOpenChange={() => setCancelOrderTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" /> Cancel Order
            </DialogTitle>
            <DialogDescription>
              Order {cancelOrderTarget?.orderNumber || getShortOrderId(cancelOrderTarget?.id || '')} — {formatIDR(cancelOrderTarget?.total || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700 font-medium">This action cannot be undone. The order will be marked as cancelled.</p>
            </div>
            <div>
              <Label>Reason for cancellation <span className="text-red-500">*</span></Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation, Out of stock, etc."
                rows={3}
                className="text-sm resize-none mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrderTarget(null)}>Go Back</Button>
            <Button
              onClick={handleCancelOrder}
              disabled={cancelLoading || !cancelReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelLoading ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Order Dialog */}
      {modifyOrderTarget && (
        <OrderModifyDialog
          order={modifyOrderTarget}
          open={!!modifyOrderTarget}
          onOpenChange={(open) => { if (!open) setModifyOrderTarget(null); }}
          accessToken={accessToken}
          onModified={() => { setModifyOrderTarget(null); fetchOrders(); }}
        />
      )}

      {/* Change PIN Dialog */}
      {staff && accessToken && (
        <ChangePinDialog
          open={changePinOpen}
          onOpenChange={setChangePinOpen}
          variant="staff"
          accessToken={accessToken}
          userId={staff.id}
        />
      )}

      {/* Printer Settings Dialog */}
      <Dialog open={printerSettingsOpen} onOpenChange={setPrinterSettingsOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" style={{ color: BRAND_COLOR }} />
              Printer Settings
            </DialogTitle>
          </DialogHeader>
          <PrinterSettings />
        </DialogContent>
      </Dialog>
    </div>
  );
}