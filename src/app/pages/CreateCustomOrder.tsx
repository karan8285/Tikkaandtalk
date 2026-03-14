import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ArrowLeft, Search, Plus, Minus, ShoppingCart, Trash2, Package, Clock, AlertCircle, Users, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  points: number;
}

interface MenuItem {
  id: string;
  name: string;
  title?: string;
  description?: string;
  price: number;
  discountedPrice?: number;
  finalPrice?: number;
  image?: string;
  category?: string;
  isAvailable?: boolean;
  stock?: number;
  enabled?: boolean;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  stock?: number;
  isCustom?: boolean;
  notes?: string;
}

export default function CreateCustomOrder() {
  const navigate = useNavigate();
  const { user, accessToken, loading: authLoading } = useAuth();
  
  // Auth & Loading
  const [loading, setLoading] = useState(true);
  
  // Customer Selection
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  
  // Menu Items
  const [regularMenuItems, setRegularMenuItems] = useState<MenuItem[]>([]);
  const [todaysSpecialItems, setTodaysSpecialItems] = useState<MenuItem[]>([]);
  const [kidsMenuItems, setKidsMenuItems] = useState<MenuItem[]>([]);
  const [flashSaleItems, setFlashSaleItems] = useState<MenuItem[]>([]);
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Custom Item Form
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemQuantity, setCustomItemQuantity] = useState("1");
  const [customItemNotes, setCustomItemNotes] = useState("");
  
  // Order Configuration
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  
  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  
  // UI States
  const [creating, setCreating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Check admin access
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/login");
      return;
    }
    
    if (!user.isAdmin) {
      toast.error("Admin access required");
      navigate("/");
      return;
    }
    
    fetchInitialData();
  }, [authLoading, user, navigate]);

  // Fetch all necessary data
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      console.log("🔄 Fetching custom order page data...");
      
      // Fetch users
      console.log("📥 Fetching users...");
      const usersRes = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
      });
      
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users.filter((u: User) => !u.isAdmin));
        console.log(`✅ Loaded ${usersData.users.length} users`);
      } else {
        console.error("❌ Failed to fetch users:", usersRes.status);
      }
      
      // Fetch menu items
      console.log("📥 Fetching menu items...");
      const [regularRes, specialRes, kidsRes, flashRes] = await Promise.all([
        fetch(`${API_BASE}/regular-menu`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${API_BASE}/todays-special`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${API_BASE}/kids-menu`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${API_BASE}/flash-sale`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
      ]);
      
      if (regularRes.ok) {
        const data = await regularRes.json();
        setRegularMenuItems(data.items || []);
        console.log(`✅ Loaded ${data.items?.length || 0} regular menu items`);
      } else {
        console.error("❌ Failed to fetch regular menu:", regularRes.status);
      }
      
      if (specialRes.ok) {
        const data = await specialRes.json();
        setTodaysSpecialItems(data.items || []);
        console.log(`✅ Loaded ${data.items?.length || 0} today's special items`);
      } else {
        console.error("❌ Failed to fetch today's special:", specialRes.status);
      }
      
      if (kidsRes.ok) {
        const data = await kidsRes.json();
        setKidsMenuItems(data.items || []);
        console.log(`✅ Loaded ${data.items?.length || 0} kids menu items`);
      } else {
        console.error("❌ Failed to fetch kids menu:", kidsRes.status);
      }
      
      if (flashRes.ok) {
        const data = await flashRes.json();
        setFlashSaleItems(data.items || []);
        console.log(`✅ Loaded ${data.items?.length || 0} flash sale items`);
      } else {
        console.error("❌ Failed to fetch flash sale:", flashRes.status);
      }
      
      console.log("✅ Data fetching complete");
      
    } catch (error) {
      console.error("❌ Failed to fetch data:", error);
      toast.error("Failed to load data. Please try refreshing the page.");
    } finally {
      setLoading(false);
    }
  };

  // Filter customers based on search
  const filteredCustomers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.phone.includes(query)
    );
  });

  // Add item to cart
  const addToCart = (item: MenuItem) => {
    const itemPrice = item.finalPrice || item.discountedPrice || item.price;
    const itemName = item.name || item.title || "";
    const itemStock = item.stock;
    
    // Check if item is available
    if (item.isAvailable === false || item.enabled === false) {
      toast.error("This item is currently unavailable");
      return;
    }
    
    // Check stock
    const existingItem = cart.find((c) => c.id === item.id);
    const currentQuantity = existingItem?.quantity || 0;
    
    if (itemStock !== undefined && currentQuantity >= itemStock) {
      toast.error(`Only ${itemStock} in stock`);
      return;
    }
    
    if (existingItem) {
      setCart(cart.map((c) =>
        c.id === item.id
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ));
    } else {
      setCart([...cart, {
        id: item.id,
        name: itemName,
        price: itemPrice,
        quantity: 1,
        stock: itemStock,
      }]);
    }
    
    toast.success(`Added ${itemName} to cart`);
  };

  // Update cart quantity
  const updateQuantity = (itemId: string, delta: number) => {
    const item = cart.find((c) => c.id === itemId);
    if (!item) return;
    
    const newQuantity = item.quantity + delta;
    
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    
    // Check stock
    if (item.stock !== undefined && newQuantity > item.stock) {
      toast.error(`Only ${item.stock} in stock`);
      return;
    }
    
    setCart(cart.map((c) =>
      c.id === itemId
        ? { ...c, quantity: newQuantity }
        : c
    ));
  };

  // Remove from cart
  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.id !== itemId));
  };

  // Add custom item to cart
  const handleAddCustomItem = () => {
    const price = Number(customItemPrice);
    const quantity = Number(customItemQuantity);
    
    if (!customItemName.trim()) {
      toast.error("Please enter item name");
      return;
    }
    
    if (price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    
    if (quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    
    // Generate unique ID for custom item
    const customId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const customItem: CartItem = {
      id: customId,
      name: customItemName.trim(),
      price: price,
      quantity: quantity,
      isCustom: true,
      notes: customItemNotes.trim() || undefined,
    };
    
    setCart([...cart, customItem]);
    toast.success(`Added custom item: ${customItemName}`);
    
    // Reset form
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQuantity("1");
    setCustomItemNotes("");
  };

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.1; // 10% PPN
  const total = subtotal + tax + Number(deliveryFee);
  
  // Calculate points
  const pointsToEarn = paymentReceived ? Math.floor(total / 1000) : 0;

  // Create order
  const handleCreateOrder = async () => {
    try {
      // Validation
      if (!selectedCustomer) {
        toast.error("Please select a customer");
        return;
      }
      
      if (cart.length === 0) {
        toast.error("Please add at least one item");
        return;
      }
      
      if (orderType === "delivery" && !deliveryAddress.trim()) {
        toast.error("Please enter delivery address");
        return;
      }
      
      // Validate scheduling
      if (isScheduled) {
        if (!scheduledDate || !scheduledTime) {
          toast.error("Please select both date and time for scheduled order");
          return;
        }
        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
        if (scheduledDateTime <= new Date()) {
          toast.error("Scheduled time must be in the future");
          return;
        }
      }
      
      setCreating(true);
      
      // Build scheduledAt ISO string if scheduling
      const scheduledAt = isScheduled && scheduledDate && scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : undefined;
      
      const orderData = {
        userId: selectedCustomer.id,
        customerPhone: selectedCustomer.phone,
        customerName: selectedCustomer.name,
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          isCustom: item.isCustom || false,
          notes: item.notes || undefined,
        })),
        orderType: orderType,
        deliveryAddress: orderType === "delivery" ? deliveryAddress : undefined,
        specialInstructions: specialInstructions.trim() || undefined,
        adminNotes: adminNotes.trim() || undefined,
        paymentReceived: paymentReceived,
        subtotal: subtotal,
        tax: tax,
        deliveryFee: Number(deliveryFee),
        total: total,
        scheduledAt: scheduledAt,
      };
      
      const response = await fetch(`${API_BASE}/admin/create-custom-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify(orderData),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create order");
      }
      
      toast.success(`Order ${result.order.orderNumber} created successfully!`);
      
      // Reset form
      setSelectedCustomer(null);
      setCart([]);
      setOrderType("pickup");
      setDeliveryAddress("");
      setDeliveryFee("");
      setSpecialInstructions("");
      setAdminNotes("");
      setPaymentReceived(false);
      setIsScheduled(false);
      setScheduledDate("");
      setScheduledTime("");
      setSearchQuery("");
      setConfirmDialog(false);
      
      // Navigate to admin page
      setTimeout(() => {
        navigate("/admin");
      }, 1500);
      
    } catch (error: any) {
      console.error("Failed to create order:", error);
      toast.error(error.message || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  // Render menu item card
  const renderMenuItem = (item: MenuItem) => {
    const itemPrice = item.finalPrice || item.discountedPrice || item.price;
    const itemName = item.name || item.title || "";
    const isAvailable = item.isAvailable !== false && item.enabled !== false;
    const inStock = item.stock === undefined || item.stock > 0;
    
    return (
      <Card key={item.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1 truncate">{itemName}</h3>
            {item.description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description}</p>
            )}
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-primary">{formatIDR(itemPrice)}</p>
              {item.stock !== undefined && (
                <Badge variant="outline" className="text-xs">
                  Stock: {item.stock}
                </Badge>
              )}
            </div>
            {!isAvailable && (
              <Badge variant="destructive" className="mt-2">Unavailable</Badge>
            )}
            {isAvailable && !inStock && (
              <Badge variant="destructive" className="mt-2">Out of Stock</Badge>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => addToCart(item)}
            disabled={!isAvailable || !inStock}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Clock className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Custom Order</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column: Customer Selection & Order Config */}
          <div className="lg:col-span-1 space-y-6">
            {/* Customer Selection */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Customer</h2>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {selectedCustomer ? (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{selectedCustomer.name}</p>
                      <p className="text-sm text-gray-600">{selectedCustomer.phone}</p>
                      <p className="text-xs text-teal-600 mt-1">
                        {selectedCustomer.points} points
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedCustomer(null)}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredCustomers.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Users className="h-6 w-6 text-gray-400" />
                      </div>
                      {searchQuery ? (
                        <>
                          <p className="text-sm font-medium text-gray-900 mb-1">No customers found</p>
                          <p className="text-xs text-gray-500">Try a different search term</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900 mb-1">No customers yet</p>
                          <p className="text-xs text-gray-500 mb-3">
                            Customers need to register first before you can create orders for them
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open('/signup', '_blank')}
                            className="text-xs"
                          >
                            Open Registration Page
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-sm text-gray-600">{customer.phone}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </Card>

            {/* Order Configuration */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h2>
              
              <div className="space-y-4">
                {/* Order Type */}
                <div>
                  <Label className="mb-2 block">Order Type</Label>
                  <Select value={orderType} onValueChange={(v: any) => setOrderType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">Pickup</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Delivery Address */}
                {orderType === "delivery" && (
                  <div>
                    <Label className="mb-2 block">Delivery Address *</Label>
                    <Textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Enter delivery address..."
                      rows={3}
                    />
                  </div>
                )}

                {/* Delivery Fee */}
                {orderType === "delivery" && (
                  <div>
                    <Label className="mb-2 block">Delivery Fee (Rp)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      min="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter delivery fee amount, or leave as 0 for free delivery
                    </p>
                  </div>
                )}

                {/* Special Instructions */}
                <div>
                  <Label className="mb-2 block">Special Instructions</Label>
                  <Textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Any special requests from customer..."
                    rows={2}
                  />
                </div>

                {/* Admin Notes */}
                <div>
                  <Label className="mb-2 block">Admin Notes (Internal)</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes (not visible to customer)..."
                    rows={2}
                  />
                </div>

                {/* Payment Status */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label className="font-medium">Payment Received</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Mark as paid if customer already paid
                    </p>
                  </div>
                  <button
                    onClick={() => setPaymentReceived(!paymentReceived)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      paymentReceived ? "bg-teal-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        paymentReceived ? "translate-x-6" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Schedule Order */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <Label className="font-medium flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4 text-blue-600" />
                      Schedule Order
                    </Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Set a future date & time for this order
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsScheduled(!isScheduled);
                      if (isScheduled) {
                        setScheduledDate("");
                        setScheduledTime("");
                      }
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      isScheduled ? "bg-blue-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        isScheduled ? "translate-x-6" : ""
                      }`}
                    />
                  </button>
                </div>

                {isScheduled && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                    <div>
                      <Label className="mb-1.5 block text-sm font-medium">Date *</Label>
                      <Input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-sm font-medium">Time *</Label>
                      <Input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                    {scheduledDate && scheduledTime && (
                      <div className="flex items-center gap-2 p-2 bg-white border border-blue-200 rounded-lg">
                        <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                        <p className="text-sm text-blue-800">
                          Order will activate on{" "}
                          <span className="font-semibold">
                            {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Cart Summary - Mobile Only */}
            {cart.length > 0 && (
              <Card className="p-6 lg:hidden">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Cart</h2>
                  <Badge>{cart.length} items</Badge>
                </div>
                
                <div className="space-y-3 mb-4">
                  {cart.map((item) => (
                    <div key={item.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">{item.name}</p>
                          <p className="text-xs text-gray-600">{formatIDR(item.price)}</p>
                          {item.notes && (
                            <p className="text-xs text-blue-600 mt-1 italic">{item.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="h-7 w-7 p-0"
                            disabled={item.isCustom}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="h-7 w-7 p-0"
                            disabled={item.isCustom || (item.stock !== undefined && item.quantity >= item.stock)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.id)}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatIDR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax (10%)</span>
                    <span className="font-medium">{formatIDR(tax)}</span>
                  </div>
                  {orderType === "delivery" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Delivery Fee</span>
                      <span className="font-medium">
                        {Number(deliveryFee) > 0 ? formatIDR(Number(deliveryFee)) : "Free"}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t">
                    <span>Total</span>
                    <span className="text-primary">{formatIDR(total)}</span>
                  </div>
                  {paymentReceived && (
                    <div className="flex justify-between text-sm text-teal-600">
                      <span>Points to Earn</span>
                      <span className="font-medium">{pointsToEarn} pts</span>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={() => setConfirmDialog(true)}
                  disabled={!selectedCustomer || cart.length === 0 || creating || (isScheduled && (!scheduledDate || !scheduledTime))}
                >
                  {creating ? "Creating..." : isScheduled ? "Schedule Order" : "Create Order"}
                </Button>
              </Card>
            )}
          </div>

          {/* Middle Column: Menu Items */}
          <div className="lg:col-span-1">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Menu Items</h2>
              
              <Tabs defaultValue="regular" className="w-full">
                <TabsList className="w-full grid grid-cols-5 mb-4">
                  <TabsTrigger value="regular" className="text-xs">Regular</TabsTrigger>
                  <TabsTrigger value="special" className="text-xs">Special</TabsTrigger>
                  <TabsTrigger value="kids" className="text-xs">Kids</TabsTrigger>
                  <TabsTrigger value="flash" className="text-xs">Flash</TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
                </TabsList>

                <div className="max-h-[600px] overflow-y-auto">
                  <TabsContent value="regular" className="space-y-3 mt-0">
                    {regularMenuItems.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">No items available</p>
                    ) : (
                      regularMenuItems.map(renderMenuItem)
                    )}
                  </TabsContent>

                  <TabsContent value="special" className="space-y-3 mt-0">
                    {todaysSpecialItems.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">No items available</p>
                    ) : (
                      todaysSpecialItems.map(renderMenuItem)
                    )}
                  </TabsContent>

                  <TabsContent value="kids" className="space-y-3 mt-0">
                    {kidsMenuItems.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">No items available</p>
                    ) : (
                      kidsMenuItems.map(renderMenuItem)
                    )}
                  </TabsContent>

                  <TabsContent value="flash" className="space-y-3 mt-0">
                    {flashSaleItems.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">No items available</p>
                    ) : (
                      flashSaleItems.map(renderMenuItem)
                    )}
                  </TabsContent>

                  <TabsContent value="custom" className="space-y-4 mt-0">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800 mb-4">
                        Create custom items for corporate/bulk orders with custom pricing
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="customItemName" className="text-sm font-medium">
                            Item Name *
                          </Label>
                          <Input
                            id="customItemName"
                            placeholder="e.g., Corporate Lunch Package"
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="customItemPrice" className="text-sm font-medium">
                            Price (Rp) *
                          </Label>
                          <Input
                            id="customItemPrice"
                            type="number"
                            placeholder="0"
                            value={customItemPrice}
                            onChange={(e) => setCustomItemPrice(e.target.value)}
                            className="mt-1"
                            min="0"
                          />
                        </div>

                        <div>
                          <Label htmlFor="customItemQuantity" className="text-sm font-medium">
                            Quantity *
                          </Label>
                          <Input
                            id="customItemQuantity"
                            type="number"
                            placeholder="1"
                            value={customItemQuantity}
                            onChange={(e) => setCustomItemQuantity(e.target.value)}
                            className="mt-1"
                            min="1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="customItemNotes" className="text-sm font-medium">
                            Notes (Optional)
                          </Label>
                          <Textarea
                            id="customItemNotes"
                            placeholder="Additional details about this custom item..."
                            value={customItemNotes}
                            onChange={(e) => setCustomItemNotes(e.target.value)}
                            className="mt-1"
                            rows={3}
                          />
                        </div>

                        <Button
                          onClick={handleAddCustomItem}
                          className="w-full"
                          disabled={!customItemName.trim() || !customItemPrice || Number(customItemPrice) <= 0 || !customItemQuantity || Number(customItemQuantity) < 1}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Custom Item to Cart
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </Card>
          </div>

          {/* Right Column: Cart & Checkout - Desktop Only */}
          <div className="hidden lg:block lg:col-span-1">
            <Card className="p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Cart</h2>
                {cart.length > 0 && <Badge>{cart.length} items</Badge>}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No items in cart</p>
                  <p className="text-sm text-gray-400 mt-1">Add items from menu</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className="border-b pb-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{item.name}</p>
                            <p className="text-xs text-gray-600">{formatIDR(item.price)}</p>
                            {item.notes && (
                              <p className="text-xs text-blue-600 mt-1 italic">{item.notes}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.id)}
                            className="h-6 w-6 p-0 shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="h-7 w-7 p-0"
                            disabled={item.isCustom}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="h-7 w-7 p-0"
                            disabled={item.isCustom || (item.stock !== undefined && item.quantity >= item.stock)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium ml-auto">
                            {formatIDR(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium">{formatIDR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax (10%)</span>
                      <span className="font-medium">{formatIDR(tax)}</span>
                    </div>
                    {orderType === "delivery" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Delivery Fee</span>
                        <span className="font-medium">
                          {Number(deliveryFee) > 0 ? formatIDR(Number(deliveryFee)) : "Free"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 border-t">
                      <span>Total</span>
                      <span className="text-primary">{formatIDR(total)}</span>
                    </div>
                    {paymentReceived && (
                      <div className="flex justify-between text-sm text-teal-600">
                        <span>Points to Earn</span>
                        <span className="font-medium">{pointsToEarn} pts</span>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full mt-6"
                    onClick={() => setConfirmDialog(true)}
                    disabled={!selectedCustomer || cart.length === 0 || creating || (isScheduled && (!scheduledDate || !scheduledTime))}
                  >
                    {creating ? "Creating..." : isScheduled ? "Schedule Order" : "Create Order"}
                  </Button>
                  
                  {!selectedCustomer && (
                    <div className="flex items-start gap-2 mt-3 p-3 bg-orange-50 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-800">
                        Please select a customer before creating order
                      </p>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Order Creation</DialogTitle>
            <DialogDescription>
              Please review the order details before creating:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Customer</p>
              <p className="text-sm text-gray-600">
                {selectedCustomer?.name} ({selectedCustomer?.phone})
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Items ({cart.length})</p>
              <div className="text-sm text-gray-600 space-y-2">
                {cart.map((item) => (
                  <div key={item.id}>
                    <div className="flex justify-between">
                      <span>{item.name} x{item.quantity}</span>
                      <span>{formatIDR(item.price * item.quantity)}</span>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-blue-600 italic ml-2">Note: {item.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Order Type</p>
              <p className="text-sm text-gray-600 capitalize">{orderType}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Payment Status</p>
              <Badge variant={paymentReceived ? "default" : "secondary"}>
                {paymentReceived ? "Paid" : "Unpaid"}
              </Badge>
            </div>

            {isScheduled && scheduledDate && scheduledTime && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <CalendarClock className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Scheduled Order</p>
                  <p className="text-xs text-blue-600">
                    Will activate on{" "}
                    {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="space-y-1 mb-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax (10%)</span>
                  <span>{formatIDR(tax)}</span>
                </div>
                {orderType === "delivery" && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Delivery Fee</span>
                    <span>{Number(deliveryFee) > 0 ? formatIDR(Number(deliveryFee)) : "Free"}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t">
                <span>Total Amount</span>
                <span className="text-primary">{formatIDR(total)}</span>
              </div>
              {paymentReceived && (
                <p className="text-sm text-teal-600 mt-2">
                  Customer will earn {pointsToEarn} points when order is delivered
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateOrder} disabled={creating}>
              {creating ? "Creating..." : isScheduled ? "Confirm & Schedule" : "Confirm & Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}