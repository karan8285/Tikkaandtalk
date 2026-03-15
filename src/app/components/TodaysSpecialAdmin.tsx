import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { ChefHat, Plus, Pencil, Trash2, Image as ImageIcon, Video } from "lucide-react";
import { MenuImageUpload } from "./MenuImageUpload";
import { MenuVideoUpload } from "./MenuVideoUpload";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface TodaysSpecialItem {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  image: string;
  video?: string;
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

export function TodaysSpecialAdmin({ customToken }: Props) {
  const [items, setItems] = useState<TodaysSpecialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TodaysSpecialItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    subtitle: "",
    description: "",
    image: "",
    video: "",
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
      const response = await fetch(`${API_BASE}/admin/todays-special`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      } else {
        toast.error("Failed to load Today's Special items");
      }
    } catch (error) {
      console.error("Error fetching Today's Special items:", error);
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
      video: "",
      originalPrice: "",
      discountPercentage: "",
      badgeText: "",
      enabled: true,
      displayOrder: items.length + 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: TodaysSpecialItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name || "",
      subtitle: item.subtitle || "",
      description: item.description || "",
      image: item.image || "",
      video: item.video || "",
      originalPrice: item.originalPrice?.toString() || "",
      discountPercentage: item.discountPercentage?.toString() || "",
      badgeText: item.badgeText || "",
      enabled: item.enabled ?? true,
      displayOrder: item.displayOrder ?? 0,
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
        video: formData.video,
        originalPrice: parseFloat(formData.originalPrice),
        discountPercentage: parseFloat(formData.discountPercentage || "0"),
        badgeText: formData.badgeText || `SPECIAL ${formData.discountPercentage}% OFF`,
        enabled: formData.enabled,
        displayOrder: formData.displayOrder,
      };

      const url = editingItem
        ? `${API_BASE}/admin/todays-special/${editingItem.id}`
        : `${API_BASE}/admin/todays-special`;

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

  const handleDelete = async (itemId: number) => {
    if (!confirm("Are you sure you want to delete this item?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/todays-special/${itemId}`, {
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

  const toggleEnabled = async (item: TodaysSpecialItem) => {
    try {
      const response = await fetch(`${API_BASE}/admin/todays-special/${item.id}`, {
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
        toast.success(`Item ${!item.enabled ? "enabled" : "disabled"}`);
        fetchItems();
      } else {
        toast.error("Failed to update item");
      }
    } catch (error) {
      console.error("Error toggling item:", error);
      toast.error("Failed to update item");
    }
  };

  const handleSeedItems = async () => {
    if (!confirm("This will add 3 default menu items (Chicken Tikka Masala, Butter Chicken, Samosa). Continue?")) {
      return;
    }

    setSeeding(true);
    try {
      const response = await fetch(`${API_BASE}/admin/todays-special/seed`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message || "Items seeded successfully!");
        fetchItems();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to seed items");
      }
    } catch (error) {
      console.error("Error seeding items:", error);
      toast.error("Failed to seed items");
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Today's Special Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage special dishes with carousel display
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Add Special
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <ChefHat className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-4">No special items yet</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={handleSeedItems} disabled={seeding} variant="outline">
              {seeding ? "Seeding..." : "Seed with 3 Menu Items"}
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create Manually
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              {/* Image */}
              {/* Image with optional video indicator */}
              <div className="relative">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                {item.video && (
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded-md flex items-center gap-1 text-xs">
                    <Video className="w-3.5 h-3.5" />
                    Video
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">{item.name}</h3>
                    {item.subtitle && (
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <Badge variant={item.enabled ? "default" : "secondary"}>
                    {item.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  {item.discountPercentage > 0 && (
                    <span className="text-sm text-gray-400 line-through">
                      {formatIDR(item.originalPrice)}
                    </span>
                  )}
                  <span className="font-bold text-pink-600">
                    {formatIDR(item.finalPrice)}
                  </span>
                </div>

                {item.badgeText && (
                  <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                    {item.badgeText}
                  </Badge>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={() => toggleEnabled(item)}
                  />
                  <span className="text-xs text-muted-foreground flex-1">
                    {item.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(item)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
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
            <DialogTitle>
              {editingItem ? "Edit Special Item" : "Create Special Item"}
            </DialogTitle>
            <DialogDescription>
              Add or update a special dish for the carousel display
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Dish Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Butter Chicken"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="subtitle">Subtitle</Label>
                <Input
                  id="subtitle"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g., With fragrant rice"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the dish"
                  rows={3}
                />
              </div>

              <div className="col-span-2">
                <MenuImageUpload
                  value={formData.image}
                  onChange={(url) => setFormData({ ...formData, image: url })}
                  customToken={customToken}
                  label="Dish Image"
                  context="Today's Special Card"
                  recommendedSize="800 x 600 px"
                  aspectRatio="4:3"
                  maxSizeMB={5}
                />
              </div>

              <div className="col-span-2">
                <MenuVideoUpload
                  value={formData.video}
                  onChange={(url) => setFormData({ ...formData, video: url })}
                  customToken={customToken}
                  label="Dish Video (Optional)"
                  context="Today's Special"
                  maxSizeMB={50}
                />
              </div>

              <div>
                <Label htmlFor="originalPrice">Original Price (IDR) *</Label>
                <Input
                  id="originalPrice"
                  type="number"
                  value={formData.originalPrice}
                  onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                  placeholder="285000"
                />
              </div>

              <div>
                <Label htmlFor="discountPercentage">Discount %</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={formData.discountPercentage}
                  onChange={(e) => setFormData({ ...formData, discountPercentage: e.target.value })}
                  placeholder="15"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="badgeText">Badge Text</Label>
                <Input
                  id="badgeText"
                  value={formData.badgeText}
                  onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                  placeholder="SPECIAL 15% OFF"
                />
              </div>

              <div>
                <Label htmlFor="displayOrder">Display Order</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                  placeholder="1"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
                <Label htmlFor="enabled">Enabled</Label>
              </div>
            </div>

            {/* Preview */}
            {formData.originalPrice && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-medium mb-2">Price Preview:</p>
                <div className="flex items-center gap-2">
                  {formData.discountPercentage && parseFloat(formData.discountPercentage) > 0 && (
                    <span className="text-sm text-gray-400 line-through">
                      {formatIDR(parseFloat(formData.originalPrice))}
                    </span>
                  )}
                  <span className="font-bold text-pink-600">
                    {formatIDR(
                      parseFloat(formData.originalPrice) -
                      (parseFloat(formData.originalPrice) * (parseFloat(formData.discountPercentage || "0") / 100))
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TodaysSpecialAdmin;