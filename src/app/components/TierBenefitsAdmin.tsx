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
import { Award, Plus, Pencil, Trash2, Ticket, Car, UtensilsCrossed, Gift } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const BRAND = APP_CONFIG.brand.primaryColor;

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface TierBenefit {
  id: string;
  tier: string;
  icon: string;
  title: string;
  description: string;
  quantity: string;
  expiryDate: string;
  conditions: string;
  createdAt?: string;
}

interface TierBenefitsAdminProps {
  customToken: string;
}

const TIER_OPTIONS = [
  { value: "Gold", label: "Gold", color: "#FFC107" },
  { value: "Diamond", label: "Diamond", color: "#00BCD4" },
  { value: "Platinum", label: "Platinum", color: "#9C27B0" },
];

const ICON_OPTIONS = [
  { value: "ticket", label: "Discount", icon: Ticket },
  { value: "car", label: "Parking", icon: Car },
  { value: "utensils", label: "Appetizers", icon: UtensilsCrossed },
  { value: "award", label: "Award", icon: Award },
  { value: "gift", label: "Gift", icon: Gift },
];

export function TierBenefitsAdmin({ customToken }: TierBenefitsAdminProps) {
  const [benefits, setBenefits] = useState<TierBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [currentBenefit, setCurrentBenefit] = useState<TierBenefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [tier, setTier] = useState("Gold");
  const [icon, setIcon] = useState("ticket");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [conditions, setConditions] = useState("");

  useEffect(() => {
    fetchBenefits();
  }, []);

  const fetchBenefits = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/tier-benefits`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBenefits(data.benefits || []);
      } else {
        toast.error("Failed to load tier benefits");
      }
    } catch (error) {
      console.error("Error fetching tier benefits:", error);
      toast.error("Failed to load tier benefits");
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (benefit?: TierBenefit) => {
    if (benefit) {
      setCurrentBenefit(benefit);
      setTier(benefit.tier);
      setIcon(benefit.icon);
      setTitle(benefit.title);
      setDescription(benefit.description);
      setQuantity(benefit.quantity);
      setExpiryDate(benefit.expiryDate);
      setConditions(benefit.conditions);
    } else {
      setCurrentBenefit(null);
      setTier("Gold");
      setIcon("ticket");
      setTitle("");
      setDescription("");
      setQuantity("");
      setExpiryDate("");
      setConditions("");
    }
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!tier || !title) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      const benefitData = {
        tier,
        icon,
        title,
        description,
        quantity,
        expiryDate,
        conditions,
      };

      const url = currentBenefit
        ? `${API_BASE}/admin/tier-benefits/${currentBenefit.id}`
        : `${API_BASE}/admin/tier-benefits`;

      const response = await fetch(url, {
        method: currentBenefit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(benefitData),
      });

      if (response.ok) {
        toast.success(currentBenefit ? "Benefit updated!" : "Benefit created!");
        setEditDialog(false);
        fetchBenefits();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save benefit");
      }
    } catch (error) {
      console.error("Error saving benefit:", error);
      toast.error("Failed to save benefit");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentBenefit) return;

    try {
      setDeleting(true);
      const response = await fetch(`${API_BASE}/admin/tier-benefits/${currentBenefit.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        toast.success("Benefit deleted!");
        setDeleteDialog(false);
        fetchBenefits();
      } else {
        toast.error("Failed to delete benefit");
      }
    } catch (error) {
      console.error("Error deleting benefit:", error);
      toast.error("Failed to delete benefit");
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (benefit: TierBenefit) => {
    setCurrentBenefit(benefit);
    setDeleteDialog(true);
  };

  const getIconComponent = (iconName: string) => {
    const option = ICON_OPTIONS.find(opt => opt.value === iconName);
    const IconComponent = option?.icon || Award;
    return <IconComponent className="w-5 h-5" />;
  };

  const getTierColor = (tierName: string) => {
    const tier = TIER_OPTIONS.find(t => t.value === tierName);
    return tier?.color || "#9CA3AF";
  };

  // Group benefits by tier
  const goldBenefits = benefits.filter(b => b.tier === "Gold");
  const diamondBenefits = benefits.filter(b => b.tier === "Diamond");
  const platinumBenefits = benefits.filter(b => b.tier === "Platinum");

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Loading tier benefits...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Tier Benefits Management</h2>
          <p className="text-sm text-muted-foreground">
            Configure benefits for Gold, Diamond, and Platinum tier members
          </p>
        </div>
        <Button onClick={() => openEditDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Benefit
        </Button>
      </div>

      {benefits.length === 0 ? (
        <Card className="p-8 text-center">
          <Award className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No tier benefits created yet</p>
          <Button onClick={() => openEditDialog()} className="mt-4" variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Benefit
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Gold Benefits */}
          <div>
            <div 
              className="p-3 rounded-t-lg text-center font-bold text-white mb-3"
              style={{ backgroundColor: getTierColor("Gold") }}
            >
              <Award className="w-5 h-5 inline-block mr-2" />
              Gold Member Benefits
            </div>
            <div className="space-y-3">
              {goldBenefits.length === 0 ? (
                <Card className="p-4 text-center text-sm text-muted-foreground">
                  No benefits yet
                </Card>
              ) : (
                goldBenefits.map((benefit) => (
                  <Card key={benefit.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: getTierColor("Gold") + "30", color: getTierColor("Gold") }}
                          >
                            {getIconComponent(benefit.icon)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{benefit.title}</h4>
                            {benefit.quantity && (
                              <p className="text-xs text-muted-foreground">{benefit.quantity}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: BRAND }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      
                      {benefit.conditions && (
                        <p className="text-xs text-muted-foreground">{benefit.conditions}</p>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(benefit)}
                          className="flex-1"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDeleteDialog(benefit)}
                          className="flex-1"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Diamond Benefits */}
          <div>
            <div 
              className="p-3 rounded-t-lg text-center font-bold text-white mb-3"
              style={{ backgroundColor: getTierColor("Diamond") }}
            >
              <Award className="w-5 h-5 inline-block mr-2" />
              Diamond Member Benefits
            </div>
            <div className="space-y-3">
              {diamondBenefits.length === 0 ? (
                <Card className="p-4 text-center text-sm text-muted-foreground">
                  No benefits yet
                </Card>
              ) : (
                diamondBenefits.map((benefit) => (
                  <Card key={benefit.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: getTierColor("Diamond") + "30", color: getTierColor("Diamond") }}
                          >
                            {getIconComponent(benefit.icon)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{benefit.title}</h4>
                            {benefit.quantity && (
                              <p className="text-xs text-muted-foreground">{benefit.quantity}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: BRAND }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      
                      {benefit.conditions && (
                        <p className="text-xs text-muted-foreground">{benefit.conditions}</p>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(benefit)}
                          className="flex-1"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDeleteDialog(benefit)}
                          className="flex-1"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Platinum Benefits */}
          <div>
            <div 
              className="p-3 rounded-t-lg text-center font-bold text-white mb-3"
              style={{ backgroundColor: getTierColor("Platinum") }}
            >
              <Award className="w-5 h-5 inline-block mr-2" />
              Platinum Member Benefits
            </div>
            <div className="space-y-3">
              {platinumBenefits.length === 0 ? (
                <Card className="p-4 text-center text-sm text-muted-foreground">
                  No benefits yet
                </Card>
              ) : (
                platinumBenefits.map((benefit) => (
                  <Card key={benefit.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: getTierColor("Platinum") + "30", color: getTierColor("Platinum") }}
                          >
                            {getIconComponent(benefit.icon)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{benefit.title}</h4>
                            {benefit.quantity && (
                              <p className="text-xs text-muted-foreground">{benefit.quantity}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {benefit.expiryDate && (
                        <p className="text-xs" style={{ color: BRAND }}>
                          Expires by {benefit.expiryDate}
                        </p>
                      )}
                      
                      {benefit.conditions && (
                        <p className="text-xs text-muted-foreground">{benefit.conditions}</p>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(benefit)}
                          className="flex-1"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDeleteDialog(benefit)}
                          className="flex-1"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentBenefit ? "Edit Tier Benefit" : "Create New Tier Benefit"}</DialogTitle>
            <DialogDescription>
              Configure a benefit for a specific tier level
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tier">Tier Level *</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger id="tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: option.color }}
                          ></div>
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            <div>
              <Label htmlFor="title">Benefit Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 12% Discount"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="quantity">Quantity/Frequency</Label>
              <Input
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g., x5 or x10"
              />
            </div>

            <div>
              <Label htmlFor="expiryDate">Expiry Date</Label>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Benefit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tier Benefit</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentBenefit?.title}" for {currentBenefit?.tier} tier? 
              This action cannot be undone.
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
    </div>
  );
}