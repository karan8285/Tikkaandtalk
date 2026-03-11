import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
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
import { Users, ShoppingCart, TrendingUp, Clock, Phone, MapPin, Package, RefreshCw, Award, Plus, Minus, Key, CheckSquare, Share2, ChefHat, ShieldBan, ShieldCheck, Trash2, AlertTriangle, AlertCircle, CircleDollarSign, Filter, X, Truck, Ticket, CreditCard, Banknote } from "lucide-react";
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
import { getShortOrderId } from "../lib/orderUtils";
import { formatPhoneForWhatsApp } from "../lib/whatsapp";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface User {
  id: string;
  email?: string;
  name: string;
  phone: string;
  points: number;
  createdAt: string;
  isAdmin?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  blockedAt?: string;
}

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
  paymentDetails?: string;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  paymentMethod?: string;
  pointsAwarded?: boolean;
  pointsEarned?: number;
  statusHistory?: any[];
  cancelledBy?: string; // 'user' or 'admin'
  cancellationReason?: string; // Admin's reason for cancellation
  orderNumber?: string; // New field for order number
  promoCode?: string;
  promoDiscount?: number;
  promoVoucherTitle?: string;
}

const ORDER_STATUSES = ["pending", "confirmed", "cooking", "ready", "out_for_delivery", "delivered", "closed", "cancelled"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500",
  confirmed: "bg-teal-500",
  cooking: "bg-orange-600",
  ready: "bg-purple-500",
  out_for_delivery: "bg-orange-500",
  delivered: "bg-teal-500",
  closed: "bg-green-500",
  cancelled: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Order Created",
  confirmed: "Confirmed",
  cooking: "Cooking",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function Admin() {
  const navigate = useNavigate();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [orderChanges, setOrderChanges] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [previousOrderCount, setPreviousOrderCount] = useState(0);
  const [notificationSound, setNotificationSound] = useState<HTMLAudioElement | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Add Payment form state
  const [addPaymentOrderId, setAddPaymentOrderId] = useState<string | null>(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState("");
  const [addPaymentNote, setAddPaymentNote] = useState("");



  // Order filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Bulk actions
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkStatusDialog, setBulkStatusDialog] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("closed");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // Block/Delete user
  const [blockDialog, setBlockDialog] = useState(false);
  const [blockCustomer, setBlockCustomer] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockingUser, setBlockingUser] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteCustomer, setDeleteCustomer] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Reset PIN dialog
  const [resetPinDialog, setResetPinDialog] = useState(false);
  const [resetPinCustomer, setResetPinCustomer] = useState<User | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [resettingPin, setResettingPin] = useState(false);
  
  // Initialize notification sound
  useEffect(() => {
    // Create notification sound (using a browser notification sound or a simple beep)
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PV6zn77BdGAg+ltryxHgpBSh+zPHcizsIGGS57OihUhELTKXh8bllHAU2jdXzzn0vBSF1xe/glEILElyx6OyrWBUIQ5zd8sFuJAU4ktjywXkqBSp/zfDajz0IGGm67+mgUBALTqnj8blnHAU8k9f0y3suBSh6yPDdjz0KFV+16em');
    audio.volume = 0.7;
    setNotificationSound(audio);
  }, []);
  
  useEffect(() => {
    // Wait for auth to finish loading before making any decisions
    if (authLoading) {
      console.log("⏳ Auth still loading, waiting...");
      return;
    }

    // Now we can safely check if user is authenticated
    if (!user) {
      console.log("❌ No user found after auth loaded, redirecting to login");
      navigate("/login");
      return;
    }

    if (!user.isAdmin) {
      console.log("❌ User is not admin, redirecting to home");
      toast.error("Admin access required");
      navigate("/");
      return;
    }

    console.log("✅ Admin user authenticated, loading dashboard");
    
    // Load initial data
    fetchAdminData();
    
    // Start polling after a delay to ensure initial data is loaded
    // This prevents the first poll from triggering notifications for existing orders
    let intervalId: NodeJS.Timeout | null = null;
    const pollingTimeout = setTimeout(() => {
      console.log("✅ Starting order polling (every 15 seconds)...");
      intervalId = setInterval(fetchOrders, 15000);
    }, 3000); // Wait 3 seconds for initial load to complete
    
    // Cleanup
    return () => {
      clearTimeout(pollingTimeout);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [user, authLoading, navigate]);

  const fetchAdminData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      
      console.log("🔍 Fetching admin data with token:", accessToken);
      console.log("🔍 API Base:", API_BASE);
      
      const [usersResponse, ordersResponse] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, {
          headers: { 
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken 
          },
        }),
        fetch(`${API_BASE}/admin/orders`, {
          headers: { 
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken 
          },
        }),
      ]);

      console.log(`📊 Users response status: ${usersResponse.status}`);
      console.log(`📊 Orders response status: ${ordersResponse.status}`);

      // If unauthorized, clear localStorage and redirect to login
      if (usersResponse.status === 401 || ordersResponse.status === 401) {
        console.log("❌ Unauthorized - clearing localStorage and redirecting to login");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        toast.error("Session expired. Please log in again.");
        navigate("/login");
        return;
      }

      if (usersResponse.ok && ordersResponse.ok) {
        const usersData = await usersResponse.json();
        const ordersData = await ordersResponse.json();

        setUsers(usersData.users || []);
        const sortedOrders = (ordersData.orders || []).sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(sortedOrders);
        
        // Initialize previousOrderCount with existing orders (don't trigger notification on initial load)
        setPreviousOrderCount(sortedOrders.length);
        setIsInitialLoad(false);
        
        console.log(`📊 Initial order count: ${sortedOrders.length} orders`);
      } else {
        const usersError = !usersResponse.ok ? await usersResponse.text() : null;
        const ordersError = !ordersResponse.ok ? await ordersResponse.text() : null;
        
        if (usersError) console.error(`❌ Users error: ${usersError}`);
        if (ordersError) console.error(`❌ Orders error: ${ordersError}`);
        
        toast.error("Failed to load admin data");
      }
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
      toast.error(`Failed to load admin data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Sort orders by most recent first
        const sortedOrders = [...(data.orders || [])].sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        setOrders(sortedOrders);
        
        // Check if there are new orders (only if not initial load and we have a previous count)
        if (sortedOrders.length > previousOrderCount && !isInitialLoad && previousOrderCount > 0) {
          const newOrdersCount = sortedOrders.length - previousOrderCount;
          
          console.log(`🔔 NEW ORDERS DETECTED! Previous: ${previousOrderCount}, Current: ${sortedOrders.length}, New: ${newOrdersCount}`);
          
          toast.success(`New orders received: ${newOrdersCount}`);
          
          // Play notification sound if available
          if (notificationSound) {
            notificationSound.play().catch(error => {
              console.error("Failed to play notification sound:", error);
            });
          }
        }
        
        setPreviousOrderCount(sortedOrders.length);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        toast.success(`Order status updated to ${STATUS_LABELS[newStatus]}`);
        fetchOrders();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Failed to update order status:", response.status, errorData);
        toast.error(`Failed to update order status: ${errorData.error || response.status}`);
      }
    } catch (error) {
      console.error("Failed to update order status:", error);
      toast.error(`Failed to update order status: ${error.message}`);
    }
  };

  const togglePaymentReceived = async (orderId: string, currentValue: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ paymentReceived: !currentValue }),
      });

      if (response.ok) {
        toast.success(`Payment ${!currentValue ? 'received' : 'unmarked'}`);
        fetchOrders();
      } else {
        toast.error("Failed to update payment status");
      }
    } catch (error) {
      console.error("Failed to update payment status:", error);
      toast.error("Failed to update payment status");
    }
  };

  // Track changes locally without submitting
  const handleStatusChange = (orderId: string, newStatus: string) => {
    setOrderChanges(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        status: newStatus
      }
    }));
  };

  const handlePaymentStatusChange = (orderId: string, newStatus: 'unpaid' | 'partial' | 'paid') => {
    setOrderChanges(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        paymentStatus: newStatus,
        paymentReceived: newStatus === 'paid',
        // Clear payment details if setting to unpaid
        paymentDetails: newStatus === 'unpaid' ? undefined : (prev[orderId]?.paymentDetails || '')
      }
    }));
  };

  // Legacy - kept for backward compat but now routes through paymentStatus
  const handlePaymentChange = (orderId: string, newValue: boolean) => {
    handlePaymentStatusChange(orderId, newValue ? 'paid' : 'unpaid');
  };

  const handlePaymentDetailsChange = (orderId: string, details: string) => {
    setOrderChanges(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        paymentDetails: details
      }
    }));
  };

  const handleAddPayment = async (orderId: string, amount: number, method?: string, note?: string) => {
    try {
      setSubmitting(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ addPayment: { amount, method, note } }),
      });

      if (response.ok) {
        toast.success(`Payment of Rp ${amount.toLocaleString()} recorded`);
        fetchOrders();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(`Failed to add payment: ${errorData.error || response.status}`);
      }
    } catch (error: any) {
      console.error("Failed to add payment:", error);
      toast.error(`Failed to add payment: ${error.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  const submitOrderChanges = async (orderId: string) => {
    const changes = orderChanges[orderId];
    if (!changes) return;

    try {
      setSubmitting(orderId);
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify(changes),
      });

      if (response.ok) {
        toast.success("Order updated successfully");
        // Clear pending changes for this order
        setOrderChanges(prev => {
          const newChanges = { ...prev };
          delete newChanges[orderId];
          return newChanges;
        });
        fetchOrders();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Failed to update order:", response.status, errorData);
        toast.error(`Failed to update order: ${errorData.error || response.status}`);
      }
    } catch (error) {
      console.error("Failed to update order:", error);
      toast.error(`Failed to update order: ${error.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  const cancelOrderChanges = (orderId: string) => {
    setOrderChanges(prev => {
      const newChanges = { ...prev };
      delete newChanges[orderId];
      return newChanges;
    });
  };

  const openCancelDialog = (order: Order) => {
    setSelectedOrder(order);
    setCancellationReason("");
    setCancelDialog(true);
  };

  const cancelOrder = async () => {
    if (!selectedOrder || !cancellationReason) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setCancelling(true);
      const response = await fetch(`${API_BASE}/admin/orders/${selectedOrder.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({
          status: "cancelled",
          cancellationReason: cancellationReason,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Order cancelled: ${cancellationReason}`);
        setCancelDialog(false);
        fetchOrders();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to cancel order");
      }
    } catch (error) {
      console.error("Failed to cancel order:", error);
      toast.error("Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  // Bulk action handlers
  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
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
      
      // Filter out cancelled orders
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
      
      // Update orders in parallel
      const results = await Promise.allSettled(
        ordersToUpdate.map(orderId =>
          fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
              "X-Custom-Auth": accessToken,
            },
            body: JSON.stringify({ status: bulkStatus }),
          })
        )
      );

      const successCount = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
      const failCount = results.length - successCount;

      if (successCount > 0) {
        toast.success(`${successCount} order(s) updated to ${STATUS_LABELS[bulkStatus]}`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} order(s) failed to update`);
      }
      if (skippedCount > 0) {
        toast.info(`${skippedCount} cancelled order(s) skipped`);
      }

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
      
      // Filter out cancelled orders
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
      
      // Close orders in parallel
      const results = await Promise.allSettled(
        ordersToClose.map(orderId =>
          fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
              "X-Custom-Auth": accessToken,
            },
            body: JSON.stringify({ status: "closed" }),
          })
        )
      );

      const successCount = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
      const failCount = results.length - successCount;

      if (successCount > 0) {
        toast.success(`${successCount} order(s) closed successfully`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} order(s) failed to close`);
      }
      if (skippedCount > 0) {
        toast.info(`${skippedCount} cancelled order(s) skipped`);
      }

      setSelectedOrders(new Set());
      fetchOrders();
    } catch (error) {
      console.error("Bulk close failed:", error);
      toast.error("Failed to close orders");
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Points dialog placeholder (referenced in template)
  const openPointsDialog = (_customer: User) => {
    toast.info("Points adjustment coming soon");
  };

  // Reset PIN dialog helpers
  const openResetPinDialog = (customer: User) => {
    setResetPinCustomer(customer);
    setNewPin("");
    setConfirmPin("");
    setResetPinDialog(true);
  };

  const handleResetPin = async () => {
    if (!resetPinCustomer) return;

    // Validate PIN format
    if (!/^\d{6}$/.test(newPin)) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }

    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    try {
      setResettingPin(true);

      const response = await fetch(
        `${API_BASE}/admin/users/${resetPinCustomer.id}/reset-pin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken || "",
          },
          body: JSON.stringify({ pin: newPin }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reset PIN");
      }

      toast.success(`PIN reset successfully for ${resetPinCustomer.name}`);
      setResetPinDialog(false);
      setResetPinCustomer(null);
      setNewPin("");
      setConfirmPin("");
    } catch (error: any) {
      console.error("Failed to reset PIN:", error);
      toast.error(error.message || "Failed to reset PIN");
    } finally {
      setResettingPin(false);
    }
  };

  // Block/Unblock user
  const handleBlockToggle = async () => {
    if (!blockCustomer) return;

    const willBlock = !blockCustomer.blocked;

    try {
      setBlockingUser(true);

      const response = await fetch(
        `${API_BASE}/admin/users/${blockCustomer.id}/block`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken || "",
          },
          body: JSON.stringify({
            blocked: willBlock,
            reason: willBlock ? blockReason : undefined,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${willBlock ? "block" : "unblock"} user`);
      }

      toast.success(`${blockCustomer.name} has been ${willBlock ? "blocked" : "unblocked"}`);
      setBlockDialog(false);
      setBlockCustomer(null);
      setBlockReason("");
      fetchAdminData();
    } catch (error: any) {
      console.error("Block/unblock failed:", error);
      toast.error(error.message || "Failed to update user");
    } finally {
      setBlockingUser(false);
    }
  };

  // Delete user
  const handleDeleteUser = async () => {
    if (!deleteCustomer) return;

    try {
      setDeletingUser(true);

      const response = await fetch(
        `${API_BASE}/admin/users/${deleteCustomer.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken || "",
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete user");
      }

      toast.success(`${deleteCustomer.name} has been permanently deleted`);
      setDeleteDialog(false);
      setDeleteCustomer(null);
      setDeleteConfirmName("");
      fetchAdminData();
    } catch (error: any) {
      console.error("Delete user failed:", error);
      toast.error(error.message || "Failed to delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  // Calculate statistics
  const todayOrders = orders.filter(o => {
    const orderDate = new Date(o.createdAt);
    const today = new Date();
    return orderDate.toDateString() === today.toDateString();
  });

  const todayRevenue = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const activeOrders = orders.filter(o => 
    !["delivered", "cancelled"].includes(o.status)
  );
  const newCustomersToday = users.filter(u => {
    const joinDate = new Date(u.createdAt);
    const today = new Date();
    return joinDate.toDateString() === today.toDateString() && !u.isAdmin;
  });

  const getCustomerByUserId = (userId: string) => {
    return users.find(u => u.id === userId);
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active_group" ? !["delivered", "closed", "cancelled"].includes(order.status) : order.status === statusFilter);
    
    // Payment filter (support new paymentStatus + legacy)
    const effectivePaymentStatus = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
    const matchesPayment = paymentFilter === "all" || 
      (paymentFilter === "paid" && effectivePaymentStatus === 'paid') ||
      (paymentFilter === "partial" && effectivePaymentStatus === 'partial') ||
      (paymentFilter === "unpaid" && effectivePaymentStatus === 'unpaid' && order.status !== "cancelled");
    
    // Delivery method filter
    const matchesDelivery = deliveryFilter === "all" || order.deliveryMethod === deliveryFilter;
    
    // Date filter
    const matchesDate = dateFilter === "all" || (() => {
      const orderDate = new Date(order.createdAt);
      const today = new Date();
      return orderDate.toDateString() === today.toDateString();
    })();
    
    // Enhanced search logic
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" || 
      // Search short order ID (TNT-102)
      getShortOrderId(order.orderNumber || order.id).toLowerCase().includes(searchLower) ||
      // Search order number (TNT00000001)
      order.orderNumber?.toLowerCase().includes(searchLower) ||
      // Search legacy item title
      order.itemTitle?.toLowerCase().includes(searchLower) ||
      // Search through items array
      (order.items && order.items.some(item => 
        item.title?.toLowerCase().includes(searchLower)
      )) ||
      // Search phone number
      order.phone?.includes(searchQuery) ||
      // Search UUID (fallback)
      order.id?.toLowerCase().includes(searchLower) ||
      // Search customer name
      (() => {
        const customer = getCustomerByUserId(order.userId);
        return customer?.name?.toLowerCase().includes(searchLower);
      })();
    
    return matchesStatus && matchesPayment && matchesDelivery && matchesDate && matchesSearch;
  });
  
  const hasActiveFilters = statusFilter !== "all" || paymentFilter !== "all" || deliveryFilter !== "all" || dateFilter !== "all" || searchQuery !== "";
  
  const clearAllFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setDeliveryFilter("all");
    setDateFilter("all");
    setSearchQuery("");
  };
  
  // Additional stats
  const getEffectivePaymentStatus = (o: Order) => o.paymentStatus || (o.paymentReceived ? 'paid' : 'unpaid');
  const unpaidOrders = orders.filter(o => getEffectivePaymentStatus(o) === 'unpaid' && o.status !== "cancelled");
  const unpaidTotal = unpaidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const partialOrders = orders.filter(o => getEffectivePaymentStatus(o) === 'partial' && o.status !== "cancelled");
  const partialTotal = partialOrders.reduce((sum, o) => sum + ((o.total || 0) - (o.paidAmount || 0)), 0);
  const paidOrders = orders.filter(o => getEffectivePaymentStatus(o) === 'paid');
  const paidTotal = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const getTierInfo = (points: number) => {
    if (points >= 5000) return { name: "Diamond", color: "text-blue-600", bg: "bg-blue-100" };
    if (points >= 2000) return { name: "Gold", color: "text-yellow-600", bg: "bg-yellow-100" };
    return { name: "Silver", color: "text-gray-600", bg: "bg-gray-100" };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Admin Dashboard" />
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Admin Dashboard" />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex justify-end">
          <Button
            onClick={() => navigate("/admin/kitchen")}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <ChefHat className="w-4 h-4 mr-2" />
            Open Kitchen Display
          </Button>
        </div>

        {/* Stats Cards - Clickable */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {/* Unpaid Orders - Prominent */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #D91A60',
              backgroundColor: unpaidOrders.length > 0 ? '#FFF1F5' : undefined,
              outline: paymentFilter === 'unpaid' ? '2px solid #D91A60' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => {
              const wasUnpaid = paymentFilter === 'unpaid';
              clearAllFilters();
              if (!wasUnpaid) {
                setPaymentFilter('unpaid');
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(217,26,96,0.1)' }}>
                <AlertCircle className="w-5 h-5" style={{ color: '#D91A60' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Unpaid</p>
                <p className="text-xl font-bold" style={{ color: unpaidOrders.length > 0 ? '#D91A60' : undefined }}>{unpaidOrders.length}</p>
                <p className="text-[10px] font-medium truncate" style={{ color: '#D91A60' }}>{formatIDR(unpaidTotal)}</p>
              </div>
            </div>
          </Card>

          {/* Partially Paid */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #F59E0B',
              backgroundColor: partialOrders.length > 0 ? '#FFFBEB' : undefined,
              outline: paymentFilter === 'partial' ? '2px solid #F59E0B' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => {
              const wasPartial = paymentFilter === 'partial';
              clearAllFilters();
              if (!wasPartial) {
                setPaymentFilter('partial');
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/10">
                <CircleDollarSign className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Partial</p>
                <p className="text-xl font-bold text-amber-600">{partialOrders.length}</p>
                <p className="text-[10px] font-medium text-amber-600 truncate">{formatIDR(partialTotal)} due</p>
              </div>
            </div>
          </Card>

          {/* Today's Orders */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #D91A60',
              outline: dateFilter === 'today' ? '2px solid #D91A60' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => {
              const wasToday = dateFilter === 'today';
              clearAllFilters();
              if (!wasToday) {
                setDateFilter('today');
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-bold">{todayOrders.length}</p>
                <p className="text-[10px] text-muted-foreground">{formatIDR(todayRevenue)}</p>
              </div>
            </div>
          </Card>

          {/* Active Orders */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #F59E0B',
              outline: statusFilter === 'active_group' ? '2px solid #F59E0B' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => {
              const wasActive = statusFilter === 'active_group';
              clearAllFilters();
              if (!wasActive) {
                setStatusFilter('active_group');
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{activeOrders.length}</p>
                <p className="text-[10px] text-muted-foreground">In progress</p>
              </div>
            </div>
          </Card>

          {/* Paid Revenue */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #00AA99',
              outline: paymentFilter === 'paid' ? '2px solid #00AA99' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => {
              const wasPaid = paymentFilter === 'paid';
              clearAllFilters();
              if (!wasPaid) {
                setPaymentFilter('paid');
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CircleDollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-xl font-bold text-green-700">{paidOrders.length}</p>
                <p className="text-[10px] font-medium text-green-600 truncate">{formatIDR(paidTotal)}</p>
              </div>
            </div>
          </Card>

          {/* All Orders */}
          <Card 
            className="p-4 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderLeft: '4px solid #6B7280',
              outline: !hasActiveFilters ? '2px solid #6B7280' : 'none',
              outlineOffset: '-2px',
            }}
            onClick={() => clearAllFilters()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">All Orders</p>
                <p className="text-xl font-bold">{orders.length}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="orders" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-full min-w-max">
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="sales-reports">Sales</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
              <TabsTrigger value="tier-benefits">Tiers</TabsTrigger>
              <TabsTrigger value="regular-menu">Menu</TabsTrigger>
              <TabsTrigger value="todays-special">Special</TabsTrigger>
              <TabsTrigger value="kids-menu">Kids</TabsTrigger>
              <TabsTrigger value="flash-sale">Flash</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="health">Health</TabsTrigger>
            </TabsList>
          </div>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {/* Search + Filter Row */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <Input
                  placeholder="Search orders (ID, name, item, phone)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-md"
                />
                <div className="flex gap-2 w-full md:w-auto">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate("/admin/kitchen")}
                    className="flex-1 md:flex-none bg-orange-600 hover:bg-orange-700"
                  >
                    <ChefHat className="w-4 h-4 mr-2" />
                    Kitchen
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate("/admin/create-custom-order")}
                    className="flex-1 md:flex-none"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Order
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchOrders}
                    disabled={refreshing}
                    className="flex-1 md:flex-none"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Filter Dropdowns Row */}
              <div className="flex flex-wrap gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground hidden md:block" />
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active_group">Active Orders</SelectItem>
                    {ORDER_STATUSES.map(status => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-xs">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="unpaid">Not Paid</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-xs">
                    <SelectValue placeholder="Delivery" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-9 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Filter Results Counter */}
              {hasActiveFilters && (
                <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: '#FFF1F5' }}>
                  <p className="text-xs font-medium" style={{ color: '#D91A60' }}>
                    Showing {filteredOrders.length} of {orders.length} orders
                  </p>
                  <button
                    onClick={clearAllFilters}
                    className="text-xs font-semibold underline"
                    style={{ color: '#D91A60' }}
                  >
                    Show All
                  </button>
                </div>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {filteredOrders.length > 0 && (
              <Card className="p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                      onCheckedChange={toggleSelectAll}
                      id="select-all"
                    />
                    <Label htmlFor="select-all" className="cursor-pointer">
                      {selectedOrders.size > 0 
                        ? `${selectedOrders.size} order(s) selected` 
                        : "Select all"}
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

            {filteredOrders.length === 0 ? (
              <Card className="p-8 text-center">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No orders found</p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                    className="mt-3"
                  >
                    Clear Filters
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const customer = getCustomerByUserId(order.userId);
                  const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
                  const isPaid = effectivePS === 'paid';
                  const isPartial = effectivePS === 'partial';
                  const borderColor = isPaid ? '#00AA99' : isPartial ? '#F59E0B' : '#D91A60';
                  
                  return (
                    <Card 
                      key={order.id} 
                      className="p-5 overflow-hidden"
                      style={{ borderLeft: `4px solid ${borderColor}` }}
                    >
                      <div className="space-y-4">
                        {/* Order Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={() => toggleSelectOrder(order.id)}
                              id={`order-${order.id}`}
                            />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg">{getShortOrderId(order.orderNumber || order.id)}</h3>
                                <span className="text-[10px] text-muted-foreground">{order.orderNumber || order.id}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2"
                                  onClick={() => {
                                    const trackingUrl = `${window.location.origin}/track/${order.orderNumber}`;
                                    navigator.clipboard.writeText(trackingUrl);
                                    toast.success("Tracking link copied!");
                                  }}
                                >
                                  <Share2 className="h-3 w-3" />
                                </Button>
                                <Badge className={`${STATUS_COLORS[order.status]} text-white`}>
                                  {STATUS_LABELS[order.status]}
                                </Badge>
                                <span 
                                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full"
                                  style={{ 
                                    backgroundColor: isPaid ? '#E0F7F5' : '#FCE4EC',
                                    color: isPaid ? '#00AA99' : '#D91A60'
                                  }}
                                >
                                  {isPaid ? '✅ Paid' : '⏳ Not Paid'}
                                </span>
                                <Badge variant="outline" className="capitalize">
                                  {order.deliveryMethod}
                                </Badge>
                                {(order as any).createdByAdmin && (
                                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300">
                                    Admin Created
                                  </Badge>
                                )}
                                {/* Payment Method Flag */}
                                {order.paymentMethod === "midtrans" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                    <CreditCard className="w-3 h-3" />
                                    Paid Online
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    <Banknote className="w-3 h-3" />
                                    COD
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {new Date(order.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                {customer && <span className="ml-2 font-medium text-foreground">{customer.name}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="font-semibold" style={{ color: isPaid ? '#1F2937' : '#D91A60' }}>{formatIDR(order.total)}</p>
                            {customer?.phone && (
                              <p className="text-xs text-muted-foreground">{customer.phone}</p>
                            )}
                          </div>
                        </div>

                        {/* Order Items */}
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-medium mb-2">Items:</p>
                          {order.items && order.items.length > 0 ? (
                            <div className="space-y-2">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="text-sm">
                                  <div className="flex justify-between">
                                    <span>
                                      {item.quantity}x {item.name || item.title}
                                      {item.category && <span className="text-muted-foreground"> ({item.category})</span>}
                                      {item.discountPercentage && item.discountPercentage > 0 && (
                                        <span className="ml-2 text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                                          {item.discountPercentage}% OFF
                                        </span>
                                      )}
                                    </span>
                                    <span>{formatIDR(item.price * item.quantity)}</span>
                                  </div>
                                  {item.discountPercentage && item.discountPercentage > 0 && item.originalPrice && (
                                    <p className="text-xs text-gray-500 mt-1 ml-4">
                                      Original: <span className="line-through">{formatIDR(item.originalPrice * item.quantity)}</span>
                                      {' → '}Saved: {formatIDR((item.originalPrice - item.price) * item.quantity)}
                                    </p>
                                  )}
                                  {item.notes && (
                                    <p className="text-xs text-blue-600 italic mt-1 ml-4">Note: {item.notes}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm">{order.itemTitle}</p>
                          )}
                        </div>

                        {/* Bill Breakdown */}
                        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatIDR(order.subtotal || 0)}</span>
                          </div>
                          {(order.promoDiscount != null && order.promoDiscount > 0) && (
                            <div className="flex justify-between">
                              <span className="text-green-600 flex items-center gap-1">
                                <Ticket className="w-3 h-3" />
                                Promo {order.promoCode ? `(${order.promoCode})` : ''}
                              </span>
                              <span className="text-green-600 font-medium">-{formatIDR(order.promoDiscount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax (PPN 10%)</span>
                            <span>{formatIDR(order.tax || 0)}</span>
                          </div>
                          {order.deliveryMethod === 'delivery' && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" /> Delivery Fee
                              </span>
                              <span className="font-medium">{formatIDR(order.deliveryFee || 0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-1.5 mt-1 border-t border-gray-200 font-semibold">
                            <span>Total</span>
                            <span style={{ color: isPaid ? '#1F2937' : '#D91A60' }}>{formatIDR(order.total)}</span>
                          </div>
                        </div>

                        {/* Contact Info */}
                        <div className="flex flex-col md:flex-row gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <span>{order.phone}</span>
                          </div>
                          {order.address && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <span className="line-clamp-1">{order.address}</span>
                            </div>
                          )}
                        </div>

                        {order.specialInstructions && (
                          <div className="text-sm">
                            <span className="font-medium">Special Instructions: </span>
                            <span className="text-muted-foreground">{order.specialInstructions}</span>
                          </div>
                        )}

                        {/* Payment Details Display */}
                        {order.paymentDetails && (
                          <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-3">
                            <span className="font-medium text-green-900">Payment Details: </span>
                            <span className="text-green-800">{order.paymentDetails}</span>
                          </div>
                        )}

                        {/* Cancellation Reason Display (if cancelled by admin) */}
                        {order.status === "cancelled" && order.cancellationReason && (
                          <div className="text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                            <span className="font-medium text-red-900">Cancellation Reason: </span>
                            <span className="text-red-800">{order.cancellationReason}</span>
                            {order.cancelledBy === "admin" && (
                              <Badge variant="outline" className="ml-2 text-xs">Cancelled by Admin</Badge>
                            )}
                          </div>
                        )}

                        {/* Status Update and Payment */}
                        {!["cancelled"].includes(order.status) && (
                          <div className="pt-2 border-t space-y-3">
                            <div>
                              <Label className="text-sm mb-2 block">Update Status:</Label>
                              <Select
                                value={orderChanges[order.id]?.status || order.status}
                                onValueChange={(value) => handleStatusChange(order.id, value)}
                              >
                                <SelectTrigger>
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
                            
                            {/* Payment Status Selector */}
                            <div>
                              <Label className="text-sm font-medium mb-1.5 block">Payment Status</Label>
                              <div className="flex gap-1.5">
                                {(['unpaid', 'partial', 'paid'] as const).map((ps) => {
                                  const currentPS = orderChanges[order.id]?.paymentStatus ?? effectivePS;
                                  const isActive = currentPS === ps;
                                  const paidSoFar = order.paidAmount || 0;
                                  const orderTotal = order.total || 0;
                                  const currentActualPS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
                                  // Once fully paid, lock all buttons — no going back
                                  const isLockedBecausePaid = currentActualPS === 'paid' && ps !== 'paid';
                                  // "Paid" only clickable when collected amount covers the total
                                  const isPaidLocked = ps === 'paid' && paidSoFar < orderTotal;
                                  // "Partial" is auto-determined from payment entries, not manually selectable
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
                                      disabled={isLocked}
                                      className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                                        isActive ? colors[ps].active : isLocked ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : colors[ps].bg
                                      }`}
                                    >
                                      {ps === 'unpaid' ? '🔴 Unpaid' : ps === 'partial' ? '🟡 Partial' : '🟢 Paid'}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Hint messages */}
                              {effectivePS === 'paid' && (
                                <p className="mt-1.5 text-[10px] text-green-600 font-medium">
                                  🔒 Fully paid — payment status is locked and cannot be reversed.
                                </p>
                              )}
                              {effectivePS !== 'paid' && (order.paidAmount || 0) < (order.total || 0) && order.status !== 'cancelled' && (
                                <p className="mt-1.5 text-[10px] text-gray-500 italic">
                                  💡 Use "Add Payment" below to record payments. "Paid" unlocks when collected ≥ total.
                                </p>
                              )}
                              
                              {/* Paid Amount Display */}
                              {(effectivePS === 'partial' || (order.paidAmount && order.paidAmount > 0 && effectivePS !== 'paid')) && (
                                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                                  <span className="font-medium text-amber-800">
                                    Collected: Rp {(order.paidAmount || 0).toLocaleString()} of Rp {(order.total || 0).toLocaleString()}
                                  </span>
                                  <span className="text-amber-600 ml-1">
                                    (Rp {((order.total || 0) - (order.paidAmount || 0)).toLocaleString()} remaining)
                                  </span>
                                </div>
                              )}

                              {/* Payment History Log */}
                              {order.paymentHistory && order.paymentHistory.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500">Payment History</div>
                                  {order.paymentHistory.map((entry: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1 border">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-green-600 font-semibold">+Rp {entry.amount?.toLocaleString()}</span>
                                        {entry.method && <span className="text-gray-400">• {entry.method}</span>}
                                      </div>
                                      <span className="text-gray-400">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add Payment Button / Form */}
                              {effectivePS !== 'paid' && order.status !== 'cancelled' && (
                                <>
                                  {addPaymentOrderId === order.id ? (
                                    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                                      {(() => {
                                        const remaining = (order.total || 0) - (order.paidAmount || 0);
                                        const enteredAmt = Number(addPaymentAmount) || 0;
                                        const exceedsRemaining = enteredAmt > remaining;
                                        return (
                                          <>
                                            <div className="flex items-center justify-between">
                                              <div className="text-xs font-semibold text-blue-800">Add Payment</div>
                                              <div className="text-[10px] text-blue-600 font-medium">
                                                Remaining: Rp {remaining.toLocaleString()}
                                              </div>
                                            </div>
                                            <Input
                                              type="number"
                                              placeholder={`Amount (max Rp ${remaining.toLocaleString()})`}
                                              value={addPaymentAmount}
                                              onChange={(e) => setAddPaymentAmount(e.target.value)}
                                              max={remaining}
                                              min={1}
                                              className={`h-8 text-sm ${exceedsRemaining ? 'border-red-400 bg-red-50 focus:ring-red-400' : ''}`}
                                            />
                                            {exceedsRemaining && (
                                              <p className="text-[10px] text-red-600 font-medium">
                                                ⚠️ Amount exceeds remaining balance (Rp {remaining.toLocaleString()}). Max allowed: Rp {remaining.toLocaleString()}
                                              </p>
                                            )}
                                          </>
                                        );
                                      })()}
                                      <div className="grid grid-cols-2 gap-2">
                                        <Input
                                          type="text"
                                          placeholder="Method (e.g. Cash, Transfer)"
                                          value={addPaymentMethod}
                                          onChange={(e) => setAddPaymentMethod(e.target.value)}
                                          className="h-8 text-xs"
                                        />
                                        <Input
                                          type="text"
                                          placeholder="Note (optional)"
                                          value={addPaymentNote}
                                          onChange={(e) => setAddPaymentNote(e.target.value)}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          className="flex-1 h-7 text-xs"
                                          disabled={!addPaymentAmount || Number(addPaymentAmount) <= 0 || Number(addPaymentAmount) > ((order.total || 0) - (order.paidAmount || 0)) || submitting === order.id}
                                          onClick={async () => {
                                            const amt = Number(addPaymentAmount);
                                            const maxAllowed = (order.total || 0) - (order.paidAmount || 0);
                                            if (amt > 0 && amt <= maxAllowed) {
                                              await handleAddPayment(order.id, amt, addPaymentMethod || undefined, addPaymentNote || undefined);
                                              setAddPaymentOrderId(null);
                                              setAddPaymentAmount("");
                                              setAddPaymentMethod("");
                                              setAddPaymentNote("");
                                            }
                                          }}
                                        >
                                          {submitting === order.id ? "Saving..." : "Save Payment"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                          onClick={() => {
                                            setAddPaymentOrderId(null);
                                            setAddPaymentAmount("");
                                            setAddPaymentMethod("");
                                            setAddPaymentNote("");
                                          }}
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
                                      onClick={() => {
                                        setAddPaymentOrderId(order.id);
                                        setAddPaymentAmount("");
                                        setAddPaymentMethod("");
                                        setAddPaymentNote("");
                                      }}
                                    >
                                      + Add Payment
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                            
                            {/* Submit and Cancel Buttons */}
                            {orderChanges[order.id] && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  onClick={() => submitOrderChanges(order.id)}
                                  disabled={submitting === order.id}
                                  className="flex-1"
                                  size="sm"
                                >
                                  {submitting === order.id ? "Submitting..." : "Submit Changes"}
                                </Button>
                                <Button
                                  onClick={() => cancelOrderChanges(order.id)}
                                  disabled={submitting === order.id}
                                  variant="outline"
                                  className="flex-1"
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}

                            {/* Share Tracking Link Buttons */}
                            <div className="pt-2 border-t space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  onClick={() => {
                                    const trackingUrl = `${window.location.origin}/track/${order.orderNumber}`;
                                    navigator.clipboard.writeText(trackingUrl);
                                    toast.success("Link copied!");
                                  }}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Share2 className="h-4 w-4 mr-1" />
                                  Copy Link
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
                                  className="bg-green-50 hover:bg-green-100"
                                >
                                  WhatsApp
                                </Button>
                              </div>
                            
                              {/* Admin Cancel Order Button — hidden when paid, partial paid, or closed */}
                              {effectivePS !== 'paid' && effectivePS !== 'partial' && order.status !== 'closed' && order.status !== 'cancelled' && (
                                <Button
                                  onClick={() => openCancelDialog(order)}
                                  variant="destructive"
                                  size="sm"
                                  className="w-full"
                                >
                                  Cancel Order
                                </Button>
                              )}
                            </div>
                            
                            {/* Points Info */}
                            {order.pointsAwarded && order.pointsEarned && (
                              <div className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-2 rounded border border-green-300">
                                ✅ {order.pointsEarned} points awarded to customer
                              </div>
                            )}
                            {!order.pointsAwarded && order.status === 'closed' && effectivePS === 'paid' && (
                              <div className="text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-2 rounded border border-amber-300">
                                ⚠️ Points pending! Should award {Math.floor(order.total / 1000)} points (Check logs)
                              </div>
                            )}
                            {!order.pointsAwarded && order.status === 'closed' && effectivePS !== 'paid' && (
                              <div className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded border border-orange-200">
                                💡 Mark as "Paid" to award {Math.floor(order.total / 1000)} points
                              </div>
                            )}
                            {!order.pointsAwarded && order.status !== 'closed' && order.status !== 'cancelled' && (
                              <div className="text-xs text-muted-foreground px-2 py-1">
                                💡 Will award {Math.floor(order.total / 1000)} points when closed & paid
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            {users.filter(u => !u.isAdmin).length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No customers found</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {users.filter(u => !u.isAdmin).map((customer) => {
                  const tier = getTierInfo(customer.points);
                  const customerOrders = orders.filter(o => o.userId === customer.id);
                  const totalSpent = customerOrders.reduce((sum, order) => sum + (order.total || 0), 0);
                  
                  return (
                    <Card key={customer.id} className={`p-5 ${customer.blocked ? "border-red-300 bg-red-50/50" : ""}`}>
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{customer.name}</h3>
                            <Badge className={`${tier.bg} ${tier.color} border-0`}>
                              {tier.name} Tier
                            </Badge>
                            {customer.blocked && (
                              <Badge className="bg-red-500 text-white border-0">
                                <ShieldBan className="w-3 h-3 mr-1" />
                                Blocked
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex flex-col md:flex-row gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Phone className="w-4 h-4" />
                              {customer.phone}
                            </div>
                            <div className="flex items-center gap-1">
                              <Award className="w-4 h-4" />
                              {customer.points} points
                            </div>
                          </div>

                          <div className="flex gap-4 text-sm">
                            <span>Orders: <strong>{customerOrders.length}</strong></span>
                            <span>Total Spent: <strong>{formatIDR(totalSpent)}</strong></span>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Joined: {new Date(customer.createdAt).toLocaleDateString("en-US")}
                          </p>

                          {customer.blocked && customer.blockedReason && (
                            <p className="text-xs text-red-600">
                              Block reason: {customer.blockedReason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPointsDialog(customer)}
                            className="w-full md:w-auto"
                          >
                            <Award className="w-4 h-4 mr-2" />
                            Adjust Points
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResetPinDialog(customer)}
                            className="w-full md:w-auto"
                          >
                            <Key className="w-4 h-4 mr-2" />
                            Reset PIN
                          </Button>

                          <Button
                            variant={customer.blocked ? "outline" : "destructive"}
                            size="sm"
                            onClick={() => {
                              setBlockCustomer(customer);
                              setBlockReason("");
                              setBlockDialog(true);
                            }}
                            className="w-full md:w-auto"
                          >
                            {customer.blocked ? (
                              <>
                                <ShieldCheck className="w-4 h-4 mr-2" />
                                Unblock
                              </>
                            ) : (
                              <>
                                <ShieldBan className="w-4 h-4 mr-2" />
                                Block
                              </>
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteCustomer(customer);
                              setDeleteConfirmName("");
                              setDeleteDialog(true);
                            }}
                            className="w-full md:w-auto text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Regular Menu Tab */}
          <TabsContent value="regular-menu" className="space-y-4">
            {accessToken ? (
              <RegularMenuAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Today's Special Tab */}
          <TabsContent value="todays-special" className="space-y-4">
            {accessToken ? (
              <TodaysSpecialAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Kids Menu Tab */}
          <TabsContent value="kids-menu" className="space-y-4">
            {accessToken ? (
              <KidsMenuAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Flash Sale Tab */}
          <TabsContent value="flash-sale" className="space-y-4">
            {accessToken ? (
              <FlashSaleAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Vouchers Tab */}
          <TabsContent value="vouchers" className="space-y-4">
            {accessToken ? (
              <VouchersAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Tier Benefits Tab */}
          <TabsContent value="tier-benefits" className="space-y-4">
            {accessToken ? (
              <TierBenefitsAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Sales Reports Tab */}
          <TabsContent value="sales-reports" className="space-y-4">
            {accessToken ? (
              <SalesReportsAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            {accessToken ? (
              <AnalyticsAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Business Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            {accessToken ? (
              <BusinessInsightsAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            {accessToken ? (
              <RestaurantSettingsAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="health" className="space-y-4">
            {accessToken ? (
              <SystemHealthAdmin customToken={accessToken} />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Loading authentication...</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Admin Cancel Order Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              {selectedOrder && `Order: ${selectedOrder.id.slice(0, 8)} (Status: ${STATUS_LABELS[selectedOrder.status]})`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">Reason for Cancellation</Label>
              <Textarea
                id="reason"
                placeholder="Why are you cancelling this order?"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={3}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>
              Cancel
            </Button>
            <Button onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? "Cancelling..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="bulk-status">New Status</Label>
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

      {/* Reset PIN Dialog */}
      <Dialog open={resetPinDialog} onOpenChange={(open) => {
        if (!open) {
          setResetPinDialog(false);
          setResetPinCustomer(null);
          setNewPin("");
          setConfirmPin("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Customer PIN</DialogTitle>
            <DialogDescription>
              Set a new 6-digit PIN for {resetPinCustomer?.name} ({resetPinCustomer?.phone})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-pin">New PIN</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit PIN"
                value={newPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setNewPin(val);
                }}
                className="mt-2 text-center text-lg tracking-[0.5em] font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be exactly 6 digits.
              </p>
            </div>

            <div>
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Confirm 6-digit PIN"
                value={confirmPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setConfirmPin(val);
                }}
                className="mt-2 text-center text-lg tracking-[0.5em] font-mono"
              />
              {confirmPin.length === 6 && newPin.length === 6 && newPin !== confirmPin && (
                <p className="text-xs text-red-500 mt-1">PINs do not match</p>
              )}
              {confirmPin.length === 6 && newPin.length === 6 && newPin === confirmPin && (
                <p className="text-xs text-green-600 mt-1">PINs match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPinDialog(false)} disabled={resettingPin}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPin}
              disabled={resettingPin || newPin.length !== 6 || confirmPin.length !== 6 || newPin !== confirmPin}
            >
              {resettingPin ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block/Unblock User Dialog */}
      <Dialog open={blockDialog} onOpenChange={(open) => {
        if (!open) {
          setBlockDialog(false);
          setBlockCustomer(null);
          setBlockReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {blockCustomer?.blocked ? (
                <>
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  Unblock User
                </>
              ) : (
                <>
                  <ShieldBan className="w-5 h-5 text-red-600" />
                  Block User
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {blockCustomer?.blocked
                ? `Are you sure you want to unblock ${blockCustomer?.name}? They will be able to log in and place orders again.`
                : `Are you sure you want to block ${blockCustomer?.name}? They will not be able to log in or place orders.`}
            </DialogDescription>
          </DialogHeader>

          {!blockCustomer?.blocked && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="block-reason">Reason (optional)</Label>
                <Textarea
                  id="block-reason"
                  placeholder="e.g., Repeated no-shows, abusive behavior..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {blockCustomer?.blocked && blockCustomer?.blockedReason && (
            <div className="p-3 bg-red-50 rounded-lg text-sm">
              <p className="font-medium text-red-800">Previous block reason:</p>
              <p className="text-red-700">{blockCustomer.blockedReason}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialog(false)} disabled={blockingUser}>
              Cancel
            </Button>
            <Button
              variant={blockCustomer?.blocked ? "default" : "destructive"}
              onClick={handleBlockToggle}
              disabled={blockingUser}
            >
              {blockingUser
                ? (blockCustomer?.blocked ? "Unblocking..." : "Blocking...")
                : (blockCustomer?.blocked ? "Unblock User" : "Block User")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialog} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialog(false);
          setDeleteCustomer(null);
          setDeleteConfirmName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete User Permanently
            </DialogTitle>
            <DialogDescription>
              This action is <strong>irreversible</strong>. The user account, login credentials, and all associated data for <strong>{deleteCustomer?.name}</strong> ({deleteCustomer?.phone}) will be permanently deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium mb-1">Warning:</p>
              <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
                <li>The user will not be able to log in anymore</li>
                <li>Their loyalty points ({deleteCustomer?.points || 0} pts) will be lost</li>
                <li>Order history will remain but won't be linked to any account</li>
              </ul>
            </div>

            <div>
              <Label htmlFor="delete-confirm">
                Type <strong>{deleteCustomer?.name}</strong> to confirm
              </Label>
              <Input
                id="delete-confirm"
                placeholder={`Type "${deleteCustomer?.name}" to confirm`}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)} disabled={deletingUser}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deletingUser || deleteConfirmName !== deleteCustomer?.name}
            >
              {deletingUser ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}