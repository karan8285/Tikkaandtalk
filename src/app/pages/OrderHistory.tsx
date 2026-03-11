import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { Header } from "../components/Header";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Clock, MapPin, ShoppingBag, ChevronDown, ChevronUp, RefreshCw, Package, RotateCw, Ticket } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
  originalPrice?: number;
  discountPercentage?: number;
}

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  label: string;
}

interface Order {
  id: string;
  itemTitle: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  address?: string;
  phone?: string;
  specialInstructions?: string;
  paymentReceived?: boolean;
  paymentDetails?: string;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; date: string; method?: string; note?: string }>;
  pointsAwarded?: boolean;
  pointsEarned?: number;
  statusHistory?: StatusHistoryItem[];
  cancelledBy?: string; // 'user' or 'admin'
  cancellationReason?: string; // Admin's reason for cancellation
  orderNumber?: string; // New field for order number
  createdByAdmin?: boolean; // Admin created order flag
  promoCode?: string;
  promoDiscount?: number;
  promoVoucherTitle?: string;
}

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: '#FFA500', bgColor: '#FFF3E0', label: 'Pending' },
  confirmed: { color: '#00AA99', bgColor: '#E0F7F5', label: 'Confirmed' },
  cooking: { color: '#D91A60', bgColor: '#FCE4EC', label: 'Cooking' },
  ready: { color: '#9B59B6', bgColor: '#F4ECF7', label: 'Ready' },
  out_for_delivery: { color: '#D91A60', bgColor: '#FCE4EC', label: 'Out for Delivery' },
  delivered: { color: '#00AA99', bgColor: '#E0F7F5', label: 'Delivered' },
  closed: { color: '#00AA99', bgColor: '#E0F7F5', label: 'Closed' },
  cancelled: { color: '#E74C3C', bgColor: '#FADBD8', label: 'Cancelled' },
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const { user, accessToken, refreshProfile, loading: authLoading } = useAuth();
  const { clearCart, setItemQuantity, cartItems } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [orderFilter, setOrderFilter] = useState<'all' | 'unpaid'>('all');

  useEffect(() => {
    // Wait for auth to finish loading before making decisions
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate("/login");
      return;
    }

    // Refresh profile to get latest points when viewing order history
    // Only refresh if user is logged in with access token
    if (accessToken) {
      console.log("🔄 OrderHistory: Refreshing profile to get latest points...");
      refreshProfile().then(() => {
        console.log("✅ OrderHistory: Profile refreshed");
      });
    }

    fetchOrders();
  }, [user?.id, authLoading, navigate]);

  const fetchOrders = async () => {
    if (!user?.id) return;

    try {
      const response = await fetch(`${API_BASE}/orders?userId=${user.id}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Sort orders by creation date (newest first)
        const sortedOrders = (data.orders || []).sort((a: Order, b: Order) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(sortedOrders);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancelOrder = async (orderId: string) => {
    if (!accessToken || !window.confirm("Are you sure you want to cancel this order?")) {
      return;
    }
    
    setCancelling(orderId);
    
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
      });
      
      if (response.ok) {
        toast.success("Order cancelled successfully");
        await fetchOrders();
        if (accessToken) {
          await refreshProfile(); // Refresh points
        }
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to cancel order");
      }
    } catch (error) {
      toast.error("Failed to cancel order");
      console.error("Cancel order error:", error);
    } finally {
      setCancelling(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  
  const canCancelOrder = (order: Order) => {
    // Only pending (Order Created) orders can be cancelled
    // Once admin confirms, cancellation is not allowed
    return order.status === "pending";
  };

  const toggleExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const getPointsStatus = (order: Order) => {
    const pointsAmount = Math.floor(order.total / 1000);
    
    if (order.pointsAwarded) {
      return {
        message: `✅ You earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'cancelled') {
      return {
        message: `No points earned (order cancelled)`,
        color: "#999"
      };
    }
    
    const effectivePS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
    
    if (order.status === 'closed' && effectivePS === 'paid') {
      return {
        message: `✅ You earned ${pointsAmount} points`,
        color: "#00AA99"
      };
    }
    
    if (order.status === 'closed' && effectivePS !== 'paid') {
      return {
        message: `⏳ ${pointsAmount} points pending full payment`,
        color: "#D91A60"
      };
    }
    
    if (order.status === 'delivered') {
      return {
        message: `⏳ ${pointsAmount} points pending confirmation`,
        color: "#D91A60"
      };
    }
    
    return {
      message: `💡 Will earn ${pointsAmount} points when delivered`,
      color: "#666"
    };
  };

  const handleViewTracking = (orderId: string) => {
    navigate(`/order-tracking/${orderId}`);
  };

  const handleReorder = async (order: Order) => {
    if (!order.items || order.items.length === 0) {
      toast.error("No items to reorder");
      return;
    }
    
    console.log("🔄 Starting reorder for order:", order.id);
    console.log("📦 Order items:", order.items);
    
    setReordering(order.id);
    
    try {
      // Clear cart first to avoid confusion
      console.log("🧹 Clearing cart before reorder...");
      await clearCart();
      console.log("✅ Cart cleared successfully");
      
      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Fetch all available items from different categories
      console.log("📡 Fetching menu items from all categories...");
      const [regularMenuRes, flashSaleRes, todaysSpecialRes, kidsMenuRes, customMenuRes] = await Promise.all([
        fetch(`${API_BASE}/menu`, { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`${API_BASE}/flash-sale`, { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`${API_BASE}/todays-special`, { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`${API_BASE}/kids-menu`, { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`${API_BASE}/custom-menu`, { headers: { Authorization: `Bearer ${publicAnonKey}` } })
      ]);
      
      const [regularMenu, flashSale, todaysSpecial, kidsMenu, customMenu] = await Promise.all([
        regularMenuRes.ok ? regularMenuRes.json() : { items: [] },
        flashSaleRes.ok ? flashSaleRes.json() : { items: [] },
        todaysSpecialRes.ok ? todaysSpecialRes.json() : { items: [] },
        kidsMenuRes.ok ? kidsMenuRes.json() : { items: [] },
        customMenuRes.ok ? customMenuRes.json() : { items: [] }
      ]);
      
      console.log("📋 Fetched menu data:", {
        regularMenuCount: regularMenu.items?.length || 0,
        flashSaleCount: flashSale.items?.length || 0,
        todaysSpecialCount: todaysSpecial.items?.length || 0,
        kidsMenuCount: kidsMenu.items?.length || 0,
        customMenuCount: customMenu.items?.length || 0
      });
      
      // Create a map of available items
      const availableItems = new Map();
      
      // Add regular menu items
      (regularMenu.items || []).forEach((item: any) => {
        if (item.isAvailable && !item.outOfStock) {
          const itemId = Number(item.id);
          const itemData = {
            id: itemId,
            title: item.name,
            description: item.description || "",
            price: item.price,
            originalPrice: item.price,
            image: item.image || "",
            category: "Regular Menu"
          };
          
          // Store with multiple key variations for better matching
          availableItems.set(`${itemId}-Regular Menu`, itemData);
          availableItems.set(`${item.id}-Regular Menu`, itemData); // Original format
        }
      });
      
      // Add flash sale items
      (flashSale.items || []).forEach((item: any) => {
        if (item.enabled) {
          // Check if flash sale is still active
          if (!item.endTime || new Date(item.endTime).getTime() > new Date().getTime()) {
            const itemId = Number(item.id);
            const itemData = {
              id: itemId,
              title: item.name,
              description: item.description || "",
              price: item.finalPrice,
              originalPrice: item.originalPrice,
              image: item.image || "",
              category: "Flash Sale"
            };
            
            // Store with multiple key variations
            availableItems.set(`${itemId}-Flash Sale`, itemData);
            availableItems.set(`${item.id}-Flash Sale`, itemData);
          }
        }
      });
      
      // Add today's special items
      (todaysSpecial.items || []).forEach((item: any) => {
        if (item.enabled) {
          const itemId = Number(item.id);
          const itemData = {
            id: itemId,
            title: item.name,
            description: item.description || "",
            price: item.price,
            originalPrice: item.originalPrice || item.price,
            image: item.image || "",
            category: "Today's Special"
          };
          availableItems.set(`${itemId}-Today's Special`, itemData);
          availableItems.set(`${item.id}-Today's Special`, itemData);
        }
      });
      
      // Add kids menu items
      (kidsMenu.items || []).forEach((item: any) => {
        if (item.enabled) {
          const itemId = Number(item.id);
          const itemData = {
            id: itemId,
            title: item.name,
            description: item.description || "",
            price: item.price,
            originalPrice: item.originalPrice || item.price,
            image: item.image || "",
            category: "Kids Menu"
          };
          availableItems.set(`${itemId}-Kids Menu`, itemData);
          availableItems.set(`${item.id}-Kids Menu`, itemData);
        }
      });
      
      // Add custom menu items
      (customMenu.items || []).forEach((item: any) => {
        if (item.enabled) {
          const itemId = Number(item.id);
          const itemData = {
            id: itemId,
            title: item.name,
            description: item.description || "",
            price: item.price,
            originalPrice: item.originalPrice || item.price,
            image: item.image || "",
            category: "Custom"
          };
          availableItems.set(`${itemId}-Custom`, itemData);
          availableItems.set(`${item.id}-Custom`, itemData);
        }
      });
      
      // Check which items from the order are available
      const availableOrderItems: Array<{ item: any; quantity: number }> = [];
      const unavailableItems: string[] = [];
      
      console.log("\n🔍 ==================== AVAILABILITY CHECK ====================");
      console.log("📦 Order items:", order.items.length);
      order.items.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.title} (ID: ${item.id}, Category: ${item.category || 'none'})`);
      });
      
      console.log("\n🗺️ Available items map size:", availableItems.size);
      console.log("Available keys:");
      Array.from(availableItems.keys()).forEach((key, idx) => {
        const item = availableItems.get(key);
        console.log(`   ${idx + 1}. Key: "${key}" -> ${item.title}`);
      });
      
      console.log("\n🔎 Starting matching process...");
      order.items.forEach((orderItem, idx) => {
        console.log(`\n--- Order Item ${idx + 1}: ${orderItem.title} ---`);
        
        // Try multiple key variations
        const possibleKeys = [
          `${orderItem.id}-${orderItem.category || 'Regular Menu'}`,
          `${orderItem.id}-${orderItem.category}`,
          `${Number(orderItem.id)}-${orderItem.category || 'Regular Menu'}`,
          `${Number(orderItem.id)}-${orderItem.category}`,
          `${orderItem.id}-Regular Menu`,
          `${orderItem.id}-Flash Sale`,
          `${orderItem.id}-Custom`
        ];
        
        console.log(`   Order item ID: ${orderItem.id} (type: ${typeof orderItem.id})`);
        console.log(`   Order item category: ${orderItem.category || 'none'}`);
        console.log(`   Trying keys:`, possibleKeys);
        
        let availableItem = null;
        let matchedKey = null;
        
        for (const key of possibleKeys) {
          const item = availableItems.get(key);
          if (item) {
            availableItem = item;
            matchedKey = key;
            break;
          }
        }
        
        // Fallback: Try matching by title (case-insensitive)
        if (!availableItem) {
          console.log(`   ⚠️ No ID match found, trying title match...`);
          for (const [key, item] of availableItems.entries()) {
            if (item.title.toLowerCase() === orderItem.title.toLowerCase()) {
              console.log(`   ✨ Found by title match! Key: ${key}`);
              availableItem = item;
              matchedKey = key;
              break;
            }
          }
        }
        
        if (availableItem) {
          console.log(`   ✅ MATCHED with key: ${matchedKey}`);
          console.log(`   Item data:`, availableItem);
          availableOrderItems.push({
            item: availableItem,
            quantity: orderItem.quantity
          });
        } else {
          console.log(`   ❌ NOT FOUND - Item unavailable`);
          unavailableItems.push(orderItem.title);
        }
      });
      
      console.log("\n📊 ==================== MATCH SUMMARY ====================");
      console.log(`✅ Available: ${availableOrderItems.length} items`);
      console.log(`❌ Unavailable: ${unavailableItems.length} items`);
      if (unavailableItems.length > 0) {
        console.log("Unavailable items:", unavailableItems);
      }
      
      // If no items are available, show error
      if (availableOrderItems.length === 0) {
        console.error("❌ No items available for reorder");
        toast.error("All items from this order are out of stock or unavailable");
        return;
      }
      
      // If some items are unavailable, show warning
      if (unavailableItems.length > 0) {
        console.warn("⚠️ Some items unavailable:", unavailableItems);
        toast.warning(`Some items are out of stock: ${unavailableItems.join(", ")}`);
      }
      
      // Add available items to cart
      console.log("➕ Adding items to cart...");
      console.log(`Total items to add: ${availableOrderItems.length}`);
      
      availableOrderItems.forEach(({ item, quantity }, index) => {
        console.log(`\n--- Item ${index + 1}/${availableOrderItems.length} ---`);
        console.log(`   Adding: ${item.title} x${quantity} (${item.category})`);
        console.log(`   Raw item structure:`, JSON.stringify(item, null, 2));
        
        // Ensure all required fields are present and properly typed
        const cartItem = {
          id: typeof item.id === 'string' ? parseInt(item.id, 10) : Number(item.id),
          title: String(item.title || ''),
          description: String(item.description || ''),
          price: Number(item.price),
          originalPrice: Number(item.originalPrice || item.price),
          image: String(item.image || ''),
          category: String(item.category || 'Regular Menu')
        };
        
        console.log(`   Processed cart item:`, JSON.stringify(cartItem, null, 2));
        console.log(`   Calling setItemQuantity with quantity: ${quantity}`);
        
        setItemQuantity(cartItem, quantity);
        
        console.log(`   ✅ setItemQuantity called for ${item.title}`);
      });
      
      console.log("\n✅ All setItemQuantity calls completed");
      
      // Wait a moment for state updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check cart state
      console.log("\n📊 Current cart state after adding items:");
      console.log(`   Cart items count: ${cartItems.length}`);
      console.log(`   Cart items:`, JSON.stringify(cartItems, null, 2));
      
      // Show success message and navigate to cart
      if (unavailableItems.length === 0) {
        toast.success(`${availableOrderItems.length} items added to cart!`);
      } else {
        toast.success(`${availableOrderItems.length} of ${order.items.length} items added to cart`);
      }
      
      // Small delay to ensure cart updates are processed
      setTimeout(() => {
        console.log("🛒 Navigating to cart...");
        navigate("/cart");
      }, 300);
      
    } catch (error) {
      console.error("❌ Reorder error:", error);
      if (error instanceof Error) {
        console.error("   Error message:", error.message);
        console.error("   Error stack:", error.stack);
      }
      toast.error("Failed to reorder. Please try again.");
    } finally {
      setReordering(null);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Order History" />
      
      <main className="max-w-md mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-2">No Orders Yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start ordering to see your history here
            </p>
            <Button onClick={() => navigate("/")} style={{ backgroundColor: '#D91A60' }}>
              Start Ordering
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            {(() => {
              const getPS = (o: Order) => o.paymentStatus || (o.paymentReceived ? 'paid' : 'unpaid');
              const notFullyPaidOrders = orders.filter(o => getPS(o) !== 'paid' && o.status !== 'cancelled');
              const notFullyPaidTotal = notFullyPaidOrders.reduce((sum, o) => sum + ((o.total || 0) - (o.paidAmount || 0)), 0);
              return (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {/* Payment Not Received Card */}
                  <button
                    onClick={() => setOrderFilter(orderFilter === 'unpaid' ? 'all' : 'unpaid')}
                    className="rounded-xl p-4 text-left transition-all"
                    style={{
                      backgroundColor: notFullyPaidOrders.length > 0 ? '#FCE4EC' : '#F3F4F6',
                      borderLeft: `4px solid ${notFullyPaidOrders.length > 0 ? '#D91A60' : '#9CA3AF'}`,
                      outline: orderFilter === 'unpaid' ? '2px solid #D91A60' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    <p className="text-xs font-semibold mb-1" style={{ color: notFullyPaidOrders.length > 0 ? '#D91A60' : '#6B7280' }}>
                      Outstanding
                    </p>
                    <p className="text-base font-bold" style={{ color: notFullyPaidOrders.length > 0 ? '#D91A60' : '#6B7280' }}>
                      Rp {notFullyPaidTotal.toLocaleString()}
                    </p>
                    <p className="text-xs mt-1" style={{ color: notFullyPaidOrders.length > 0 ? '#D91A60' : '#9CA3AF' }}>
                      Orders: {notFullyPaidOrders.length}
                    </p>
                  </button>
                  {/* All Transactions Card */}
                  <button
                    onClick={() => setOrderFilter('all')}
                    className="rounded-xl p-4 bg-white border border-gray-200 text-left transition-all"
                    style={{
                      borderLeft: '4px solid #6B7280',
                      outline: orderFilter === 'all' ? '2px solid #6B7280' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    <p className="text-xs font-semibold text-gray-600 mb-1">All Transactions</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {orders.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Total orders
                    </p>
                  </button>
                </div>
              );
            })()}

            {/* Filter indicator */}
            {orderFilter === 'unpaid' && (
              <div className="flex items-center justify-between bg-pink-50 rounded-lg px-3 py-2">
                <p className="text-xs font-medium" style={{ color: '#D91A60' }}>
                  Showing unpaid orders only
                </p>
                <button
                  onClick={() => setOrderFilter('all')}
                  className="text-xs font-semibold underline"
                  style={{ color: '#D91A60' }}
                >
                  Show All
                </button>
              </div>
            )}

            {/* Order Cards */}
            {orders
              .filter(order => {
                const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
                if (orderFilter === 'unpaid') return ps !== 'paid' && order.status !== 'cancelled';
                return true;
              })
              .map((order) => {
                const isExpanded = expandedOrders.has(order.id);
                const statusInfo = statusConfig[order.status] || statusConfig.pending;
                const pointsStatus = getPointsStatus(order);
                const isActive = !['delivered', 'closed', 'cancelled'].includes(order.status);
                const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
                const isPaid = ps === 'paid';
                const isPartial = ps === 'partial';
                const borderColor = isPaid ? '#00AA99' : isPartial ? '#F59E0B' : '#D91A60';
                const badgeBg = isPaid ? '#E0F7F5' : isPartial ? '#FEF3C7' : '#FCE4EC';
                const badgeColor = isPaid ? '#00AA99' : isPartial ? '#D97706' : '#D91A60';
                const badgeLabel = isPaid ? 'Paid' : isPartial ? `Partial (Rp ${(order.paidAmount || 0).toLocaleString()})` : 'Not Paid';
                
                return (
                  <div 
                    key={order.id} 
                    className="bg-white rounded-xl shadow-sm overflow-hidden"
                    style={{ borderLeft: `4px solid ${borderColor}` }}
                  >
                    {/* Collapsed View */}
                    <div className="p-4">
                      {/* Row 1: Order Number + Amount */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-gray-900">
                            {getShortOrderId(order.orderNumber || order.id)}
                          </h3>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {order.orderNumber || order.id}
                          </span>
                          {order.createdByAdmin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">
                              Restaurant
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-lg" style={{ color: isPaid ? '#1F2937' : badgeColor }}>
                          Rp {order.total?.toLocaleString()}
                        </p>
                      </div>

                      {/* Row 2: Date + Payment Badge */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">
                          {formatDateTime(order.createdAt)}
                        </p>
                        <span 
                          className="inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full"
                          style={{ backgroundColor: badgeBg, color: badgeColor }}
                        >
                          {badgeLabel}
                        </span>
                      </div>

                      {/* Row 3: Items + Delivery + Order Status */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Package className="w-3.5 h-3.5" />
                          <span>{order.items?.length || 1} item{(order.items?.length || 1) > 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span className="capitalize">{order.deliveryMethod}</span>
                        </div>
                        <span 
                          className="inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full"
                          style={{ 
                            backgroundColor: statusInfo.bgColor,
                            color: statusInfo.color 
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Track button for active orders */}
                      {isActive && (
                        <button
                          onClick={() => handleViewTracking(order.id)}
                          className="w-full mb-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                          style={{ 
                            color: '#D91A60',
                            borderColor: '#D91A60',
                            backgroundColor: 'rgba(217, 26, 96, 0.03)'
                          }}
                        >
                          Track Order
                        </button>
                      )}

                      {/* Expand/Collapse Button */}
                      <button
                        onClick={() => toggleExpanded(order.id)}
                        className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors"
                        style={{ 
                          color: '#D91A60',
                          backgroundColor: 'rgba(217, 26, 96, 0.05)'
                        }}
                      >
                        {isExpanded ? (
                          <>
                            Hide Details
                            <ChevronUp className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            View Details
                            <ChevronDown className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Expanded View */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t space-y-4">
                        {/* Items List */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <Package className="w-4 h-4" style={{ color: '#D91A60' }} />
                            Items Ordered ({order.items?.length || 1})
                          </h4>
                          <div className="space-y-2">
                            {order.items && order.items.length > 0 ? (
                              order.items.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-1 text-sm bg-gray-50 p-2 rounded">
                                  <div className="flex justify-between">
                                    <span>
                                      {(item as any).name || item.title}
                                      {item.category && <span className="text-muted-foreground"> ({item.category})</span>}
                                      {' '}<span className="text-muted-foreground">× {item.quantity}</span>
                                      {item.discountPercentage && item.discountPercentage > 0 && (
                                        <span className="ml-2 text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                          {item.discountPercentage}% OFF
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-medium">Rp {(item.price * item.quantity).toLocaleString()}</span>
                                  </div>
                                  {item.discountPercentage && item.discountPercentage > 0 && item.originalPrice && (
                                    <div className="text-xs text-gray-500">
                                      Original: <span className="line-through">Rp {(item.originalPrice * item.quantity).toLocaleString()}</span>
                                      {' → '}You saved: Rp {((item.originalPrice - item.price) * item.quantity).toLocaleString()}
                                    </div>
                                  )}
                                  {(item as any).notes && (
                                    <p className="text-xs text-blue-600 italic">Note: {(item as any).notes}</p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                                <span>{order.itemTitle}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Payment Summary */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <span className="text-lg">💰</span>
                            Payment Summary
                          </h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal:</span>
                              <span>Rp {order.subtotal?.toLocaleString()}</span>
                            </div>
                            {(order.promoDiscount != null && order.promoDiscount > 0) && (
                              <div className="flex justify-between">
                                <span className="text-green-600 flex items-center gap-1">
                                  <Ticket className="w-3 h-3" />
                                  Promo {order.promoCode ? `(${order.promoCode})` : ''}
                                </span>
                                <span className="text-green-600 font-medium">-Rp {order.promoDiscount.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tax (10%):</span>
                              <span>Rp {order.tax?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Delivery Fee:</span>
                              <span>
                                {order.deliveryFee === 0 
                                  ? "To be calculated" 
                                  : `Rp ${order.deliveryFee.toLocaleString()}`
                                }
                              </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t font-semibold">
                              <span>Total:</span>
                              <span style={{ color: '#D91A60' }}>Rp {order.total?.toLocaleString()}</span>
                            </div>
                          </div>
                          
                          {/* Payment Details */}
                          {order.paymentDetails && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="text-sm font-medium mb-1 text-green-900">Payment Details:</div>
                              <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-2 text-green-800">
                                {order.paymentDetails}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Points Status */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <span className="text-lg">⭐</span>
                            Points Status
                          </h4>
                          <p className="text-sm" style={{ color: pointsStatus.color }}>
                            {pointsStatus.message}
                          </p>
                        </div>

                        {/* Order Info */}
                        {order.address && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <MapPin className="w-4 h-4" style={{ color: '#D91A60' }} />
                              Delivery Address
                            </h4>
                            <p className="text-sm text-muted-foreground">{order.address}</p>
                          </div>
                        )}

                        {order.specialInstructions && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2">📝 Special Instructions</h4>
                            <p className="text-sm text-muted-foreground">{order.specialInstructions}</p>
                          </div>
                        )}

                        {/* Cancellation Reason (if order was cancelled by admin) */}
                        {order.status === "cancelled" && order.cancellationReason && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <h4 className="font-semibold text-sm mb-2 text-red-900">❌ Cancellation Reason</h4>
                            <p className="text-sm text-red-800">{order.cancellationReason}</p>
                            {order.cancelledBy === "admin" && (
                              <p className="text-xs text-red-700 mt-1">Cancelled by Restaurant</p>
                            )}
                          </div>
                        )}

                        {/* Cancellation Info for Confirmed Orders */}
                        {!canCancelOrder(order) && ['confirmed', 'cooking', 'ready', 'out_for_delivery'].includes(order.status) && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-800">
                              ℹ️ This order has been confirmed by the restaurant and cannot be cancelled. Please contact us directly if you need to make changes.
                            </p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          {canCancelOrder(order) && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={cancelling === order.id}
                              className="flex-1"
                            >
                              {cancelling === order.id ? "Cancelling..." : "Cancel Order"}
                            </Button>
                          )}
                          
                          {isActive && (
                            <Button
                              size="sm"
                              onClick={() => handleViewTracking(order.id)}
                              className="flex-1"
                              style={{ backgroundColor: '#D91A60' }}
                            >
                              Track Order
                            </Button>
                          )}
                          
                          {(order.status === 'delivered' || order.status === 'closed') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewTracking(order.id)}
                              className="flex-1"
                            >
                              View Receipt
                            </Button>
                          )}
                          
                          {order.status === 'closed' && (
                            <Button
                              size="sm"
                              onClick={() => handleReorder(order)}
                              disabled={reordering === order.id}
                              className="flex-1 flex items-center justify-center gap-1"
                              style={{ backgroundColor: '#D91A60' }}
                            >
                              <RotateCw className="w-4 h-4" />
                              {reordering === order.id ? "Reordering..." : "Reorder"}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </div>
  );
}