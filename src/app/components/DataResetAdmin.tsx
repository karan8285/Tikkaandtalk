/**
 * DataResetAdmin — Production data reset tool (superuser-only).
 * Allows selective deletion of test data before going live.
 * Preserves: staff accounts, admin profiles, restaurant settings, points expiry config.
 */
import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { AlertTriangle, Trash2, RefreshCw, Shield, CheckCircle, XCircle, Package, Users, ShoppingCart, Ticket, Award, Home, MessageSquare, PartyPopper, Layers } from "lucide-react";
import { toast } from "sonner";
import { projectId } from "/utils/supabase/info";
import { publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface DataResetAdminProps {
  customToken: string;
}

interface DataCounts {
  menu: number;
  categories: number;
  special_offers: number;
  orders: number;
  customers: number;
  total_users: number;
  staff: number;
  vouchers: number;
  user_vouchers: number;
  dinein_vouchers: number;
  dinein_assignments: number;
  tier_benefits: number;
}

const RESET_CATEGORIES = [
  { id: "menu", label: "Menu Items", desc: "Regular menu, Today's Special, Kids Menu, Flash Sale, Categories, Special Offers", icon: Package, countKeys: ["menu", "categories", "special_offers"] },
  { id: "custom_menus", label: "Custom Menus", desc: "All custom menu configurations", icon: Layers, countKeys: [] },
  { id: "orders", label: "All Orders", desc: "Orders, order lists, guest orders, order counter reset", icon: ShoppingCart, countKeys: ["orders"] },
  { id: "customers", label: "Customer Accounts", desc: "Customer profiles, carts, points ledgers, notifications, push subs (keeps admin & staff)", icon: Users, countKeys: ["customers"] },
  { id: "vouchers", label: "Voucher Templates", desc: "Voucher templates, user assignments, promo codes", icon: Ticket, countKeys: ["vouchers", "user_vouchers"] },
  { id: "dinein_vouchers", label: "Dine-In Vouchers", desc: "Dine-in voucher templates and assignments", icon: Ticket, countKeys: ["dinein_vouchers", "dinein_assignments"] },
  { id: "tiers", label: "Tier Benefits", desc: "All tier benefit configurations", icon: Award, countKeys: ["tier_benefits"] },
  { id: "parties", label: "Parties & Celebrations", desc: "Party packages, celebration categories and settings", icon: PartyPopper, countKeys: [] },
  { id: "home_layout", label: "Home Layout", desc: "Home page layout configuration", icon: Home, countKeys: [] },
  { id: "broadcasts", label: "Broadcast Messages", desc: "All broadcast messages and settings", icon: MessageSquare, countKeys: [] },
];

export function DataResetAdmin({ customToken }: DataResetAdminProps) {
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [results, setResults] = useState<Record<string, number> | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/data-reset-preview`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setCounts(data.counts);
    } catch (e: any) {
      toast.error(`Failed to load preview: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPreview(); }, []);

  const toggleCategory = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === RESET_CATEGORIES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(RESET_CATEGORIES.map(c => c.id)));
    }
  };

  const getCategoryCount = (cat: typeof RESET_CATEGORIES[0]): number => {
    if (!counts) return 0;
    return cat.countKeys.reduce((sum, key) => sum + ((counts as any)[key] || 0), 0);
  };

  const handleDelete = async () => {
    if (confirmCode !== "DELETE-ALL-DATA") {
      toast.error("Please type DELETE-ALL-DATA to confirm");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/data-reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ categories: Array.from(selected), confirmCode }),
      });
      const data = await res.json();
      console.log("🗑️ Data reset response:", JSON.stringify(data));
      if (data.error) { toast.error(data.error); return; }
      setResults(data.results);
      setDeleteErrors(data.errors || []);
      toast.success("Data reset completed!");
      setConfirmOpen(false);
      setConfirmCode("");
      setSelected(new Set());
      // Refresh counts
      fetchPreview();
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Card className="p-4 border-red-300 bg-red-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 text-lg">Production Data Reset</h3>
            <p className="text-red-700 text-sm mt-1">
              This tool permanently deletes selected data from the database. Use this to clean up test data before going live.
              <strong> This action cannot be undone.</strong>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-800">Preserved: Staff accounts</Badge>
              <Badge className="bg-green-100 text-green-800">Preserved: Admin profiles</Badge>
              <Badge className="bg-green-100 text-green-800">Preserved: Restaurant settings</Badge>
              <Badge className="bg-green-100 text-green-800">Preserved: Points expiry config</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Data Preview Counts */}
      {counts && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-700">Current Data Summary</h4>
            <Button variant="outline" size="sm" onClick={fetchPreview} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Menu Items", value: counts.menu, color: "bg-blue-100 text-blue-800" },
              { label: "Orders", value: counts.orders, color: "bg-orange-100 text-orange-800" },
              { label: "Customers", value: counts.customers, color: "bg-purple-100 text-purple-800" },
              { label: "Staff (kept)", value: counts.staff, color: "bg-green-100 text-green-800" },
              { label: "Vouchers", value: counts.vouchers, color: "bg-pink-100 text-pink-800" },
              { label: "User Vouchers", value: counts.user_vouchers, color: "bg-pink-100 text-pink-800" },
              { label: "Dine-In Vouchers", value: counts.dinein_vouchers, color: "bg-amber-100 text-amber-800" },
              { label: "Tier Benefits", value: counts.tier_benefits, color: "bg-indigo-100 text-indigo-800" },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-lg bg-gray-50 text-center">
                <p className="text-2xl font-bold">{item.value}</p>
                <Badge className={`text-[10px] mt-1 ${item.color}`}>{item.label}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Category Selection */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-700">Select Data to Delete</h4>
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selected.size === RESET_CATEGORIES.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        <div className="space-y-2">
          {RESET_CATEGORIES.map(cat => {
            const count = getCategoryCount(cat);
            const Icon = cat.icon;
            return (
              <div
                key={cat.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(cat.id) ? "border-red-300 bg-red-50" : "border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => toggleCategory(cat.id)}
              >
                <Checkbox
                  checked={selected.has(cat.id)}
                  onCheckedChange={(e) => { /* handled by parent onClick */ }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 pointer-events-none"
                />
                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${selected.has(cat.id) ? "text-red-500" : "text-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{cat.label}</span>
                    {count > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{count} items</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{cat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Delete Button */}
      <div className="flex justify-center">
        <Button
          variant="destructive"
          size="lg"
          disabled={selected.size === 0}
          onClick={() => { setConfirmOpen(true); setConfirmCode(""); setResults(null); setDeleteErrors([]); }}
          className="px-8"
        >
          <Trash2 className="w-5 h-5 mr-2" />
          Delete Selected Data ({selected.size} {selected.size === 1 ? "category" : "categories"})
        </Button>
      </div>

      {/* Results */}
      {results && (
        <Card className="p-4 border-green-300 bg-green-50">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-green-800">Reset Complete</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(results).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-[10px]">{value}</Badge>
                <span className="text-gray-600">{key.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
          {deleteErrors.length > 0 && (
            <div className="mt-3 p-2 bg-red-100 rounded">
              <div className="flex items-center gap-1 text-red-700 text-sm font-medium mb-1">
                <XCircle className="w-4 h-4" /> Errors:
              </div>
              {deleteErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Confirm Data Deletion
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete data from <strong>{selected.size}</strong> categories.
              This action <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-2">Selected for deletion:</p>
              <div className="flex flex-wrap gap-1">
                {Array.from(selected).map(id => {
                  const cat = RESET_CATEGORIES.find(c => c.id === id);
                  return (
                    <Badge key={id} className="bg-red-100 text-red-700 text-[10px]">
                      {cat?.label || id}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">
                Type <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-red-600 font-bold">DELETE-ALL-DATA</code> to confirm:
              </p>
              <Input
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="DELETE-ALL-DATA"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={confirmCode !== "DELETE-ALL-DATA" || deleting}
            >
              {deleting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete Forever
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}