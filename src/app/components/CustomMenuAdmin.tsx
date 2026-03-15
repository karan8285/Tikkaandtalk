import { useState, useEffect, useCallback } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { getIconComponent } from "../lib/iconMap";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { MenuImageUpload } from "./MenuImageUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Pencil,
  Eye,
  EyeOff,
  PackageOpen,
  ExternalLink,
  Download,
  Search,
  Check,
  UtensilsCrossed,
} from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface CustomMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  enabled: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

interface HomeCategory {
  id: string;
  title: string;
  icon: string;
  route: string;
  visible: boolean;
  order: number;
  countKey: string | null;
  isBuiltIn: boolean;
}

interface Props {
  customToken: string;
}

export function CustomMenuAdmin({ customToken }: Props) {
  const [customCategories, setCustomCategories] = useState<HomeCategory[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [items, setItems] = useState<CustomMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add / Edit dialog
  const [itemDialog, setItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomMenuItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    originalPrice: "",
    image: "",
    enabled: true,
  });

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletingItem, setDeletingItem] = useState<CustomMenuItem | null>(null);

  // Import from Regular Menu dialog
  const [importDialog, setImportDialog] = useState(false);
  const [regularItems, setRegularItems] = useState<any[]>([]);
  const [loadingRegular, setLoadingRegular] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(
    new Set()
  );
  const [importing, setImporting] = useState(false);
  const [importCategoryFilter, setImportCategoryFilter] = useState<string>(
    "all"
  );

  // Fetch custom categories from home layout
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/home-layout`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const customs = (data.categories || []).filter(
          (c: HomeCategory) => !c.isBuiltIn && c.route.startsWith("/menu/")
        );
        setCustomCategories(customs);
        // Auto-select first if none selected
        if (customs.length > 0) {
          setSelectedSlug((prev) => {
            if (prev && customs.some((c: HomeCategory) => c.route === `/menu/${prev}`)) {
              return prev; // Keep current selection if it still exists
            }
            return customs[0].route.replace("/menu/", "");
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      toast.error("Failed to load custom categories");
    } finally {
      setLoading(false);
    }
  }, [customToken]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch items for selected slug
  const fetchItems = useCallback(async () => {
    if (!selectedSlug) return;
    setLoadingItems(true);
    try {
      const res = await fetch(`${API_BASE}/admin/custom-menu/${selectedSlug}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        toast.error("Failed to load menu items");
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);
      toast.error("Failed to load menu items");
    } finally {
      setLoadingItems(false);
    }
  }, [selectedSlug, customToken]);

  useEffect(() => {
    if (selectedSlug) fetchItems();
  }, [selectedSlug, fetchItems]);

  const openAddDialog = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      originalPrice: "",
      image: "",
      enabled: true,
    });
    setItemDialog(true);
  };

  const openEditDialog = (item: CustomMenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      originalPrice: item.originalPrice ? String(item.originalPrice) : "",
      image: item.image || "",
      enabled: item.enabled !== false,
    });
    setItemDialog(true);
  };

  const handleSaveItem = async () => {
    if (!selectedSlug) return;
    if (!formData.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const item: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        originalPrice: formData.originalPrice
          ? Number(formData.originalPrice)
          : undefined,
        image: formData.image.trim(),
        enabled: formData.enabled,
      };
      if (editingItem) {
        item.id = editingItem.id;
      }

      const res = await fetch(
        `${API_BASE}/admin/custom-menu/${selectedSlug}/item`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({ item }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setItemDialog(false);
        toast.success(editingItem ? "Item updated" : "Item added");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save item");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedSlug || !deletingItem) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/admin/custom-menu/${selectedSlug}/item/${deletingItem.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setDeleteDialog(false);
        setDeletingItem(null);
        toast.success("Item deleted");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete item");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete item");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (item: CustomMenuItem) => {
    if (!selectedSlug) return;
    try {
      const res = await fetch(
        `${API_BASE}/admin/custom-menu/${selectedSlug}/item`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({
            item: { id: item.id, enabled: !item.enabled },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        toast.success(
          item.enabled ? "Item hidden from menu" : "Item now visible"
        );
      }
    } catch {
      toast.error("Failed to toggle item");
    }
  };

  const handleMoveItem = async (index: number, direction: "up" | "down") => {
    if (!selectedSlug) return;
    const newItems = [...items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [
      newItems[targetIndex],
      newItems[index],
    ];
    setItems(newItems);

    // Save reorder to server
    try {
      const res = await fetch(
        `${API_BASE}/admin/custom-menu/${selectedSlug}/reorder`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({ itemIds: newItems.map((i) => i.id) }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      toast.error("Failed to save order");
    }
  };

  // ========== Import from Regular Menu ==========
  const openImportDialog = async () => {
    setImportDialog(true);
    setImportSearch("");
    setSelectedImportIds(new Set());
    setImportCategoryFilter("all");
    setLoadingRegular(true);
    try {
      const res = await fetch(`${API_BASE}/regular-menu`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRegularItems(data.items || []);
      } else {
        toast.error("Failed to load Regular Menu items");
      }
    } catch (error) {
      console.error("Error fetching regular menu:", error);
      toast.error("Failed to load Regular Menu");
    } finally {
      setLoadingRegular(false);
    }
  };

  const toggleImportItem = (id: string) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const filtered = getFilteredRegularItems();
    const allSelected = filtered.every((item: any) => selectedImportIds.has(item.id));
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filtered.forEach((item: any) => next.delete(item.id));
      } else {
        filtered.forEach((item: any) => next.add(item.id));
      }
      return next;
    });
  };

  const getRegularCategories = (): string[] => {
    const cats = new Set(
      regularItems.map((item: any) => item.category).filter(Boolean)
    );
    return Array.from(cats).sort();
  };

  const getFilteredRegularItems = () => {
    let filtered = regularItems;
    if (importCategoryFilter !== "all") {
      filtered = filtered.filter(
        (item: any) => item.category === importCategoryFilter
      );
    }
    if (importSearch.trim()) {
      const q = importSearch.toLowerCase();
      filtered = filtered.filter(
        (item: any) =>
          item.name?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q)
      );
    }
    // Mark items already in the custom category
    const existingNames = new Set(items.map((i) => i.name?.toLowerCase()));
    return filtered.map((item: any) => ({
      ...item,
      alreadyImported: existingNames.has(item.name?.toLowerCase()),
    }));
  };

  const handleImportSelected = async () => {
    if (!selectedSlug || selectedImportIds.size === 0) return;
    setImporting(true);
    try {
      const res = await fetch(
        `${API_BASE}/admin/custom-menu/${selectedSlug}/import-regular`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: JSON.stringify({ itemIds: Array.from(selectedImportIds) }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setImportDialog(false);
        const msg =
          data.skippedCount > 0
            ? `Imported ${data.importedCount} items (${data.skippedCount} duplicates skipped)`
            : `Imported ${data.importedCount} items successfully`;
        toast.success(msg);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to import items");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to import items");
    } finally {
      setImporting(false);
    }
  };

  const selectedCategory = customCategories.find(
    (c) => c.route === `/menu/${selectedSlug}`
  );
  const SelectedIcon = selectedCategory
    ? getIconComponent(selectedCategory.icon)
    : PackageOpen;

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <RefreshCw
          className="w-6 h-6 animate-spin mx-auto mb-2"
          style={{ color: BRAND }}
        />
        <p className="text-muted-foreground">Loading custom categories...</p>
      </Card>
    );
  }

  if (customCategories.length === 0) {
    return (
      <Card className="p-8 text-center space-y-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${BRAND}10` }}
        >
          <PackageOpen className="w-8 h-8" style={{ color: BRAND }} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            No Custom Categories
          </h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Custom categories created in the Layout tab with routes starting
            with <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">/menu/</code>{" "}
            will appear here for item management.
          </p>
        </div>
        <div className="pt-2">
          <p className="text-xs text-gray-400">
            Go to the <strong>Layout</strong> tab &rarr; Add Custom &rarr; set
            route as <code className="bg-gray-100 px-1 rounded">/menu/your-slug</code>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${BRAND}15` }}
          >
            <SelectedIcon className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Custom Menu Items
            </h3>
            <p className="text-xs text-gray-500">
              Manage items for your custom categories
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {customCategories.map((cat) => {
            const catSlug = cat.route.replace("/menu/", "");
            const Icon = getIconComponent(cat.icon);
            const isActive = catSlug === selectedSlug;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedSlug(catSlug)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? "text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={isActive ? { backgroundColor: BRAND } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.title}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Items Header */}
      {selectedSlug && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
            <a
              href={`/menu/${selectedSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: BRAND }}
            >
              Preview <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openImportDialog}
              className="text-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Import from Menu
            </Button>
            <Button
              size="sm"
              onClick={openAddDialog}
              className="text-xs text-white"
              style={{ backgroundColor: BRAND }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Item
            </Button>
          </div>
        </div>
      )}

      {/* Items List */}
      {loadingItems ? (
        <Card className="p-8 text-center">
          <RefreshCw
            className="w-5 h-5 animate-spin mx-auto mb-2"
            style={{ color: BRAND }}
          />
          <p className="text-sm text-gray-500">Loading items...</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <PackageOpen className="w-10 h-10 mx-auto text-gray-300" />
          <p className="text-sm text-gray-500">
            No items yet. Add items manually or import from the Regular Menu.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openImportDialog}
              className="text-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Import from Menu
            </Button>
            <Button
              size="sm"
              onClick={openAddDialog}
              className="text-xs text-white"
              style={{ backgroundColor: BRAND }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Item
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <Card
              key={item.id}
              className={`p-3 transition-all duration-200 ${
                !item.enabled ? "opacity-50 bg-gray-50" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleMoveItem(index, "up")}
                    disabled={index === 0}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleMoveItem(index, "down")}
                    disabled={index === items.length - 1}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {/* Image Thumbnail */}
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${BRAND}08` }}
                  >
                    <SelectedIcon
                      className="w-5 h-5"
                      style={{ color: `${BRAND}40` }}
                    />
                  </div>
                )}

                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-xs font-bold"
                      style={{ color: BRAND }}
                    >
                      {formatIDR(item.price)}
                    </span>
                    {item.originalPrice && item.originalPrice > item.price && (
                      <span className="text-[10px] text-gray-400 line-through">
                        {formatIDR(item.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.enabled ? (
                    <Eye className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                  )}
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={() => handleToggleEnabled(item)}
                  />
                </div>

                {/* Edit */}
                <button
                  onClick={() => openEditDialog(item)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-4 h-4 text-gray-500" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => {
                    setDeletingItem(item);
                    setDeleteDialog(true);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Item Dialog */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Item" : "Add New Item"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the details for this menu item."
                : `Add a new item to ${selectedCategory?.title || "this category"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                Item Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., Mango Lassi"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="A refreshing yogurt-based drink..."
                rows={2}
              />
            </div>

            {/* Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Price <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, price: e.target.value }))
                  }
                  placeholder="25000"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Original Price</Label>
                <Input
                  type="number"
                  value={formData.originalPrice}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      originalPrice: e.target.value,
                    }))
                  }
                  placeholder="30000"
                  min="0"
                />
                <p className="text-[10px] text-gray-400">
                  Leave blank for no strikethrough
                </p>
              </div>
            </div>

            {/* Image Upload */}
            <MenuImageUpload
              value={formData.image}
              onChange={(url) =>
                setFormData((f) => ({ ...f, image: url }))
              }
              customToken={customToken}
              label="Item Image"
              context="Custom Menu Item"
              recommendedSize="800 x 600 px"
              aspectRatio="4:3"
            />

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-sm">Visible on Menu</Label>
                <p className="text-[10px] text-gray-400">
                  Hidden items won't show to customers
                </p>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) =>
                  setFormData((f) => ({ ...f, enabled: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={saving}
              className="text-white"
              style={{ backgroundColor: BRAND }}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {editingItem ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingItem?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={saving}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Regular Menu Dialog */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5" style={{ color: BRAND }} />
              Import from Regular Menu
            </DialogTitle>
            <DialogDescription>
              Select items from the Regular Menu to copy into{" "}
              <strong>{selectedCategory?.title || "this category"}</strong>.
              Items are copied — you can edit them independently after import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            {/* Search + Category Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={importSearch}
                  onChange={(e) => setImportSearch(e.target.value)}
                  placeholder="Search items..."
                  className="pl-9"
                />
              </div>
              <select
                value={importCategoryFilter}
                onChange={(e) => setImportCategoryFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700"
              >
                <option value="all">All Categories</option>
                {getRegularCategories().map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Select All / Count */}
            {!loadingRegular && regularItems.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <button
                  onClick={toggleAllFiltered}
                  className="text-xs font-medium hover:underline"
                  style={{ color: BRAND }}
                >
                  {getFilteredRegularItems().length > 0 &&
                  getFilteredRegularItems().every((i: any) =>
                    selectedImportIds.has(i.id)
                  )
                    ? "Deselect All"
                    : "Select All"}
                </button>
                <span className="text-xs text-gray-500">
                  {selectedImportIds.size} selected
                </span>
              </div>
            )}

            {/* Scrollable Items List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[45vh] pr-1">
              {loadingRegular ? (
                <div className="p-8 text-center">
                  <RefreshCw
                    className="w-5 h-5 animate-spin mx-auto mb-2"
                    style={{ color: BRAND }}
                  />
                  <p className="text-sm text-gray-500">
                    Loading Regular Menu...
                  </p>
                </div>
              ) : regularItems.length === 0 ? (
                <div className="p-8 text-center">
                  <PackageOpen className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">
                    No items in the Regular Menu. Add items there first.
                  </p>
                </div>
              ) : getFilteredRegularItems().length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500">
                    No items match your search.
                  </p>
                </div>
              ) : (
                getFilteredRegularItems().map((item: any) => {
                  const isSelected = selectedImportIds.has(item.id);
                  const isAlready = item.alreadyImported;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (!isAlready) toggleImportItem(item.id);
                      }}
                      disabled={isAlready}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        isAlready
                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "border-2 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                      style={
                        isSelected && !isAlready
                          ? { borderColor: BRAND, backgroundColor: `${BRAND}05` }
                          : undefined
                      }
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                          isAlready
                            ? "bg-gray-200 border-gray-300"
                            : isSelected
                            ? "text-white"
                            : "border-gray-300"
                        }`}
                        style={
                          isSelected && !isAlready
                            ? { backgroundColor: BRAND, borderColor: BRAND }
                            : undefined
                        }
                      >
                        {(isSelected || isAlready) && (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </div>

                      {/* Thumbnail */}
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${BRAND}08` }}
                        >
                          <UtensilsCrossed
                            className="w-4 h-4"
                            style={{ color: `${BRAND}40` }}
                          />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {item.name}
                          </span>
                          {isAlready && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                              Already added
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-xs font-bold"
                            style={{ color: BRAND }}
                          >
                            {formatIDR(item.price)}
                          </span>
                          {item.category && (
                            <span className="text-[10px] text-gray-400">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" onClick={() => setImportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportSelected}
              disabled={importing || selectedImportIds.size === 0}
              className="text-white"
              style={{ backgroundColor: BRAND }}
            >
              {importing ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Import {selectedImportIds.size > 0 ? `(${selectedImportIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}