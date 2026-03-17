import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Baby, Plus, Pencil, Trash2, ImageIcon } from "lucide-react";
import { formatIDR } from "../lib/currency";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { MenuImageUpload } from "./MenuImageUpload";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface KidsMenuItem {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  image: string;
  originalPrice: number;
  discountPercentage: number;
  finalPrice: number;
  badgeText: string;
  enabled: boolean;
  displayOrder: number;
}

interface Props {
  customToken: string;
}

export function KidsMenuAdmin({ customToken }: Props) {
  const [items, setItems] = useState<KidsMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KidsMenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    subtitle: "",
    description: "",
    image: "",
    originalPrice: "",
    discountPercentage: "",
    badgeText: "",
    enabled: true,
    displayOrder: 1,
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/kids-menu`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      } else {
        toast.error("Failed to load Kids Menu items");
      }
    } catch (error) {
      console.error("Error fetching Kids Menu items:", error);
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      subtitle: "",
      description: "",
      image: "",
      originalPrice: "",
      discountPercentage: "",
      badgeText: "",
      enabled: true,
      displayOrder: items.length + 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: KidsMenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      subtitle: item.subtitle,
      description: item.description,
      image: item.image,
      originalPrice: item.originalPrice.toString(),
      discountPercentage: item.discountPercentage.toString(),
      badgeText: item.badgeText,
      enabled: item.enabled,
      displayOrder: item.displayOrder,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.originalPrice) {
      toast.error("Name and original price are required");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: formData.name,
        subtitle: formData.subtitle,
        description: formData.description,
        image: formData.image,
        originalPrice: parseFloat(formData.originalPrice),
        discountPercentage: parseFloat(formData.discountPercentage || "0"),
        badgeText: formData.badgeText || `KIDS ${formData.discountPercentage}% OFF`,
        enabled: formData.enabled,
        displayOrder: formData.displayOrder,
      };

      const url = editingItem
        ? `${API_BASE}/admin/kids-menu/${editingItem.id}`
        : `${API_BASE}/admin/kids-menu`;

      const response = await fetch(url, {
        method: editingItem ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success(editingItem ? "Item updated successfully" : "Item created successfully");
        setDialogOpen(false);
        fetchItems();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save item");
      }
    } catch (error) {
      console.error("Error saving item:", error);
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      const response = await fetch(`${API_BASE}/admin/kids-menu/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        toast.success("Item deleted successfully");
        fetchItems();
      } else {
        toast.error("Failed to delete item");
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete item");
    }
  };

  const handleToggleEnabled = async (item: KidsMenuItem) => {
    try {
      const response = await fetch(`${API_BASE}/admin/kids-menu/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          ...item,
          enabled: !item.enabled,
        }),
      });

      if (response.ok) {
        toast.success(item.enabled ? "Item disabled" : "Item enabled");
        fetchItems();
      } else {
        toast.error("Failed to update item");
      }
    } catch (error) {
      console.error("Error toggling item:", error);
      toast.error("Failed to update item");
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Loading Kids Menu items...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Baby className="w-5 h-5" style={{ color: APP_CONFIG.brand.primaryColor }} />
          <h2 className="text-xl font-semibold">Kids Menu Management</h2>
        </div>
        <Button onClick={openCreateDialog} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No Kids Menu items yet</p>
          <Button onClick={openCreateDialog} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create First Item
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex gap-4">
                {/* Image */}
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      {item.subtitle && (
                        <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={item.enabled ? "default" : "secondary"}>
                        {item.enabled ? "Active" : "Disabled"}
                      </Badge>
                      {item.badgeText && (
                        <Badge variant="outline" className="bg-pink-50">
                          {item.badgeText}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>

                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm text-gray-500 line-through">
                        {formatIDR(item.originalPrice)}
                      </span>
                      <span className="ml-2 text-lg font-bold" style={{ color: APP_CONFIG.brand.primaryColor }}>
                        {formatIDR(item.finalPrice)}
                      </span>
                      <span className="ml-2 text-sm text-green-600">
                        {item.discountPercentage}% OFF
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={() => handleToggleEnabled(item)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <div className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(item)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit" : "Create"} Kids Menu Item</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the item details below" : "Add a new item to Kids Menu"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mini Chicken Tikka"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="e.g., Perfect for kids"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the item..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <MenuImageUpload
                value={formData.image}
                onChange={(url) => setFormData({ ...formData, image: url })}
                customToken={customToken}
                label="Dish Image"
                context="Kids Menu Card"
                recommendedSize="800 x 600 px"
                aspectRatio="4:3"
                maxSizeMB={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="originalPrice">Original Price (Rp) *</Label>
                <Input
                  id="originalPrice"
                  type="number"
                  value={formData.originalPrice}
                  onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                  placeholder="50000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountPercentage">Discount %</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={formData.discountPercentage}
                  onChange={(e) => setFormData({ ...formData, discountPercentage: e.target.value })}
                  placeholder="20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="badgeText">Badge Text</Label>
              <Input
                id="badgeText"
                value={formData.badgeText}
                onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                placeholder="e.g., KIDS SPECIAL"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayOrder">Display Order</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center space-x-2 pt-8">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
                <Label htmlFor="enabled">Enable this item</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default KidsMenuAdmin;