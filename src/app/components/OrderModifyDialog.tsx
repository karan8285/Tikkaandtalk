/**
 * OrderModifyDialog — Full order modification dialog for staff.
 * Allows adding/removing/editing items, adding custom items & charges.
 * Handles payment recalculation and remaining balance display.
 */
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { APP_CONFIG } from "../lib/config";
import {
  Plus, Minus, Trash2, Search, X, Package, ShoppingCart,
  DollarSign, AlertTriangle, Loader2, Edit3, Tag, ChefHat,
} from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface OrderItem {
  id: string;
  title?: string;
  name?: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
  notes?: string;
  addedByAdmin?: boolean;
  modifiedByAdmin?: boolean;
}

interface CustomCharge {
  id: string;
  name: string;
  amount: number;
  addedByAdmin?: boolean;
  addedAt?: string;
}

interface Order {
  id: string;
  orderNumber?: string;
  items: OrderItem[];
  customCharges?: CustomCharge[];
  subtotal: number;
  tax: number;
  taxRate?: number;
  deliveryFee: number;
  total: number;
  promoDiscount?: number;
  promoCode?: string;
  paymentStatus?: string;
  paidAmount?: number;
  status: string;
  deliveryMethod: string;
  paymentMethod?: string;
}

interface MenuItem {
  id: string;
  title: string;
  price: number;
  category: string;
  image?: string;
  source: string;
}

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  onModified: () => void;
}

export function OrderModifyDialog({ order, open, onOpenChange, accessToken, onModified }: Props) {
  // Local editable copy of items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customCharges, setCustomCharges] = useState<CustomCharge[]>([]);
  const [saving, setSaving] = useState(false);

  // Menu search
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [menuResults, setMenuResults] = useState<MenuItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showMenuSearch, setShowMenuSearch] = useState(false);

  // Custom item form
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemQty, setCustomItemQty] = useState("1");

  // Custom charge form
  const [showCustomCharge, setShowCustomCharge] = useState(false);
  const [chargeName, setChargeName] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");

  // Edit item inline
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");

  // Track changes for audit
  const [addedItems, setAddedItems] = useState<OrderItem[]>([]);
  const [removedItems, setRemovedItems] = useState<OrderItem[]>([]);
  const [modifiedItemsList, setModifiedItemsList] = useState<any[]>([]);

  // Initialize from order
  useEffect(() => {
    if (open && order) {
      setItems(JSON.parse(JSON.stringify(order.items || [])));
      setCustomCharges(JSON.parse(JSON.stringify(order.customCharges || [])));
      setAddedItems([]);
      setRemovedItems([]);
      setModifiedItemsList([]);
      setShowMenuSearch(false);
      setShowCustomItem(false);
      setShowCustomCharge(false);
      setEditingItemIdx(null);
    }
  }, [open, order]);

  // Calculate new totals
  const newSubtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
  const chargesTotal = customCharges.reduce((sum, ch) => sum + (ch.amount || 0), 0);
  const taxRate = order.taxRate || (order.subtotal > 0 ? ((order.tax || 0) / order.subtotal) * 100 : 0);
  const newTax = Math.round(newSubtotal * (taxRate / 100));
  const promoDiscount = order.promoDiscount || 0;
  const deliveryFee = order.deliveryFee || 0;
  const newTotal = Math.round(newSubtotal - promoDiscount + newTax + deliveryFee + chargesTotal);
  const totalDiff = newTotal - order.total;
  const paidAmount = order.paidAmount || 0;
  const remainingAfterMod = paidAmount > 0 ? Math.max(0, newTotal - paidAmount) : 0;

  // Check if anything changed
  const hasChanges = totalDiff !== 0 || addedItems.length > 0 || removedItems.length > 0 || modifiedItemsList.length > 0
    || JSON.stringify(customCharges) !== JSON.stringify(order.customCharges || []);

  // Menu search
  const searchMenu = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMenuResults([]);
      return;
    }
    try {
      setSearchLoading(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/menu-search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": accessToken },
      });
      if (res.ok) {
        const data = await res.json();
        setMenuResults(data.items || []);
      }
    } catch (err) {
      console.error("Menu search error:", err);
    } finally {
      setSearchLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (menuSearchQuery.trim()) searchMenu(menuSearchQuery);
      else setMenuResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [menuSearchQuery, searchMenu]);

  // Item actions
  const removeItem = (idx: number) => {
    const item = items[idx];
    setRemovedItems(prev => [...prev, item]);
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateQuantity = (idx: number, delta: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      const oldQty = item.quantity;
      item.quantity = Math.max(1, item.quantity + delta);
      if (item.quantity !== oldQty) {
        item.modifiedByAdmin = true;
        setModifiedItemsList(prev => {
          const existing = prev.find(m => m.id === item.id && m.type === 'qty');
          if (existing) return prev;
          return [...prev, { id: item.id, title: item.title || item.name, details: `Qty changed` }];
        });
      }
      updated[idx] = item;
      return updated;
    });
  };

  const updatePrice = (idx: number, newPrice: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      item.price = newPrice;
      item.modifiedByAdmin = true;
      updated[idx] = item;
      setModifiedItemsList(prev => {
        const existing = prev.find(m => m.id === item.id && m.type === 'price');
        if (existing) return prev;
        return [...prev, { id: item.id, title: item.title || item.name, details: `Price changed` }];
      });
      return updated;
    });
    setEditingItemIdx(null);
  };

  const addMenuItemToOrder = (menuItem: MenuItem) => {
    // Check if item already exists
    const existingIdx = items.findIndex(i => (i.id === menuItem.id) || ((i.title || i.name) === menuItem.title));
    if (existingIdx >= 0) {
      updateQuantity(existingIdx, 1);
      toast.success(`${menuItem.title} quantity increased`);
    } else {
      const newItem: OrderItem = {
        id: menuItem.id || crypto.randomUUID(),
        title: menuItem.title,
        price: menuItem.price,
        quantity: 1,
        image: menuItem.image,
        category: menuItem.category,
        addedByAdmin: true,
      };
      setItems(prev => [...prev, newItem]);
      setAddedItems(prev => [...prev, newItem]);
      toast.success(`${menuItem.title} added`);
    }
  };

  const addCustomItem = () => {
    if (!customItemName.trim() || !customItemPrice) return;
    const price = Number(customItemPrice);
    const qty = Number(customItemQty) || 1;
    if (price <= 0) { toast.error("Price must be greater than 0"); return; }
    const newItem: OrderItem = {
      id: `custom-${Date.now()}`,
      title: customItemName.trim(),
      price,
      quantity: qty,
      category: "Custom Item",
      addedByAdmin: true,
    };
    setItems(prev => [...prev, newItem]);
    setAddedItems(prev => [...prev, newItem]);
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQty("1");
    setShowCustomItem(false);
    toast.success(`Custom item "${newItem.title}" added`);
  };

  const addCustomCharge = () => {
    if (!chargeName.trim() || !chargeAmount) return;
    const amount = Number(chargeAmount);
    if (amount <= 0) { toast.error("Amount must be greater than 0"); return; }
    const charge: CustomCharge = {
      id: `charge-${Date.now()}`,
      name: chargeName.trim(),
      amount,
      addedByAdmin: true,
      addedAt: new Date().toISOString(),
    };
    setCustomCharges(prev => [...prev, charge]);
    setChargeName("");
    setChargeAmount("");
    setShowCustomCharge(false);
    toast.success(`Charge "${charge.name}" added`);
  };

  const removeCharge = (idx: number) => {
    setCustomCharges(prev => prev.filter((_, i) => i !== idx));
  };

  // Save modifications
  const handleSave = async () => {
    if (!hasChanges) { toast.info("No changes to save"); return; }
    try {
      setSaving(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/orders/${order.id}/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({
          items,
          customCharges,
          addedItems,
          removedItems,
          modifiedItems: modifiedItemsList,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Order modified successfully");
        onModified();
        onOpenChange(false);
      } else {
        toast.error(data.error || "Failed to modify order");
      }
    } catch (err: any) {
      console.error("Order modify error:", err);
      toast.error(err.message || "Failed to modify order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 pt-4 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5" style={{ color: BRAND }} />
              Modify Order
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <span className="font-mono font-bold">{getShortOrderId(order.orderNumber || order.id)}</span>
              <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
              {order.paymentStatus && (
                <Badge variant="outline" className={`text-[10px] ${
                  order.paymentStatus === 'paid' ? 'text-green-700 border-green-300' :
                  order.paymentStatus === 'partial' ? 'text-yellow-700 border-yellow-300' :
                  'text-red-700 border-red-300'
                }`}>
                  {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                </Badge>
              )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* Current Items */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
              <Package className="w-3.5 h-3.5" /> Order Items ({items.length})
            </Label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${
                    item.addedByAdmin ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Item Image */}
                  {item.image && (
                    <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  )}

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-medium truncate">{item.title || item.name}</span>
                      {item.addedByAdmin && (
                        <Badge className="text-[8px] bg-blue-500 text-white px-1 py-0">Admin</Badge>
                      )}
                      {item.modifiedByAdmin && !item.addedByAdmin && (
                        <Badge className="text-[8px] bg-amber-500 text-white px-1 py-0">Modified</Badge>
                      )}
                    </div>
                    {item.category && (
                      <span className="text-[10px] text-gray-400">{item.category}</span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {editingItemIdx === idx ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-24 h-6 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') updatePrice(idx, Number(editPrice));
                              if (e.key === 'Escape') setEditingItemIdx(null);
                            }}
                          />
                          <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => updatePrice(idx, Number(editPrice))}>OK</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => setEditingItemIdx(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingItemIdx(idx); setEditPrice(String(item.price)); }}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: BRAND }}
                        >
                          {formatIDR(item.price)}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Item Total */}
                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">
                    {formatIDR(item.price * item.quantity)}
                  </span>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(idx)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No items in order</p>
              )}
            </div>
          </div>

          {/* Custom Charges */}
          {customCharges.length > 0 && (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
                <DollarSign className="w-3.5 h-3.5" /> Custom Charges
              </Label>
              <div className="space-y-1.5">
                {customCharges.map((charge, idx) => (
                  <div key={charge.id} className="flex items-center justify-between p-2 rounded-lg bg-purple-50 border border-purple-200">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-sm font-medium">{charge.name}</span>
                      <Badge className="text-[8px] bg-purple-500 text-white px-1 py-0">Charge</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-purple-700">{formatIDR(charge.amount)}</span>
                      <button
                        onClick={() => removeCharge(idx)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-red-400 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-dashed"
              onClick={() => { setShowMenuSearch(!showMenuSearch); setShowCustomItem(false); setShowCustomCharge(false); }}
            >
              <Search className="w-3.5 h-3.5 mr-1" /> Add from Menu
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-dashed"
              onClick={() => { setShowCustomItem(!showCustomItem); setShowMenuSearch(false); setShowCustomCharge(false); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Custom Item
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-dashed"
              onClick={() => { setShowCustomCharge(!showCustomCharge); setShowMenuSearch(false); setShowCustomItem(false); }}
            >
              <DollarSign className="w-3.5 h-3.5 mr-1" /> Custom Charge
            </Button>
          </div>

          {/* Menu Search Panel */}
          {showMenuSearch && (
            <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search menu items..."
                  value={menuSearchQuery}
                  onChange={(e) => setMenuSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowMenuSearch(false); setMenuSearchQuery(""); setMenuResults([]); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {searchLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              )}
              {!searchLoading && menuResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {menuResults.map((mi) => (
                    <button
                      key={mi.id}
                      onClick={() => addMenuItemToOrder(mi)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all text-left"
                    >
                      {mi.image && (
                        <img src={mi.image} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{mi.title}</p>
                        <p className="text-[10px] text-gray-400">{mi.category}</p>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: BRAND }}>{formatIDR(mi.price)}</span>
                      <Plus className="w-4 h-4 text-green-500" />
                    </button>
                  ))}
                </div>
              )}
              {!searchLoading && menuSearchQuery && menuResults.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">No menu items found</p>
              )}
              {!menuSearchQuery && (
                <p className="text-xs text-gray-400 text-center py-2">Type to search menu items...</p>
              )}
            </div>
          )}

          {/* Custom Item Form */}
          {showCustomItem && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-blue-800">Add Custom Item</Label>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setShowCustomItem(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Input
                placeholder="Item name (e.g. Extra Raita)"
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Price (Rp)"
                  value={customItemPrice}
                  onChange={(e) => setCustomItemPrice(e.target.value)}
                  className="h-8 text-sm"
                  min={1}
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  value={customItemQty}
                  onChange={(e) => setCustomItemQty(e.target.value)}
                  className="h-8 text-sm"
                  min={1}
                />
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!customItemName.trim() || !customItemPrice || Number(customItemPrice) <= 0}
                onClick={addCustomItem}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Custom Item
              </Button>
            </div>
          )}

          {/* Custom Charge Form */}
          {showCustomCharge && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-purple-800">Add Custom Charge</Label>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setShowCustomCharge(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Input
                placeholder="Charge name (e.g. Packaging Fee, Rush Delivery)"
                value={chargeName}
                onChange={(e) => setChargeName(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="number"
                placeholder="Amount (Rp)"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                className="h-8 text-sm"
                min={1}
              />
              <Button
                size="sm"
                className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700"
                disabled={!chargeName.trim() || !chargeAmount || Number(chargeAmount) <= 0}
                onClick={addCustomCharge}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Charge
              </Button>
            </div>
          )}

          {/* Price Summary */}
          <div className="bg-gray-50 border rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatIDR(newSubtotal)}</span>
            </div>
            {promoDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600">Promo {order.promoCode ? `(${order.promoCode})` : ''}</span>
                <span className="text-green-600">-{formatIDR(promoDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax{taxRate ? ` (${taxRate.toFixed(1)}%)` : ''}</span>
              <span>{formatIDR(newTax)}</span>
            </div>
            {order.deliveryMethod === 'delivery' && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery Fee</span>
                <span>{deliveryFee > 0 ? formatIDR(deliveryFee) : 'Free'}</span>
              </div>
            )}
            {chargesTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-purple-600">Custom Charges</span>
                <span className="text-purple-600">+{formatIDR(chargesTotal)}</span>
              </div>
            )}
            <div className="border-t pt-1.5 mt-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold">New Total</span>
                <span className="text-lg font-bold" style={{ color: BRAND }}>{formatIDR(newTotal)}</span>
              </div>
              {totalDiff !== 0 && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-gray-500">Previous Total: {formatIDR(order.total)}</span>
                  <span className={`font-semibold ${totalDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {totalDiff > 0 ? '+' : ''}{formatIDR(totalDiff)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Impact Warning */}
          {paidAmount > 0 && totalDiff > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Payment Impact</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Customer has already paid <strong>{formatIDR(paidAmount)}</strong>.
                    {order.paymentMethod === 'cash' ? (
                      <> The additional <strong>{formatIDR(remainingAfterMod)}</strong> will be added to the COD total.</>
                    ) : (
                      <> A remaining balance of <strong>{formatIDR(remainingAfterMod)}</strong> will be shown on the customer's tracking page for online payment.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {paidAmount === 0 && order.paymentMethod === 'cash' && totalDiff !== 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  COD Order — new total of <strong>{formatIDR(newTotal)}</strong> will be collected on delivery/pickup.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-4 py-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 text-white"
              style={{ backgroundColor: hasChanges ? BRAND : '#9ca3af' }}
              disabled={saving || !hasChanges}
              onClick={handleSave}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-1.5" />
                  {hasChanges ? 'Save Modifications' : 'No Changes'}
                </>
              )}
            </Button>
          </div>
          {hasChanges && (
            <p className="text-[10px] text-amber-600 text-center mt-1.5 font-medium">
              {addedItems.length > 0 && `${addedItems.length} added`}
              {removedItems.length > 0 && `${addedItems.length > 0 ? ', ' : ''}${removedItems.length} removed`}
              {modifiedItemsList.length > 0 && `${(addedItems.length > 0 || removedItems.length > 0) ? ', ' : ''}${modifiedItemsList.length} modified`}
              {customCharges.length !== (order.customCharges || []).length && ` | charges updated`}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}