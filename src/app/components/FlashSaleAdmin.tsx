import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Zap, Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface FlashSaleItem {
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
  endTime?: string | null; // ISO timestamp for flash sale end
}

interface Props {
  customToken: string;
}

export function FlashSaleAdmin({ customToken }: Props) {
  const [items, setItems] = useState<FlashSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FlashSaleItem | null>(null);
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
    endTime: null as string | null,
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/flash-sale`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      } else {
        toast.error("Failed to load Flash Sale items");
      }
    } catch (error) {
      console.error("Error fetching Flash Sale items:", error);
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
      endTime: null,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: FlashSaleItem) => {
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
      endTime: item.endTime,
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
        badgeText: formData.badgeText || `FLASH ${formData.discountPercentage}% OFF`,
        enabled: formData.enabled,
        displayOrder: formData.displayOrder,
        endTime: formData.endTime,
      };

      const url = editingItem
        ? `${API_BASE}/admin/flash-sale/${editingItem.id}`
        : `${API_BASE}/admin/flash-sale`;

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
      const response = await fetch(`${API_BASE}/admin/flash-sale/${id}`, {
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

  const handleToggleEnabled = async (item: FlashSaleItem) => {
    try {
      const response = await fetch(`${API_BASE}/admin/flash-sale/${item.id}`, {
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
        <p className="text-muted-foreground">Loading Flash Sale items...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#D91A60]" />
          <h2 className="text-xl font-semibold">Flash Sale Management</h2>
        </div>
        <Button onClick={openCreateDialog} className="bg-[#D91A60] hover:bg-[#D91A60]/90">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No Flash Sale items yet</p>
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
                        <Badge variant="outline" className="bg-yellow-50">
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
                      <span className="ml-2 text-lg font-bold text-[#D91A60]">
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
            <DialogTitle>{editingItem ? "Edit" : "Create"} Flash Sale Item</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the item details below" : "Add a new item to Flash Sale"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Butter Chicken Flash Deal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="e.g., Limited time offer"
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
              <Label htmlFor="image">Image URL</Label>
              <Input
                id="image"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://example.com/image.jpg"
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
                  placeholder="100000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountPercentage">Discount %</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={formData.discountPercentage}
                  onChange={(e) => setFormData({ ...formData, discountPercentage: e.target.value })}
                  placeholder="50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="badgeText">Badge Text</Label>
              <Input
                id="badgeText"
                value={formData.badgeText}
                onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                placeholder="e.g., FLASH SALE"
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

            <div className="space-y-2">
              <Label htmlFor="endTime">Flash Sale End Time (Optional)</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={formData.endTime ? new Date(formData.endTime).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
              <p className="text-xs text-muted-foreground">
                Set a countdown timer for this flash sale. Leave empty for no timer.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#D91A60] hover:bg-[#D91A60]/90">
              {saving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlashSaleAdmin;