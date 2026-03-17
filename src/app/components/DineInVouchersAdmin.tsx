/**
 * DineInVouchersAdmin — Admin panel for managing dine-in vouchers.
 * Create, edit, toggle, delete dine-in vouchers with redemption tracking.
 */
import { useState, useEffect } from "react";
import { APP_CONFIG } from "../lib/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Pencil, Trash2, Ticket, Users, Percent, DollarSign, Eye, Copy, Power, Loader2, Clock, CheckCircle, XCircle, User, Hash } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface DineInVoucher {
  id: string;
  title: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount: number;
  expiryDate: string | null;
  maxRedemptions: number;
  assignmentType: "all" | "specific" | "bulk";
  code: string;
  isActive: boolean;
  createdAt: string;
  totalRedemptions: number;
  redemptions: any[];
}

interface Redemption {
  assignmentId: string;
  userId: string;
  redeemedAt: string;
  redeemedBy: string;
  customerName: string;
  customerPhone: string;
}

interface DineInVouchersAdminProps {
  customToken: string;
}

export function DineInVouchersAdmin({ customToken }: DineInVouchersAdminProps) {
  const [vouchers, setVouchers] = useState<DineInVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<DineInVoucher | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRedemptions, setShowRedemptions] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loadingRedemptions, setLoadingRedemptions] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formMinOrder, setFormMinOrder] = useState("");
  const [formExpiry, setFormExpiry] = useState("");
  const [formMaxRedemptions, setFormMaxRedemptions] = useState("1");
  const [formAssignmentType, setFormAssignmentType] = useState<"all" | "specific" | "bulk">("all");
  const [formTargetPhones, setFormTargetPhones] = useState("");
  const [formCode, setFormCode] = useState("");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.vouchers || []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to load dine-in vouchers");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load dine-in vouchers");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormDiscountType("percentage");
    setFormDiscountValue("");
    setFormMinOrder("");
    setFormExpiry("");
    setFormMaxRedemptions("1");
    setFormAssignmentType("all");
    setFormTargetPhones("");
    setFormCode("");
    setEditingVoucher(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (v: DineInVoucher) => {
    setEditingVoucher(v);
    setFormTitle(v.title);
    setFormDescription(v.description);
    setFormDiscountType(v.discountType);
    setFormDiscountValue(v.discountValue.toString());
    setFormMinOrder(v.minOrderAmount ? v.minOrderAmount.toString() : "");
    setFormExpiry(v.expiryDate || "");
    setFormMaxRedemptions(v.maxRedemptions.toString());
    setFormAssignmentType(v.assignmentType);
    setFormCode(v.code);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formDiscountValue) {
      toast.error("Title and discount value are required");
      return;
    }
    try {
      setSaving(true);
      const payload: any = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        discountType: formDiscountType,
        discountValue: Number(formDiscountValue),
        minOrderAmount: formMinOrder ? Number(formMinOrder) : 0,
        expiryDate: formExpiry || null,
        maxRedemptions: Number(formMaxRedemptions) || 1,
        assignmentType: formAssignmentType,
        code: formCode.trim() || undefined,
      };

      if (formAssignmentType === "specific" && formTargetPhones.trim()) {
        payload.targetPhones = formTargetPhones.split(",").map((p: string) => p.trim()).filter(Boolean);
      }

      if (editingVoucher) {
        const res = await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers/${editingVoucher.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Voucher updated");
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Failed to update");
          return;
        }
      } else {
        const res = await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Dine-in voucher created!");
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Failed to create");
          return;
        }
      }

      setShowForm(false);
      resetForm();
      fetchVouchers();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (v: DineInVoucher) => {
    try {
      await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers/${v.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ isActive: !v.isActive }),
      });
      toast.success(v.isActive ? "Voucher deactivated" : "Voucher activated");
      fetchVouchers();
    } catch (e: any) {
      toast.error("Failed to toggle");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this dine-in voucher?")) return;
    try {
      setDeletingId(id);
      const res = await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers/${id}`, { method: "DELETE", headers });
      if (res.ok) {
        toast.success("Voucher deleted");
        fetchVouchers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to delete");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const viewRedemptions = async (voucherId: string) => {
    try {
      setShowRedemptions(voucherId);
      setLoadingRedemptions(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/dinein-vouchers/${voucherId}/redemptions`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRedemptions(data.redemptions || []);
      }
    } catch (e) {
      toast.error("Failed to load redemptions");
    } finally {
      setLoadingRedemptions(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Code "${code}" copied!`);
  };

  const isExpired = (date: string | null) => date ? new Date(date) < new Date() : false;

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
        <p className="text-sm text-muted-foreground">Loading dine-in vouchers...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
              <Ticket className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            Dine-In Vouchers
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create vouchers for in-store dining discounts. Customers show QR code, staff redeems.
          </p>
        </div>
        <Button onClick={openCreateForm} size="sm" style={{ backgroundColor: BRAND }} className="text-white">
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold" style={{ color: BRAND }}>{vouchers.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{vouchers.filter(v => v.isActive).length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{vouchers.reduce((sum, v) => sum + (v.totalRedemptions || 0), 0)}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Redeemed</p>
        </Card>
      </div>

      {/* Voucher List */}
      {vouchers.length === 0 ? (
        <Card className="p-8 text-center">
          <Ticket className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-muted-foreground">No dine-in vouchers yet</p>
          <Button onClick={openCreateForm} size="sm" variant="outline" className="mt-3">
            <Plus className="w-4 h-4 mr-1" /> Create Your First
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {vouchers.map((v) => (
            <Card key={v.id} className={`p-4 ${!v.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{v.title}</h3>
                    <Badge variant={v.isActive ? "default" : "secondary"} className={`text-[10px] ${v.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {v.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {v.expiryDate && isExpired(v.expiryDate) && (
                      <Badge className="text-[10px] bg-red-100 text-red-700">Expired</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {v.assignmentType === "all" ? "All Customers" : v.assignmentType === "specific" ? "Specific" : "Bulk Code"}
                    </Badge>
                  </div>
                  {v.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                  )}
                </div>
              </div>

              {/* Discount & Code */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: `${BRAND}10` }}>
                  {v.discountType === "percentage" ? (
                    <Percent className="w-3.5 h-3.5" style={{ color: BRAND }} />
                  ) : (
                    <DollarSign className="w-3.5 h-3.5" style={{ color: BRAND }} />
                  )}
                  <span className="text-sm font-bold" style={{ color: BRAND }}>
                    {v.discountType === "percentage" ? `${v.discountValue}% OFF` : formatIDR(v.discountValue)}
                  </span>
                </div>

                <button
                  onClick={() => copyCode(v.code)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <Hash className="w-3 h-3 text-gray-500" />
                  <span className="text-xs font-mono font-semibold text-gray-700">{v.code}</span>
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
              </div>

              {/* Meta info */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap mb-2">
                {v.minOrderAmount > 0 && (
                  <span>Min: {formatIDR(v.minOrderAmount)}</span>
                )}
                {v.expiryDate && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(v.expiryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <span className="flex items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  {v.totalRedemptions || 0} redeemed
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 border-t pt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEditForm(v)}>
                  <Pencil className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleActive(v)}>
                  <Power className="w-3 h-3 mr-1" /> {v.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => viewRedemptions(v.id)}>
                  <Eye className="w-3 h-3 mr-1" /> History
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-600 hover:text-red-700 ml-auto"
                  onClick={() => handleDelete(v.id)}
                  disabled={deletingId === v.id}
                >
                  {deletingId === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVoucher ? "Edit Dine-In Voucher" : "Create Dine-In Voucher"}</DialogTitle>
            <DialogDescription>
              {editingVoucher ? "Update voucher details" : "Create a new voucher for dine-in customers"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g., 20% Off Dine-In" />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Voucher details..." rows={2} className="resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Type *</Label>
                <Select value={formDiscountType} onValueChange={(v: any) => setFormDiscountType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (Rp)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Value *</Label>
                <Input type="number" value={formDiscountValue} onChange={e => setFormDiscountValue(e.target.value)} placeholder={formDiscountType === "percentage" ? "e.g., 20" : "e.g., 50000"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min Order Amount</Label>
                <Input type="number" value={formMinOrder} onChange={e => setFormMinOrder(e.target.value)} placeholder="0 (no min)" />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)} />
              </div>
            </div>

            {!editingVoucher && (
              <>
                <div>
                  <Label>Voucher Code (auto-generated if empty)</Label>
                  <Input value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} placeholder="e.g., DINE20" className="font-mono" />
                </div>

                <div>
                  <Label>Assignment Type</Label>
                  <Select value={formAssignmentType} onValueChange={(v: any) => setFormAssignmentType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      <SelectItem value="specific">Specific Customers</SelectItem>
                      <SelectItem value="bulk">Bulk Code (Claimable)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formAssignmentType === "all" && "Auto-assigned to all registered customers"}
                    {formAssignmentType === "specific" && "Only assigned to customers with matching phone numbers"}
                    {formAssignmentType === "bulk" && "Customers enter the code to claim the voucher"}
                  </p>
                </div>

                {formAssignmentType === "specific" && (
                  <div>
                    <Label>Target Phone Numbers (comma-separated)</Label>
                    <Textarea value={formTargetPhones} onChange={e => setFormTargetPhones(e.target.value)} placeholder="+628123456789, +628987654321" rows={2} className="resize-none font-mono text-xs" />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }} className="text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editingVoucher ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redemption History Dialog */}
      <Dialog open={!!showRedemptions} onOpenChange={(open) => { if (!open) setShowRedemptions(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redemption History</DialogTitle>
            <DialogDescription>
              {vouchers.find(v => v.id === showRedemptions)?.title || "Voucher"} — all redemptions
            </DialogDescription>
          </DialogHeader>

          {loadingRedemptions ? (
            <div className="text-center py-6">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          ) : redemptions.length === 0 ? (
            <div className="text-center py-6">
              <Ticket className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-muted-foreground">No redemptions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {redemptions.map((r, idx) => (
                <Card key={idx} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-sm font-medium">{r.customerName}</span>
                    <span className="text-xs text-muted-foreground">{r.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      Redeemed by {r.redeemedBy}
                    </span>
                    <span>
                      {new Date(r.redeemedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
