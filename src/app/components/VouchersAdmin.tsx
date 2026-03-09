import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Gift, Plus, Pencil, Trash2, Ticket, Car, UtensilsCrossed, Award, Users } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Voucher {
  id: string;
  title: string;
  description: string;
  expiryDate: string;
  quantity: number;
  type: string;
  icon: string;
  conditions: string;
  createdAt?: string;
}

interface VouchersAdminProps {
  customToken: string;
}

const ICON_OPTIONS = [
  { value: "ticket", label: "Ticket", icon: Ticket },
  { value: "car", label: "Car/Parking", icon: Car },
  { value: "utensils", label: "Utensils", icon: UtensilsCrossed },
  { value: "award", label: "Award", icon: Award },
  { value: "gift", label: "Gift", icon: Gift },
];

export function VouchersAdmin({ customToken }: VouchersAdminProps) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [currentVoucher, setCurrentVoucher] = useState<Voucher | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [voucherType, setVoucherType] = useState("discount");
  const [icon, setIcon] = useState("ticket");
  const [conditions, setConditions] = useState("");

  // Assign voucher fields
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/vouchers`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setVouchers(data.vouchers || []);
      } else {
        toast.error("Failed to load vouchers");
      }
    } catch (error) {
      console.error("Error fetching vouchers:", error);
      toast.error("Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (voucher?: Voucher) => {
    if (voucher) {
      setCurrentVoucher(voucher);
      setTitle(voucher.title);
      setDescription(voucher.description);
      setExpiryDate(voucher.expiryDate);
      setQuantity(voucher.quantity.toString());
      setVoucherType(voucher.type);
      setIcon(voucher.icon);
      setConditions(voucher.conditions);
    } else {
      setCurrentVoucher(null);
      setTitle("");
      setDescription("");
      setExpiryDate("");
      setQuantity("1");
      setVoucherType("discount");
      setIcon("ticket");
      setConditions("");
    }
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!title || !expiryDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      const voucherData = {
        title,
        description,
        expiryDate,
        quantity: parseInt(quantity),
        type: voucherType,
        icon,
        conditions,
      };

      const url = currentVoucher
        ? `${API_BASE}/admin/vouchers/${currentVoucher.id}`
        : `${API_BASE}/admin/vouchers`;

      const response = await fetch(url, {
        method: currentVoucher ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(voucherData),
      });

      if (response.ok) {
        toast.success(currentVoucher ? "Voucher updated!" : "Voucher created!");
        setEditDialog(false);
        fetchVouchers();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save voucher");
      }
    } catch (error) {
      console.error("Error saving voucher:", error);
      toast.error("Failed to save voucher");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentVoucher) return;

    try {
      setDeleting(true);
      const response = await fetch(`${API_BASE}/admin/vouchers/${currentVoucher.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        toast.success("Voucher deleted!");
        setDeleteDialog(false);
        fetchVouchers();
      } else {
        toast.error("Failed to delete voucher");
      }
    } catch (error) {
      console.error("Error deleting voucher:", error);
      toast.error("Failed to delete voucher");
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (voucher: Voucher) => {
    setCurrentVoucher(voucher);
    setDeleteDialog(true);
  };

  const openAssignDialog = (voucher: Voucher) => {
    setCurrentVoucher(voucher);
    setPhoneNumber("");
    setAssignDialog(true);
  };

  const handleAssignVoucher = async () => {
    if (!currentVoucher || !phoneNumber) {
      toast.error("Please enter a phone number");
      return;
    }

    try {
      setAssigning(true);
      const response = await fetch(`${API_BASE}/admin/vouchers/${currentVoucher.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({ phoneNumber }),
      });

      if (response.ok) {
        toast.success("Voucher assigned to user!");
        setAssignDialog(false);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to assign voucher");
      }
    } catch (error) {
      console.error("Error assigning voucher:", error);
      toast.error("Failed to assign voucher");
    } finally {
      setAssigning(false);
    }
  };

  const getIconComponent = (iconName: string) => {
    const option = ICON_OPTIONS.find(opt => opt.value === iconName);
    const IconComponent = option?.icon || Gift;
    return <IconComponent className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Loading vouchers...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Vouchers Management</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage vouchers for your customers
          </p>
        </div>
        <Button onClick={() => openEditDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Voucher
        </Button>
      </div>

      {vouchers.length === 0 ? (
        <Card className="p-8 text-center">
          <Gift className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No vouchers created yet</p>
          <Button onClick={() => openEditDialog()} className="mt-4" variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Voucher
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vouchers.map((voucher) => (
            <Card key={voucher.id} className="p-5 hover:shadow-lg transition-shadow">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "#D91A60", color: "#FFFFFF" }}
                    >
                      {getIconComponent(voucher.icon)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{voucher.title}</h3>
                      {voucher.quantity > 1 && (
                        <Badge variant="outline" className="mt-1">
                          x{voucher.quantity}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {voucher.description && (
                  <p className="text-sm text-muted-foreground">{voucher.description}</p>
                )}

                <div className="text-sm space-y-1">
                  <p>
                    <span className="font-medium">Expires:</span>{" "}
                    <span style={{ color: "#D91A60" }}>{voucher.expiryDate}</span>
                  </p>
                  {voucher.conditions && (
                    <p className="text-xs text-muted-foreground">{voucher.conditions}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAssignDialog(voucher)}
                    className="flex-1"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(voucher)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteDialog(voucher)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentVoucher ? "Edit Voucher" : "Create New Voucher"}</DialogTitle>
            <DialogDescription>
              Fill in the voucher details below
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Voucher Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 10% Off"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the voucher"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="icon">Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger id="icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((option) => {
                      const IconComponent = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <IconComponent className="w-4 h-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="expiryDate">Expiry Date *</Label>
              <Input
                id="expiryDate"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                placeholder="e.g., end of March"
              />
            </div>

            <div>
              <Label htmlFor="conditions">Conditions/Terms</Label>
              <Textarea
                id="conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="e.g., Can be claimed for dine-in only"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Discount</SelectItem>
                  <SelectItem value="parking">Parking</SelectItem>
                  <SelectItem value="freebie">Freebie</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voucher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentVoucher?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Voucher Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Voucher to User</DialogTitle>
            <DialogDescription>
              Enter the user's phone number (up to 12 digits) to assign "{currentVoucher?.title}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="08xxxxxxxxxx"
                maxLength={12}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter phone number (up to 12 digits, e.g., 081234567890)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignVoucher} disabled={assigning}>
              {assigning ? "Assigning..." : "Assign Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}