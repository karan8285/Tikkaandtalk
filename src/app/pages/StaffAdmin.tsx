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
import { Users, ShoppingCart, TrendingUp, Clock, Phone, MapPin, Package, RefreshCw, Award, Plus, Minus, Key, CheckSquare, Share2, ChefHat, ShieldBan, ShieldCheck, Trash2, AlertTriangle, AlertCircle, CircleDollarSign, Filter, X, Truck, Ticket, CreditCard, Banknote, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive, LogOut, Shield, Camera, MessageSquare, Save } from "lucide-react";
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
import { getShortOrderId } from "../lib/orderUtils";
import { formatPhoneForWhatsApp } from "../lib/whatsapp";
import { APP_CONFIG } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";
import { OrderTimeline } from "../components/OrderTimeline";

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
  { value: "settings", label: "Settings", permission: "settings" },
  { value: "health", label: "Health", permission: "health" },
  { value: "staff", label: "Staff", permission: "staff" },
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
}

const ORDER_STATUSES = ["scheduled", "pending", "confirmed", "cooking", "ready", "out_for_delivery", "delivered", "closed", "cancelled"];
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

  const [adminMessages, setAdminMessages] = useState<Record<string, string>>({});
  const [savingMessage, setSavingMessage] = useState<string | null>(null);

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
        status: statusFilter, payment: "all", delivery: "all", date: "all", tab: orderSubTab,
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
  }, [currentPage, ordersPerPage, statusFilter, debouncedSearch, orderSubTab, checkForNewOrders]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-poll for new orders every 15s
  useEffect(() => {
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) { toast.success(`Order updated to ${STATUS_LABELS[newStatus]}`); fetchOrders(); }
      else { const err = await response.json().catch(() => ({})); toast.error(err.error || "Failed to update order"); }
    } catch (error: any) { toast.error(error.message); }
  };

  const saveAdminMessage = async (orderId: string, message: string) => {
    try {
      setSavingMessage(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
        body: JSON.stringify({ adminMessage: message }),
      });
      if (response.ok) {
        toast.success("Message saved — visible to customer");
        setAdminMessages(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        fetchOrders();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Failed to save message");
      }
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingMessage(null); }
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
          <Card key={order.id} className="p-4">
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
                    <span className="font-mono font-bold text-sm">
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
                  <p className="text-sm mt-1">{order.itemTitle}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <Phone className="w-3 h-3" />{order.phone}
                    <span className="font-semibold text-gray-900">{formatIDR(order.total)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleString()}
                    {order.deliveryMethod === 'delivery' && <><Truck className="w-3 h-3 inline ml-1" /> Delivery</>}
                  </p>
                </div>
              </div>

              {/* Status actions */}
              {order.status !== 'cancelled' && order.status !== 'closed' && (
                <Select value={order.status} onValueChange={(v) => updateOrderStatus(order.id, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
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
              <div className="flex gap-2 mt-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  style={{ backgroundColor: BRAND }}
                  disabled={savingMessage === order.id || (adminMessages[order.id] === undefined && !order.adminMessage)}
                  onClick={() => saveAdminMessage(order.id, adminMessages[order.id] ?? order.adminMessage ?? "")}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {savingMessage === order.id ? "Saving..." : "Save"}
                </Button>
                {(adminMessages[order.id] ?? order.adminMessage) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    disabled={savingMessage === order.id}
                    onClick={() => {
                      setAdminMessages(prev => ({ ...prev, [order.id]: "" }));
                      saveAdminMessage(order.id, "");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
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