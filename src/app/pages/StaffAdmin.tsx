/**
 * StaffAdmin — wraps the existing Admin page with staff auth context.
 * Provides role-based tab filtering and adds the Staff Management tab for superuser.
 * This page is rendered at /staff/admin for superuser and manager roles.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth, hasPermission, ROLE_LABELS, ROLE_COLORS, type StaffRole } from "../lib/staff-auth";
import { Header } from "../components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Users, ShoppingCart, TrendingUp, Clock, Phone, MapPin, Package, RefreshCw, Award, Plus, Minus, Key, CheckSquare, Share2, ChefHat, ShieldBan, ShieldCheck, Trash2, AlertTriangle, AlertCircle, CircleDollarSign, Filter, X, Truck, Ticket, CreditCard, Banknote, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive, LogOut, Shield, Camera, MessageSquare, Save, Ban, Star, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { TodaysSpecialAdmin } from "../components/TodaysSpecialAdmin";
import { KidsMenuAdmin } from "../components/KidsMenuAdmin";
import { FlashSaleAdmin } from "../components/FlashSaleAdmin";
import { RegularMenuAdmin } from "../components/RegularMenuAdmin";
import { VouchersAdmin } from "../components/VouchersAdmin";
import { TierBenefitsAdmin } from "../components/TierBenefitsAdmin";
import { SalesReportsAdmin } from "../components/SalesReportsAdmin";
import { AnalyticsAdmin } from "../components/AnalyticsAdmin";
import { RestaurantSettingsAdmin } from "../components/RestaurantSettingsAdmin";
import { SystemHealthAdmin } from "../components/SystemHealthAdmin";
import { BusinessInsightsAdmin } from "../components/BusinessInsightsAdmin";
import { PaymentGatewayAdmin } from "../components/PaymentGatewayAdmin";
import { PartyPackagesAdmin } from "../components/PartyPackagesAdmin";
import { CelebrationCategoriesAdmin } from "../components/CelebrationCategoriesAdmin";
import { HomeLayoutAdmin } from "../components/HomeLayoutAdmin";
import { CustomMenuAdmin } from "../components/CustomMenuAdmin";
import { StaffManagement } from "../components/StaffManagement";
import { CustomReportsAdmin } from "../components/CustomReportsAdmin";
import { NotificationsAdmin } from "../components/NotificationsAdmin";
import { getShortOrderId } from "../lib/orderUtils";
import { formatPhoneForWhatsApp } from "../lib/whatsapp";
import { APP_CONFIG } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";
import { OrderTimeline } from "../components/OrderTimeline";
import { OrderModifyDialog } from "../components/OrderModifyDialog";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

/**
 * Tab definitions with permission mapping.
 * Each tab is only shown if the staff role has the corresponding permission.
 */
const TAB_DEFINITIONS: { value: string; label: string; permission: string }[] = [
  { value: "orders", label: "Orders", permission: "orders" },
  { value: "customers", label: "Customers", permission: "customers" },
  { value: "sales-reports", label: "Sales", permission: "sales" },
  { value: "analytics", label: "Analytics", permission: "analytics" },
  { value: "vouchers", label: "Vouchers", permission: "vouchers" },
  { value: "tier-benefits", label: "Tiers", permission: "tiers" },
  { value: "regular-menu", label: "Menu", permission: "menu" },
  { value: "todays-special", label: "Special", permission: "special" },
  { value: "kids-menu", label: "Kids", permission: "kids" },
  { value: "flash-sale", label: "Flash", permission: "flash" },
  { value: "party-packages", label: "Parties", permission: "parties" },
  { value: "celebrations", label: "Celebrations", permission: "celebrations" },
  { value: "home-layout", label: "Layout", permission: "layout" },
  { value: "custom-menus", label: "Custom", permission: "custom" },
  { value: "insights", label: "Insights", permission: "insights" },
  { value: "payments", label: "Payments", permission: "payments" },
  { value: "notifications", label: "Notifs", permission: "notifications" },
  { value: "settings", label: "Settings", permission: "settings" },
  { value: "health", label: "Health", permission: "health" },
  { value: "staff", label: "Staff", permission: "staff" },
  { value: "reports", label: "Reports", permission: "reports" },
];

export default function StaffAdmin() {
  const navigate = useNavigate();
  const { staff, accessToken, loading: authLoading, signOut } = useStaffAuth();
  const role = staff?.role;

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (authLoading) return;
    if (!staff) { navigate("/staff"); return; }
    if (role !== 'superuser' && role !== 'manager') {
      toast.error("You don't have access to the admin panel");
      navigate("/staff");
      return;
    }
  }, [staff, authLoading, navigate, role]);

  // Filter visible tabs based on role
  const visibleTabs = TAB_DEFINITIONS.filter(tab => {
    if (!role) return false;
    // superuser-only tabs
    if (tab.permission === 'settings' && role !== 'superuser') return false;
    if (tab.permission === 'health' && role !== 'superuser') return false;
    if (tab.permission === 'staff' && role !== 'superuser') return false;
    return hasPermission(role, tab.permission);
  });

  const defaultTab = visibleTabs[0]?.value || 'orders';

  const handleSignOut = () => {
    signOut();
    navigate("/staff");
    toast.success("Signed out successfully");
  };

  if (authLoading || !staff || !accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Staff Header */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
              <Shield className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: BRAND }}>{APP_CONFIG.restaurant.name}</h1>
              <p className="text-xs text-gray-500">Staff Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{staff.name}</p>
              <Badge className={`text-[10px] ${ROLE_COLORS[staff.role]}`}>{ROLE_LABELS[staff.role]}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4">
        <Tabs defaultValue={defaultTab} className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-full min-w-max">
              {visibleTabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Orders Tab — Reuses existing Admin logic but with staff token */}
          <TabsContent value="orders">
            <StaffOrdersTab accessToken={accessToken} role={role!} />
          </TabsContent>

          <TabsContent value="customers">
            <StaffCustomersTab accessToken={accessToken} />
          </TabsContent>

          <TabsContent value="sales-reports">
            <SalesReportsAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="vouchers">
            <VouchersAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="tier-benefits">
            <TierBenefitsAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="regular-menu">
            <RegularMenuAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="todays-special">
            <TodaysSpecialAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="kids-menu">
            <KidsMenuAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="flash-sale">
            <FlashSaleAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="party-packages">
            <PartyPackagesAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="celebrations">
            <CelebrationCategoriesAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="home-layout">
            <HomeLayoutAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="custom-menus">
            <CustomMenuAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="insights">
            <BusinessInsightsAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentGatewayAdmin customToken={accessToken} />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsAdmin customToken={accessToken} />
          </TabsContent>

          {role === 'superuser' && (
            <>
              <TabsContent value="settings">
                <RestaurantSettingsAdmin customToken={accessToken} />
              </TabsContent>

              <TabsContent value="health">
                <SystemHealthAdmin customToken={accessToken} />
              </TabsContent>

              <TabsContent value="staff">
                <StaffManagement accessToken={accessToken} />
              </TabsContent>

              <TabsContent value="reports">
                <CustomReportsAdmin customToken={accessToken} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}

// ─── Orders Sub-component (simplified from Admin.tsx) ────────────────────────

interface Order {
  id: string;
  userId: string;
  itemTitle: string;
  total: number;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  phone: string;
  address?: string;
  specialInstructions?: string;
  items?: any[];
  paymentReceived?: boolean;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  paymentMethod?: string;
  pointsAwarded?: boolean;
  pointsEarned?: number;
  statusHistory?: any[];
  cancelledBy?: string;
  cancellationReason?: string;
  orderNumber?: string;
  promoCode?: string;
  promoDiscount?: number;
  promoVoucherTitle?: string;
  scheduledAt?: string;
  proofOfDeliveryUrl?: string;
  proofOfDeliveryAt?: string;
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
  modificationHistory?: any[];
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

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500", pending: "bg-orange-500", confirmed: "bg-teal-500",
  cooking: "bg-orange-600", ready: "bg-purple-500", out_for_delivery: "bg-orange-500",
  delivered: "bg-teal-500", closed: "bg-green-500", cancelled: "bg-red-500",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", pending: "Order Created", confirmed: "Confirmed",
  cooking: "Cooking", ready: "Ready", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", closed: "Closed", cancelled: "Cancelled",
};

function StaffOrdersTab({ accessToken, role }: { accessToken: string; role: StaffRole }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(10);
  const [orderSubTab, setOrderSubTab] = useState<"active" | "closed">("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderStats, setOrderStats] = useState({ totalOrders: 0, activeCount: 0, closedCount: 0, cancelledCount: 0, scheduledCount: 0, unpaidCount: 0, unpaidTotal: 0, partialCount: 0, partialTotal: 0, paidCount: 0, paidTotal: 0, todayCount: 0, todayRevenue: 0 });

  // Bulk actions
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkStatusDialog, setBulkStatusDialog] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("closed");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);

  // Unified local edits per order
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [adminMessages, setAdminMessages] = useState<Record<string, string>>({});
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [savingOrder, setSavingOrder] = useState<string | null>(null);

  // Payment management
  const [addPaymentOrderId, setAddPaymentOrderId] = useState<string | null>(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState("");
  const [addPaymentNote, setAddPaymentNote] = useState("");
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);

  // Cancel order
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Modify order
  const [modifyOrderTarget, setModifyOrderTarget] = useState<Order | null>(null);

  const { checkForNewOrders } = useNewOrderAlert({ label: "Admin" });
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
        page: currentPage.toString(), limit: ordersPerPage.toString(),
        status: statusFilter, payment: paymentFilter, delivery: deliveryFilter, date: "all", tab: orderSubTab,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetch(`${API_BASE}/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessTokenRef.current },
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
        setTotalFiltered(data.totalFiltered);
        setTotalPages(data.totalPages);
        setCurrentPage(data.page);
        if (data.stats) setOrderStats(data.stats);

        // Check for new orders and play sound alert (only on active tab)
        if (orderSubTab === "active") {
          checkForNewOrders((data.orders || []).map((o: Order) => o.id));
        }
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, ordersPerPage, statusFilter, paymentFilter, deliveryFilter, debouncedSearch, orderSubTab, checkForNewOrders]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-poll for new orders every 15s
  useEffect(() => {
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

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
      const response = await fetch(`${API_BASE}/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
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
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingOrder(null); }
  };

  // Check if an order has unsaved changes
  const hasChanges = (order: Order): boolean => {
    const statusChanged = pendingStatuses[order.id] !== undefined && pendingStatuses[order.id] !== order.status;
    const msgChanged = adminMessages[order.id] !== undefined;
    const noteChanged = deliveryNotes[order.id] !== undefined;
    return statusChanged || msgChanged || noteChanged;
  };

  // Cancel order handler
  const handleCancelOrder = async () => {
    if (!cancelOrderTarget || !cancelReason) return;
    try {
      setCancelLoading(true);
      const response = await fetch(`${API_BASE}/admin/orders/${cancelOrderTarget.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
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
    } catch (error: any) { toast.error(error.message); }
    finally { setCancelLoading(false); }
  };

  const handleAddPayment = async (orderId: string, amount: number, method?: string, note?: string) => {
    try {
      setPaymentLoading(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
        body: JSON.stringify({ addPayment: { amount, method, note } }),
      });
      if (response.ok) {
        toast.success(`Payment of ${formatIDR(amount)} recorded`);
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to record payment");
      }
    } catch (error: any) { toast.error(error.message); }
    finally { setPaymentLoading(null); }
  };

  const handlePaymentStatusChange = async (orderId: string, newStatus: string) => {
    try {
      setPaymentLoading(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
        body: JSON.stringify({ paymentStatus: newStatus, paymentReceived: newStatus === 'paid' }),
      });
      if (response.ok) {
        toast.success(`Payment status updated to ${newStatus}`);
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to update payment status");
      }
    } catch (error: any) { toast.error(error.message); }
    finally { setPaymentLoading(null); }
  };

  // Bulk action handlers
  const toggleSelectAll = () => {
    const pageOrderIds = orders.map(o => o.id);
    const allPageSelected = pageOrderIds.every(id => selectedOrders.has(id));
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

  const handleBulkStatusUpdate = async () => {
    if (selectedOrders.size === 0) {
      toast.error("No orders selected");
      return;
    }
    try {
      setBulkActionLoading(true);
      const orderIds = Array.from(selectedOrders);
      const ordersToUpdate = orderIds.filter(orderId => {
        const order = orders.find(o => o.id === orderId);
        return order && order.status !== "cancelled";
      });
      const skippedCount = orderIds.length - ordersToUpdate.length;
      if (ordersToUpdate.length === 0) {
        toast.error("All selected orders are cancelled and cannot be updated");
        setBulkActionLoading(false);
        return;
      }
      const results = await Promise.allSettled(
        ordersToUpdate.map(orderId =>
          fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
            body: JSON.stringify({ status: bulkStatus }),
          })
        )
      );
      const successCount = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
      const failCount = results.length - successCount;
      if (successCount > 0) toast.success(`${successCount} order(s) updated to ${STATUS_LABELS[bulkStatus]}`);
      if (failCount > 0) toast.error(`${failCount} order(s) failed to update`);
      if (skippedCount > 0) toast.info(`${skippedCount} cancelled order(s) skipped`);
      setSelectedOrders(new Set());
      setBulkStatusDialog(false);
      fetchOrders();
    } catch (error) {
      console.error("Bulk update failed:", error);
      toast.error("Failed to update orders");
    } finally {
      setBulkActionLoading(false);
    }
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
      if (ordersToClose.length === 0) {
        toast.error("All selected orders are cancelled and cannot be closed");
        setBulkActionLoading(false);
        return;
      }
      const results = await Promise.allSettled(
        ordersToClose.map(orderId =>
          fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
            body: JSON.stringify({ status: "closed" }),
          })
        )
      );
      const successCount = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
      const failCount = results.length - successCount;
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

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3" style={{ borderLeft: `4px solid ${BRAND}` }}>
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-xl font-bold">{orderStats.activeCount}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-green-500">
          <p className="text-xs text-muted-foreground">Closed</p>
          <p className="text-xl font-bold">{orderStats.closedCount}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-orange-500">
          <p className="text-xs text-muted-foreground">Unpaid</p>
          <p className="text-xl font-bold">{orderStats.unpaidCount}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-blue-500">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-xl font-bold">{orderStats.todayCount}</p>
        </Card>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate("/staff/kitchen")}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <ChefHat className="w-4 h-4 mr-2" />
          Kitchen
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate("/staff/create-order")}
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Order
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchOrders()}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          onClick={() => { setOrderSubTab("active"); setStatusFilter("all"); setSearchQuery(""); }}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all ${orderSubTab === "active" ? "text-white" : "bg-white text-gray-600"}`}
          style={orderSubTab === "active" ? { backgroundColor: BRAND } : {}}
        >
          <ShoppingCart className="w-4 h-4 inline mr-1" /> Active ({orderStats.activeCount})
        </button>
        <button
          onClick={() => { setOrderSubTab("closed"); setStatusFilter("all"); setSearchQuery(""); }}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all ${orderSubTab === "closed" ? "text-white" : "bg-white text-gray-600"}`}
          style={orderSubTab === "closed" ? { backgroundColor: BRAND } : {}}
        >
          <Archive className="w-4 h-4 inline mr-1" /> Closed ({orderStats.closedCount + orderStats.cancelledCount})
        </button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search orders by number, phone, name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Filters Row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500">Filters:</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Status</SelectItem>
            {ORDER_STATUSES.map(s => (
              <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        {(statusFilter !== "all" || paymentFilter !== "all" || deliveryFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => { setStatusFilter("all"); setPaymentFilter("all"); setDeliveryFilter("all"); setCurrentPage(1); }}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk Actions Bar — active tab only */}
      {orderSubTab === "active" && orders.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={orders.length > 0 && orders.every(o => selectedOrders.has(o.id))}
                onCheckedChange={toggleSelectAll}
                id="select-all-staff"
              />
              <Label htmlFor="select-all-staff" className="cursor-pointer text-sm">
                {selectedOrders.size > 0 
                  ? `${selectedOrders.size} order(s) selected` 
                  : `Select page (${orders.length})`}
              </Label>
            </div>

            {selectedOrders.size > 0 && (
              <div className="flex gap-2 w-full md:w-auto">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkClose}
                  disabled={bulkActionLoading}
                  className="flex-1 md:flex-none"
                >
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Close Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkStatusDialog(true)}
                  disabled={bulkActionLoading}
                  className="flex-1 md:flex-none"
                >
                  Update Status
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Orders List */}
      <div className="space-y-2">
        {orders.map(order => (
          <Card key={order.id} className="p-4 shadow-sm" style={STATUS_BG_STYLE[order.status] || { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {orderSubTab === "active" && (
                  <Checkbox
                    checked={selectedOrders.has(order.id)}
                    onCheckedChange={() => toggleSelectOrder(order.id)}
                    id={`order-staff-${order.id}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-gray-900">
                      {getShortOrderId(order.orderNumber || order.id)}
                    </span>
                    <Badge className={`text-[10px] text-white ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </Badge>
                    {order.paymentStatus && (
                      <Badge variant="outline" className={`text-[10px] ${
                        order.paymentStatus === 'paid' ? 'text-green-700 border-green-300' :
                        order.paymentStatus === 'partial' ? 'text-orange-700 border-orange-300' :
                        'text-red-700 border-red-300'
                      }`}>
                        {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1 text-gray-800">{order.itemTitle}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                    <Phone className="w-3 h-3" />{order.phone}
                    <span className="font-semibold text-gray-900">{formatIDR(order.total)}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(order.createdAt).toLocaleString()}
                    {order.deliveryMethod === 'delivery' && <><Truck className="w-3 h-3 inline ml-1" /> Delivery</>}
                  </p>
                </div>
              </div>

              {/* Status actions */}
              {order.status !== 'cancelled' && order.status !== 'closed' && (
                <Select value={pendingStatuses[order.id] ?? order.status} onValueChange={(v) => setPendingStatuses(prev => ({ ...prev, [order.id]: v }))}>
                  <SelectTrigger className={`w-[130px] h-8 text-xs ${pendingStatuses[order.id] && pendingStatuses[order.id] !== order.status ? 'ring-2 ring-amber-400' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.filter(s => s !== 'cancelled').map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Payment Status Management */}
            {(() => {
              const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
              const isPaid = effectivePS === 'paid';
              const paidSoFar = order.paidAmount || 0;
              const orderTotal = order.total || 0;
              const remaining = orderTotal - paidSoFar;
              return (
                <div className="mt-3 pt-3 border-t">
                  <Label className="text-xs font-medium mb-1.5 block">Payment Status</Label>
                  <div className="flex gap-1.5">
                    {(['unpaid', 'partial', 'paid'] as const).map((ps) => {
                      const isActive = effectivePS === ps;
                      const isLockedBecausePaid = isPaid && ps !== 'paid';
                      const isPaidLocked = ps === 'paid' && paidSoFar < orderTotal;
                      const isPartialLocked = ps === 'partial';
                      const isLocked = isPaidLocked || isPartialLocked || isLockedBecausePaid;
                      const colors = {
                        unpaid: { bg: 'bg-red-50 border-red-300 text-red-700', active: 'bg-red-500 text-white border-red-500' },
                        partial: { bg: 'bg-amber-50 border-amber-300 text-amber-700', active: 'bg-amber-500 text-white border-amber-500' },
                        paid: { bg: 'bg-green-50 border-green-300 text-green-700', active: 'bg-green-500 text-white border-green-500' },
                      };
                      return (
                        <button
                          key={ps}
                          onClick={() => { if (!isLocked) handlePaymentStatusChange(order.id, ps); }}
                          disabled={isLocked || paymentLoading === order.id}
                          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                            isActive ? colors[ps].active : isLocked ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : colors[ps].bg
                          }`}
                        >
                          {ps === 'unpaid' ? 'Unpaid' : ps === 'partial' ? 'Partial' : 'Paid'}
                        </button>
                      );
                    })}
                  </div>

                  {isPaid && (
                    <p className="mt-1.5 text-[10px] text-green-600 font-medium">Fully paid — payment status is locked.</p>
                  )}
                  {!isPaid && paidSoFar < orderTotal && order.status !== 'cancelled' && (
                    <p className="mt-1.5 text-[10px] text-gray-500 italic">Use "Add Payment" to record payments. "Paid" unlocks when collected ≥ total.</p>
                  )}

                  {/* Paid Amount Display */}
                  {(effectivePS === 'partial' || (paidSoFar > 0 && !isPaid)) && (
                    <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <span className="font-medium text-amber-800">
                        Collected: {formatIDR(paidSoFar)} of {formatIDR(orderTotal)}
                      </span>
                      <span className="text-amber-600 ml-1">
                        ({formatIDR(remaining)} remaining)
                      </span>
                    </div>
                  )}

                  {/* Payment History Log */}
                  {order.paymentHistory && order.paymentHistory.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500">Payment History</div>
                      {order.paymentHistory.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1 border">
                          <div className="flex items-center gap-1.5">
                            <span className="text-green-600 font-semibold">+{formatIDR(entry.amount)}</span>
                            {entry.method && <span className="text-gray-400">• {entry.method}</span>}
                          </div>
                          <span className="text-gray-400">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Payment Button / Form */}
                  {!isPaid && order.status !== 'cancelled' && (
                    <>
                      {addPaymentOrderId === order.id ? (
                        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                          {(() => {
                            const enteredAmt = Number(addPaymentAmount) || 0;
                            const exceedsRemaining = enteredAmt > remaining;
                            return (
                              <>
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-semibold text-blue-800">Add Payment</div>
                                  <div className="text-[10px] text-blue-600 font-medium">Remaining: {formatIDR(remaining)}</div>
                                </div>
                                <Input
                                  type="number"
                                  placeholder={`Amount (max ${formatIDR(remaining)})`}
                                  value={addPaymentAmount}
                                  onChange={(e) => setAddPaymentAmount(e.target.value)}
                                  max={remaining}
                                  min={1}
                                  className={`h-8 text-sm ${exceedsRemaining ? 'border-red-400 bg-red-50' : ''}`}
                                />
                                {exceedsRemaining && (
                                  <p className="text-[10px] text-red-600 font-medium">Amount exceeds remaining balance. Max: {formatIDR(remaining)}</p>
                                )}
                              </>
                            );
                          })()}
                          <div className="grid grid-cols-2 gap-2">
                            <Input type="text" placeholder="Method (Cash, Transfer)" value={addPaymentMethod} onChange={(e) => setAddPaymentMethod(e.target.value)} className="h-8 text-xs" />
                            <Input type="text" placeholder="Note (optional)" value={addPaymentNote} onChange={(e) => setAddPaymentNote(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              disabled={!addPaymentAmount || Number(addPaymentAmount) <= 0 || Number(addPaymentAmount) > remaining || paymentLoading === order.id}
                              onClick={async () => {
                                const amt = Number(addPaymentAmount);
                                if (amt > 0 && amt <= remaining) {
                                  await handleAddPayment(order.id, amt, addPaymentMethod || undefined, addPaymentNote || undefined);
                                  setAddPaymentOrderId(null);
                                  setAddPaymentAmount("");
                                  setAddPaymentMethod("");
                                  setAddPaymentNote("");
                                }
                              }}
                            >
                              {paymentLoading === order.id ? "Saving..." : "Save Payment"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => { setAddPaymentOrderId(null); setAddPaymentAmount(""); setAddPaymentMethod(""); setAddPaymentNote(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full h-7 text-xs border-dashed"
                          onClick={() => { setAddPaymentOrderId(order.id); setAddPaymentAmount(""); setAddPaymentMethod(""); setAddPaymentNote(""); }}
                        >
                          <Banknote className="w-3.5 h-3.5 mr-1" /> Add Payment
                        </Button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Admin Message to Customer */}
            <div className="mt-3 pt-3 border-t">
              <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" style={{ color: BRAND }} />
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

            {/* Note to Delivery Guy */}
            <div className="mt-3 pt-3 border-t">
              <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" style={{ color: BRAND }} />
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

            {/* Unified Save Button */}
            <div className="mt-3 pt-3 border-t">
              <Button
                size="sm"
                className="w-full h-9 text-xs font-semibold text-white"
                style={{ backgroundColor: hasChanges(order) ? BRAND : '#9ca3af' }}
                disabled={savingOrder === order.id || !hasChanges(order)}
                onClick={() => saveAllChanges(order)}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {savingOrder === order.id ? "Saving All Changes..." : hasChanges(order) ? "Save All Changes" : "No Changes"}
              </Button>
              {hasChanges(order) && (
                <p className="text-[10px] text-amber-600 mt-1 text-center font-medium">
                  You have unsaved changes
                </p>
              )}
            </div>

            {/* Order Timeline */}
            {expandedTimeline === order.id && order.statusHistory && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> ORDER TIMELINE
                </p>

                {/* Proof of Delivery in timeline */}
                {order.proofOfDeliveryUrl && (
                  <div className="mb-3 bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5 mb-2">
                      <Camera className="w-3.5 h-3.5" />
                      Proof of Delivery
                      {order.proofOfDeliveryAt && (
                        <span className="font-normal text-green-600 ml-auto">
                          {new Date(order.proofOfDeliveryAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </p>
                    <img
                      src={order.proofOfDeliveryUrl}
                      alt="Proof of delivery"
                      className="w-full max-h-40 object-cover rounded-md border border-green-300 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(order.proofOfDeliveryUrl, '_blank')}
                    />
                  </div>
                )}

                <OrderTimeline 
                  statusHistory={order.statusHistory} 
                  createdAt={order.createdAt}
                />
              </div>
            )}
            <button
              onClick={() => setExpandedTimeline(expandedTimeline === order.id ? null : order.id)}
              className="mt-2 text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: BRAND }}
            >
              <Clock className="w-3 h-3" />
              {expandedTimeline === order.id ? "Hide Timeline" : "View Timeline"}
            </button>

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
                  style={{ color: BRAND }}
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
        ))}

        {orders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No orders found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Page {currentPage} of {totalPages} ({totalFiltered} orders)
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Status Update Dialog */}
      <Dialog open={bulkStatusDialog} onOpenChange={setBulkStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedOrders.size} selected order(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-status-staff">New Status</Label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.filter(s => s !== "cancelled").map(status => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkStatusUpdate} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Updating..." : "Update Status"}
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
    </div>
  );
}

// ─── Customers Sub-component ────────────────────────────────────────────────

interface CustomerUser {
  id: string;
  name: string;
  phone: string;
  points: number;
  createdAt: string;
  isAdmin?: boolean;
  blocked?: boolean;
}

function StaffCustomersTab({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(u =>
    !u.isAdmin && (
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
    )
  );

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: BRAND }} />
          Customers ({filtered.length})
        </h3>
      </div>
      <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-2">
        {filtered.map(user => (
          <Card key={user.id} className={`p-3 ${user.blocked ? 'opacity-50 bg-red-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{user.name}</p>
                <p className="text-xs text-gray-500">{user.phone}</p>
              </div>
              <div className="text-right">
                <Badge variant="secondary">{user.points} pts</Badge>
                {user.blocked && <Badge variant="destructive" className="ml-1 text-[10px]">Blocked</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}