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
import { Gift, Plus, Pencil, Trash2, Ticket, Car, UtensilsCrossed, Award, Users, Search, X, Eye, UserPlus, Crown, Percent, DollarSign, Truck as TruckIcon, Tag, ChefHat, Check } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { formatIDR } from "../lib/currency";

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
  targetType: "all" | "tier" | "specific";
  targetTier?: string;
  targetPhones?: string[];
  discountType?: "percentage" | "fixed" | "free_delivery" | "freebie";
  discountValue?: number;
  minOrderAmount?: number;
  applicableCategories?: string[];
  applicableItemIds?: string[];
  isActive?: boolean;
  createdAt?: string;
  assignedCount?: number;
  usedCount?: number;
  claimedCount?: number;
  totalIndividualUses?: number;
}

interface UserInfo {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: string;
}

interface Assignment {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userTier: string;
  claimed: boolean;
  used: boolean;
  assignedAt: string;
  claimedAt?: string;
  usedAt?: string;
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

const TIER_OPTIONS = ["Silver", "Gold", "Diamond", "Platinum"];
const TIER_COLORS: Record<string, string> = {
  Silver: "#9CA3AF",
  Gold: "#FFC107",
  Diamond: "#00BCD4",
  Platinum: "#9C27B0",
};

const DISCOUNT_TYPE_OPTIONS = [
  { value: "percentage", label: "% Discount", icon: Percent },
  { value: "fixed", label: "Fixed Amount", icon: DollarSign },
  { value: "free_delivery", label: "Free Delivery", icon: TruckIcon },
  { value: "freebie", label: "Free Item", icon: Gift },
];

export function VouchersAdmin({ customToken }: VouchersAdminProps) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
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
  const [targetType, setTargetType] = useState<"all" | "tier" | "specific">("all");
  const [targetTier, setTargetTier] = useState("Silver");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("");

  // Menu/category restrictions
  const [applicableCategories, setApplicableCategories] = useState<string[]>([]);
  const [menuCategories, setMenuCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Specific user targeting
  const [targetPhones, setTargetPhones] = useState<string[]>([]);
  const [phoneInput, setPhoneInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Assign voucher fields
  const [assignPhoneNumber, setAssignPhoneNumber] = useState("");
  const [assignTier, setAssignTier] = useState("Silver");
  const [assignMode, setAssignMode] = useState<"phone" | "tier">("phone");

  // View assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const response = await fetchWithRetry(`${API_BASE}/admin/vouchers`, {
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

  const fetchUsers = async () => {
    if (allUsers.length > 0) return; // Cache
    try {
      setLoadingUsers(true);
      const response = await fetchWithRetry(`${API_BASE}/admin/users-list`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchMenuCategories = async () => {
    if (menuCategories.length > 0) return; // Cache
    try {
      setLoadingCategories(true);
      const response = await fetchWithRetry(`${API_BASE}/regular-menu/categories`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMenuCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Error fetching menu categories:", error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchAssignments = async (voucherId: string) => {
    try {
      setLoadingAssignments(true);
      const response = await fetchWithRetry(`${API_BASE}/admin/vouchers/${voucherId}/assignments`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAssignments(data.assignments || []);
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoadingAssignments(false);
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
      setTargetType(voucher.targetType || "all");
      setTargetTier(voucher.targetTier || "Silver");
      setTargetPhones(voucher.targetPhones || []);
      setDiscountType(voucher.discountType || "percentage");
      setDiscountValue(voucher.discountValue?.toString() || "");
      setMinOrderAmount(voucher.minOrderAmount?.toString() || "");
      setApplicableCategories(voucher.applicableCategories || []);
    } else {
      setCurrentVoucher(null);
      setTitle("");
      setDescription("");
      setExpiryDate("");
      setQuantity("1");
      setVoucherType("discount");
      setIcon("ticket");
      setConditions("");
      setTargetType("all");
      setTargetTier("Silver");
      setTargetPhones([]);
      setDiscountType("percentage");
      setDiscountValue("");
      setMinOrderAmount("");
      setApplicableCategories([]);
    }
    fetchUsers();
    fetchMenuCategories();
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
        targetType,
        targetTier: targetType === "tier" ? targetTier : null,
        targetPhones: targetType === "specific" ? targetPhones : [],
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        minOrderAmount: parseFloat(minOrderAmount) || 0,
        applicableCategories,
      };

      const url = currentVoucher
        ? `${API_BASE}/admin/vouchers/${currentVoucher.id}`
        : `${API_BASE}/admin/vouchers`;

      const response = await fetchWithRetry(url, {
        method: currentVoucher ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(voucherData),
      });

      if (response.ok) {
        const data = await response.json();
        const msg = currentVoucher
          ? "Voucher updated!"
          : `Voucher created! Assigned to ${data.assignedCount || 0} users.`;
        toast.success(msg);
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
      const response = await fetchWithRetry(`${API_BASE}/admin/vouchers/${currentVoucher.id}`, {
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
    setAssignPhoneNumber("");
    setAssignTier("Silver");
    setAssignMode("phone");
    setAssignDialog(true);
  };

  const openViewDialog = (voucher: Voucher) => {
    setCurrentVoucher(voucher);
    fetchAssignments(voucher.id);
    setViewDialog(true);
  };

  const handleAssignVoucher = async () => {
    if (!currentVoucher) return;

    if (assignMode === "phone") {
      if (!assignPhoneNumber) {
        toast.error("Please enter a phone number");
        return;
      }
      try {
        setAssigning(true);
        const response = await fetchWithRetry(`${API_BASE}/admin/vouchers/${currentVoucher.id}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({ phoneNumber: assignPhoneNumber }),
        });

        if (response.ok) {
          toast.success("Voucher assigned to user!");
          setAssignDialog(false);
          fetchVouchers();
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
    } else {
      // Bulk tier assignment
      try {
        setAssigning(true);
        const response = await fetchWithRetry(`${API_BASE}/admin/vouchers/${currentVoucher.id}/assign-tier`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({ tier: assignTier }),
        });

        if (response.ok) {
          const data = await response.json();
          toast.success(`Voucher assigned to ${data.assignedCount} ${assignTier} members!`);
          setAssignDialog(false);
          fetchVouchers();
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
    }
  };

  const addTargetPhone = (phone: string) => {
    const trimmed = phone.trim();
    if (trimmed && !targetPhones.includes(trimmed)) {
      setTargetPhones([...targetPhones, trimmed]);
    }
    setPhoneInput("");
    setUserSearch("");
  };

  const removeTargetPhone = (phone: string) => {
    setTargetPhones(targetPhones.filter((p) => p !== phone));
  };

  const getIconComponent = (iconName: string, size = "w-5 h-5") => {
    const option = ICON_OPTIONS.find((opt) => opt.value === iconName);
    const IconComponent = option?.icon || Gift;
    return <IconComponent className={size} />;
  };

  const getTargetLabel = (voucher: Voucher) => {
    if (voucher.targetType === "all") return "All Customers";
    if (voucher.targetType === "tier") return `${voucher.targetTier} Members`;
    if (voucher.targetType === "specific") return `${voucher.targetPhones?.length || 0} Specific Users`;
    return "All Customers";
  };

  const getTargetColor = (voucher: Voucher) => {
    if (voucher.targetType === "tier" && voucher.targetTier) return TIER_COLORS[voucher.targetTier] || "#9CA3AF";
    if (voucher.targetType === "specific") return BRAND;
    return "#6B7280";
  };

  const getDiscountLabel = (voucher: Voucher) => {
    if (voucher.discountType === "percentage" && voucher.discountValue) return `${voucher.discountValue}% off`;
    if (voucher.discountType === "fixed" && voucher.discountValue) return `${formatIDR(voucher.discountValue)} off`;
    if (voucher.discountType === "free_delivery") return "Free delivery";
    if (voucher.discountType === "freebie") return "Free item";
    return "";
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      !targetPhones.includes(u.phone) &&
      (userSearch === "" ||
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.phone.includes(userSearch))
  );

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Loading vouchers...</p>
      </Card>
    );
  }

  const BRAND = APP_CONFIG.brand.primaryColor;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Vouchers Management</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage vouchers with targeting
          </p>
        </div>
        <Button onClick={() => openEditDialog()} style={{ backgroundColor: BRAND }}>
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
                      style={{ backgroundColor: BRAND, color: "#FFFFFF" }}
                    >
                      {getIconComponent(voucher.icon)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{voucher.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {voucher.quantity > 1 && (
                          <Badge variant="outline" className="text-xs">x{voucher.quantity}</Badge>
                        )}
                        {getDiscountLabel(voucher) && (
                          <Badge
                            className="text-xs text-white"
                            style={{ backgroundColor: BRAND }}
                          >
                            {getDiscountLabel(voucher)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {voucher.description && (
                  <p className="text-sm text-muted-foreground">{voucher.description}</p>
                )}

                {/* Target Badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: getTargetColor(voucher), color: getTargetColor(voucher) }}
                  >
                    {voucher.targetType === "all" && <Users className="w-3 h-3 mr-1" />}
                    {voucher.targetType === "tier" && <Crown className="w-3 h-3 mr-1" />}
                    {voucher.targetType === "specific" && <UserPlus className="w-3 h-3 mr-1" />}
                    {getTargetLabel(voucher)}
                  </Badge>
                  {voucher.minOrderAmount ? (
                    <Badge variant="outline" className="text-xs text-gray-500">
                      Min. {formatIDR(voucher.minOrderAmount)}
                    </Badge>
                  ) : null}
                  {voucher.applicableCategories && voucher.applicableCategories.length > 0 && (
                    <Badge variant="outline" className="text-xs" style={{ borderColor: "#8B5CF6", color: "#8B5CF6" }}>
                      <ChefHat className="w-3 h-3 mr-1" />
                      {voucher.applicableCategories.length} {voucher.applicableCategories.length === 1 ? "category" : "categories"}
                    </Badge>
                  )}
                </div>

                {/* Applicable Categories Detail */}
                {voucher.applicableCategories && voucher.applicableCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {voucher.applicableCategories.map((cat) => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{voucher.assignedCount || 0} assigned</span>
                  <span>{voucher.claimedCount || 0} claimed</span>
                  <span>{voucher.usedCount || 0}/{voucher.assignedCount || 0} fully used</span>
                  {(voucher.totalIndividualUses || 0) > 0 && (
                    <span className="text-blue-600 font-medium">{voucher.totalIndividualUses} total uses</span>
                  )}
                </div>

                <div className="text-sm space-y-1">
                  <p>
                    <span className="font-medium">Expires:</span>{" "}
                    <span style={{ color: BRAND }}>{voucher.expiryDate}</span>
                  </p>
                  {voucher.conditions && (
                    <p className="text-xs text-muted-foreground">{voucher.conditions}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openViewDialog(voucher)}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAssignDialog(voucher)}
                    className="flex-1"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(voucher)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openDeleteDialog(voucher)}>
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
            <DialogDescription>Fill in the voucher details below</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div>
              <Label htmlFor="title">Voucher Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 10% Off First Order"
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

            {/* Discount Type & Value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount Type</Label>
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false}>
                    {DISCOUNT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="discountValue">
                  {discountType === "percentage" ? "Discount %" : discountType === "fixed" ? "Amount (IDR)" : "Value"}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percentage" ? "e.g., 10" : "e.g., 25000"}
                  disabled={discountType === "free_delivery"}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="minOrderAmount">Minimum Order Amount (IDR)</Label>
              <Input
                id="minOrderAmount"
                type="number"
                min="0"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                placeholder="e.g., 100000 (0 = no minimum)"
              />
            </div>

            {/* Applicable Menu Categories */}
            <div>
              <Label className="flex items-center gap-2">
                <ChefHat className="w-4 h-4" />
                Applicable Menu Categories
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Leave empty to apply to all menu items. Select specific categories to restrict this voucher.
              </p>
              {loadingCategories ? (
                <p className="text-xs text-muted-foreground">Loading categories...</p>
              ) : menuCategories.length === 0 ? (
                <p className="text-xs text-amber-600">No menu categories found. Seed the menu first.</p>
              ) : (
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  {/* All Categories toggle */}
                  <button
                    type="button"
                    onClick={() => setApplicableCategories([])}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      applicableCategories.length === 0
                        ? "bg-pink-50 text-pink-700 font-semibold"
                        : "hover:bg-gray-50 text-gray-600"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      applicableCategories.length === 0
                        ? "bg-pink-600 border-pink-600"
                        : "border-gray-300"
                    }`}>
                      {applicableCategories.length === 0 && <Check className="w-3 h-3 text-white" />}
                    </div>
                    All Menu Items
                  </button>
                  <div className="border-t my-1" />
                  {menuCategories.map((cat) => {
                    const isSelected = applicableCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setApplicableCategories(applicableCategories.filter(c => c !== cat));
                          } else {
                            setApplicableCategories([...applicableCategories, cat]);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                          isSelected
                            ? "bg-pink-50 text-pink-700 font-medium"
                            : "hover:bg-gray-50 text-gray-600"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "bg-pink-600 border-pink-600"
                            : "border-gray-300"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
              {applicableCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {applicableCategories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-red-50"
                      style={{ borderColor: BRAND, color: BRAND }}
                      onClick={() => setApplicableCategories(applicableCategories.filter(c => c !== cat))}
                    >
                      {cat} <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="icon">Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger id="icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false}>
                    {ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Uses per User</Label>
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
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="conditions">Conditions/Terms</Label>
              <Textarea
                id="conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="e.g., Valid for dine-in orders only"
                rows={2}
              />
            </div>

            {/* Targeting */}
            <div className="border-t pt-4">
              <Label className="text-base font-semibold flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" />
                Target Audience
              </Label>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setTargetType("all")}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    targetType === "all" ? "bg-pink-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={targetType === "all" ? { borderColor: BRAND } : {}}
                >
                  <Users className="w-5 h-5 mx-auto mb-1" style={{ color: targetType === "all" ? BRAND : "#6B7280" }} />
                  <p className="text-xs font-semibold" style={{ color: targetType === "all" ? BRAND : "#374151" }}>
                    All Customers
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("tier")}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    targetType === "tier" ? "bg-pink-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={targetType === "tier" ? { borderColor: BRAND } : {}}
                >
                  <Crown className="w-5 h-5 mx-auto mb-1" style={{ color: targetType === "tier" ? BRAND : "#6B7280" }} />
                  <p className="text-xs font-semibold" style={{ color: targetType === "tier" ? BRAND : "#374151" }}>
                    By Tier
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => { setTargetType("specific"); fetchUsers(); }}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    targetType === "specific" ? "bg-pink-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={targetType === "specific" ? { borderColor: BRAND } : {}}
                >
                  <UserPlus className="w-5 h-5 mx-auto mb-1" style={{ color: targetType === "specific" ? BRAND : "#6B7280" }} />
                  <p className="text-xs font-semibold" style={{ color: targetType === "specific" ? BRAND : "#374151" }}>
                    Specific Users
                  </p>
                </button>
              </div>

              {targetType === "tier" && (
                <div>
                  <Label>Select Tier</Label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {TIER_OPTIONS.map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setTargetTier(tier)}
                        className={`p-2 rounded-lg border-2 text-center transition-all ${
                          targetTier === tier ? "ring-2 ring-offset-1" : "border-gray-200"
                        }`}
                        style={{
                          borderColor: targetTier === tier ? TIER_COLORS[tier] : undefined,
                          backgroundColor: targetTier === tier ? `${TIER_COLORS[tier]}15` : undefined,
                          ringColor: TIER_COLORS[tier],
                        }}
                      >
                        <Award className="w-5 h-5 mx-auto mb-0.5" style={{ color: TIER_COLORS[tier] }} />
                        <p className="text-xs font-semibold" style={{ color: TIER_COLORS[tier] }}>
                          {tier}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {targetType === "specific" && (
                <div className="space-y-3">
                  {/* Selected phones */}
                  {targetPhones.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {targetPhones.map((phone) => {
                        const user = allUsers.find((u) => u.phone === phone);
                        return (
                          <Badge
                            key={phone}
                            variant="outline"
                            className="py-1 px-2 flex items-center gap-1"
                            style={{ borderColor: BRAND, color: BRAND }}
                          >
                            {user ? `${user.name} (${phone})` : phone}
                            <button type="button" onClick={() => removeTargetPhone(phone)}>
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Search/Add users */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search by name or phone..."
                      className="pl-9"
                    />
                  </div>

                  {/* Manual phone entry */}
                  <div className="flex gap-2">
                    <Input
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Or enter phone number manually"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addTargetPhone(phoneInput)}
                      disabled={!phoneInput.trim()}
                    >
                      Add
                    </Button>
                  </div>

                  {/* User list */}
                  {userSearch && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                      {loadingUsers ? (
                        <p className="text-xs text-center py-3 text-gray-400">Loading users...</p>
                      ) : filteredUsers.length === 0 ? (
                        <p className="text-xs text-center py-3 text-gray-400">No users found</p>
                      ) : (
                        filteredUsers.slice(0, 10).map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="w-full p-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            onClick={() => addTargetPhone(user.phone)}
                          >
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-gray-500">{user.phone}</p>
                            </div>
                            <Badge
                              className="text-xs text-white"
                              style={{ backgroundColor: TIER_COLORS[user.tier] || "#9CA3AF" }}
                            >
                              {user.tier}
                            </Badge>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }}>
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
              Are you sure you want to delete "{currentVoucher?.title}"? This will also remove all
              user assignments. This action cannot be undone.
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
            <DialogTitle>Assign Voucher</DialogTitle>
            <DialogDescription>
              Assign "{currentVoucher?.title}" to additional users
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAssignMode("phone")}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  assignMode === "phone" ? "bg-pink-50" : "border-gray-200"
                }`}
                style={assignMode === "phone" ? { borderColor: BRAND } : {}}
              >
                <UserPlus className="w-5 h-5 mx-auto mb-1" style={{ color: assignMode === "phone" ? BRAND : "#6B7280" }} />
                <p className="text-xs font-semibold">By Phone</p>
              </button>
              <button
                type="button"
                onClick={() => setAssignMode("tier")}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  assignMode === "tier" ? "bg-pink-50" : "border-gray-200"
                }`}
                style={assignMode === "tier" ? { borderColor: BRAND } : {}}
              >
                <Crown className="w-5 h-5 mx-auto mb-1" style={{ color: assignMode === "tier" ? BRAND : "#6B7280" }} />
                <p className="text-xs font-semibold">By Tier</p>
              </button>
            </div>

            {assignMode === "phone" ? (
              <div>
                <Label htmlFor="assignPhone">Phone Number</Label>
                <Input
                  id="assignPhone"
                  type="tel"
                  value={assignPhoneNumber}
                  onChange={(e) => setAssignPhoneNumber(e.target.value)}
                  placeholder="+628xxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the user's registered phone number
                </p>
              </div>
            ) : (
              <div>
                <Label>Select Tier</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setAssignTier(tier)}
                      className={`p-2 rounded-lg border-2 text-center transition-all ${
                        assignTier === tier ? "ring-2 ring-offset-1" : "border-gray-200"
                      }`}
                      style={{
                        borderColor: assignTier === tier ? TIER_COLORS[tier] : undefined,
                        backgroundColor: assignTier === tier ? `${TIER_COLORS[tier]}15` : undefined,
                      }}
                    >
                      <Award className="w-5 h-5 mx-auto mb-0.5" style={{ color: TIER_COLORS[tier] }} />
                      <p className="text-xs font-semibold" style={{ color: TIER_COLORS[tier] }}>
                        {tier}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This will assign the voucher to all {assignTier} members who don't already have it
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignVoucher} disabled={assigning} style={{ backgroundColor: BRAND }}>
              {assigning ? "Assigning..." : assignMode === "tier" ? `Assign to ${assignTier}` : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Assignments Dialog */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Voucher Assignments</DialogTitle>
            <DialogDescription>
              {currentVoucher?.title} &mdash; {assignments.length} assignment(s)
            </DialogDescription>
          </DialogHeader>

          {loadingAssignments ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No assignments yet</p>
          ) : (
            <div className="divide-y max-h-[50vh] overflow-y-auto">
              {assignments.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{a.userName}</p>
                    <p className="text-xs text-gray-500">{a.userPhone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-xs text-white"
                      style={{ backgroundColor: TIER_COLORS[a.userTier] || "#9CA3AF" }}
                    >
                      {a.userTier}
                    </Badge>
                    {(() => {
                      const maxUses = (a as any).voucher?.quantity || 1;
                      const usedCount = (a as any).usedCount || 0;
                      const isFullyUsed = a.used && usedCount >= maxUses;
                      if (isFullyUsed) {
                        return <Badge className="bg-green-500 text-white text-xs">Used {maxUses > 1 ? `${usedCount}/${maxUses}` : ''}</Badge>;
                      } else if (usedCount > 0 && usedCount < maxUses) {
                        return <Badge className="bg-amber-500 text-white text-xs">{usedCount}/{maxUses} used</Badge>;
                      } else if (a.claimed) {
                        return <Badge className="bg-blue-500 text-white text-xs">Claimed</Badge>;
                      } else {
                        return <Badge variant="outline" className="text-xs text-gray-500">Pending</Badge>;
                      }
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}