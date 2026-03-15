import { useState, useEffect, useCallback } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { ICON_MAP, ICON_GROUPS, getIconComponent } from "../lib/iconMap";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { toast } from "sonner";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Lock,
  Search,
  X,
  Smartphone,
  ArrowRight,
} from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

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

const BUILT_IN_ROUTES: Record<string, string> = {
  "todays-special": "/todays-special",
  "kids-menu": "/kids-menu",
  "flash-sale": "/flash-sale",
  "regular-menu": "/regular-menu",
  celebrations: "/celebrations",
};

export function HomeLayoutAdmin({ customToken }: Props) {
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalCategories, setOriginalCategories] = useState<HomeCategory[]>([]);

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<HomeCategory | null>(null);
  const [editForm, setEditForm] = useState({ title: "", icon: "", route: "" });

  // Icon picker dialog
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  // Add custom category dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", icon: "Pizza", route: "/" });

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<HomeCategory | null>(null);

  // Reset confirm
  const [resetDialog, setResetDialog] = useState(false);

  const fetchLayout = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/home-layout`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch layout");
      const data = await res.json();
      setCategories(data.categories || []);
      setOriginalCategories(JSON.parse(JSON.stringify(data.categories || [])));
      setHasChanges(false);
    } catch (error) {
      console.error("Error fetching home layout:", error);
      toast.error("Failed to load home layout");
    } finally {
      setLoading(false);
    }
  }, [customToken]);

  useEffect(() => {
    fetchLayout();
  }, [fetchLayout]);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(categories) !== JSON.stringify(originalCategories);
    setHasChanges(changed);
  }, [categories, originalCategories]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/admin/home-layout`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({ categories }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      const data = await res.json();
      setCategories(data.categories);
      setOriginalCategories(JSON.parse(JSON.stringify(data.categories)));
      setHasChanges(false);
      toast.success("Home layout saved successfully!");
    } catch (error: any) {
      console.error("Error saving home layout:", error);
      toast.error(error.message || "Failed to save home layout");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/admin/home-layout/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (!res.ok) throw new Error("Failed to reset");
      const data = await res.json();
      setCategories(data.categories);
      setOriginalCategories(JSON.parse(JSON.stringify(data.categories)));
      setHasChanges(false);
      setResetDialog(false);
      toast.success("Home layout reset to defaults!");
    } catch (error: any) {
      console.error("Error resetting home layout:", error);
      toast.error(error.message || "Failed to reset");
    } finally {
      setSaving(false);
    }
  };

  const moveCategory = (index: number, direction: "up" | "down") => {
    const newCategories = [...categories];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCategories.length) return;
    [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
    // Reassign order
    newCategories.forEach((cat, i) => (cat.order = i));
    setCategories(newCategories);
  };

  const toggleVisibility = (index: number) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], visible: !newCategories[index].visible };
    setCategories(newCategories);
  };

  const openEditDialog = (category: HomeCategory) => {
    setEditingCategory(category);
    setEditForm({
      title: category.title,
      icon: category.icon,
      route: category.route,
    });
    setEditDialog(true);
  };

  const saveEdit = () => {
    if (!editingCategory) return;
    if (!editForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const newCategories = categories.map((cat) =>
      cat.id === editingCategory.id
        ? { ...cat, title: editForm.title.trim(), icon: editForm.icon, route: editForm.route.trim() }
        : cat
    );
    setCategories(newCategories);
    setEditDialog(false);
    setEditingCategory(null);
  };

  const addCustomCategory = () => {
    if (!addForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!addForm.route.trim()) {
      toast.error("Route is required");
      return;
    }
    // Check for duplicate routes
    const normalizedRoute = addForm.route.trim().startsWith("/") ? addForm.route.trim() : `/${addForm.route.trim()}`;
    const duplicateRoute = categories.find((cat) => cat.route === normalizedRoute);
    if (duplicateRoute) {
      toast.error(`Route "${normalizedRoute}" is already used by "${duplicateRoute.title}". Each category needs a unique route.`);
      return;
    }
    const newId = `custom-${Date.now()}`;
    const newCategory: HomeCategory = {
      id: newId,
      title: addForm.title.trim(),
      icon: addForm.icon,
      route: normalizedRoute,
      visible: true,
      order: categories.length,
      countKey: null,
      isBuiltIn: false,
    };
    setCategories([...categories, newCategory]);
    setAddForm({ title: "", icon: "Pizza", route: "/" });
    setAddDialog(false);
    toast.success(`Added "${newCategory.title}" category`);
  };

  const deleteCategory = () => {
    if (!deletingCategory) return;
    setCategories(categories.filter((cat) => cat.id !== deletingCategory.id));
    setDeleteDialog(false);
    setDeletingCategory(null);
    toast.success("Category removed");
  };

  // Icon picker filter
  const filteredIconGroups = iconSearch.trim()
    ? ICON_GROUPS.map((group) => ({
        ...group,
        icons: group.icons.filter((name) => name.toLowerCase().includes(iconSearch.toLowerCase())),
      })).filter((g) => g.icons.length > 0)
    : ICON_GROUPS;

  const selectIcon = (iconName: string) => {
    if (editDialog && editingCategory) {
      setEditForm((f) => ({ ...f, icon: iconName }));
    } else if (addDialog) {
      setAddForm((f) => ({ ...f, icon: iconName }));
    }
    setIconPickerOpen(false);
    setIconSearch("");
  };

  const visibleCount = categories.filter((c) => c.visible).length;

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
        <p className="text-muted-foreground">Loading home layout...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${BRAND}15` }}
            >
              <Smartphone className="w-5 h-5" style={{ color: BRAND }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Home Screen Layout</h3>
              <p className="text-xs text-gray-500">
                {categories.length} categories ({visibleCount} visible)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialog(true)}
              disabled={saving}
              className="text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddForm({ title: "", icon: "Pizza", route: "/" });
                setAddDialog(true);
              }}
              disabled={saving}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Custom
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="text-xs text-white"
              style={{ backgroundColor: hasChanges ? BRAND : undefined }}
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Unsaved Changes Banner */}
      {hasChanges && (
        <div
          className="rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm font-medium text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Save className="w-4 h-4 flex-shrink-0" />
          <span>You have unsaved changes</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto text-xs h-7"
          >
            Save Now
          </Button>
        </div>
      )}

      {/* Live Preview */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Preview</span>
        </div>
        <div
          className="rounded-2xl p-4 overflow-hidden"
          style={{ backgroundColor: APP_CONFIG.brand.backgroundTint }}
        >
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {categories
              .filter((c) => c.visible)
              .sort((a, b) => a.order - b.order)
              .map((cat) => {
                const Icon = getIconComponent(cat.icon);
                return (
                  <div
                    key={cat.id}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 px-2 py-1"
                    style={{ minWidth: "72px" }}
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${BRAND}10, ${BRAND}20)`,
                        border: `2px solid ${BRAND}25`,
                      }}
                    >
                      <Icon className="w-6 h-6" style={{ color: BRAND }} />
                    </div>
                    <span
                      className="text-[11px] font-semibold text-center leading-tight max-w-[72px]"
                      style={{ color: "#5A5A5A" }}
                    >
                      {cat.title}
                    </span>
                  </div>
                );
              })}
            {visibleCount === 0 && (
              <p className="text-sm text-gray-400 italic py-4 px-2">No visible categories</p>
            )}
          </div>
        </div>
      </Card>

      {/* Category List */}
      <div className="space-y-2">
        {categories.map((category, index) => {
          const Icon = getIconComponent(category.icon);
          return (
            <Card
              key={category.id}
              className={`p-3 transition-all duration-200 ${
                !category.visible ? "opacity-50 bg-gray-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Drag Handle / Order */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveCategory(index, "up")}
                    disabled={index === 0}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => moveCategory(index, "down")}
                    disabled={index === categories.length - 1}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {/* Order Number */}
                <span className="w-6 h-6 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </span>

                {/* Icon Preview */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: category.visible
                      ? `linear-gradient(135deg, ${BRAND}10, ${BRAND}20)`
                      : "#f3f4f6",
                    border: `2px solid ${category.visible ? `${BRAND}25` : "#e5e7eb"}`,
                  }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: category.visible ? BRAND : "#9ca3af" }}
                  />
                </div>

                {/* Title & Route */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {category.title}
                    </span>
                    {category.isBuiltIn && (
                      <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" title="Built-in category" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <ArrowRight className="w-3 h-3" />
                    <span className="truncate">{category.route}</span>
                  </div>
                </div>

                {/* Visibility Toggle */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {category.visible ? (
                    <Eye className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                  )}
                  <Switch
                    checked={category.visible}
                    onCheckedChange={() => toggleVisibility(index)}
                  />
                </div>

                {/* Edit Button */}
                <button
                  onClick={() => openEditDialog(category)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-4 h-4 text-gray-500" />
                </button>

                {/* Delete Button (custom categories only) */}
                {!category.isBuiltIn && (
                  <button
                    onClick={() => {
                      setDeletingCategory(category);
                      setDeleteDialog(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Category Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              {editingCategory?.isBuiltIn
                ? "Customize the display name and icon for this built-in category."
                : "Edit all properties of this custom category."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm">Display Name</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Category name"
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label className="text-sm">Icon</Label>
              <button
                onClick={() => setIconPickerOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                {(() => {
                  const Icon = getIconComponent(editForm.icon);
                  return (
                    <>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND}10, ${BRAND}20)`,
                          border: `2px solid ${BRAND}25`,
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: BRAND }} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{editForm.icon}</span>
                      <Pencil className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                    </>
                  );
                })()}
              </button>
            </div>

            {/* Route (editable for custom, read-only for built-in) */}
            <div className="space-y-1.5">
              <Label className="text-sm">Route</Label>
              {editingCategory?.isBuiltIn ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-500">{editForm.route}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">Built-in</span>
                </div>
              ) : (
                <Input
                  value={editForm.route}
                  onChange={(e) => setEditForm((f) => ({ ...f, route: e.target.value }))}
                  placeholder="/my-page"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} className="text-white" style={{ backgroundColor: BRAND }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Icon Picker Dialog */}
      <Dialog open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Choose Icon</DialogTitle>
            <DialogDescription>Pick an icon for this category</DialogDescription>
          </DialogHeader>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons..."
              className="pl-9 pr-8"
            />
            {iconSearch && (
              <button
                onClick={() => setIconSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          {/* Icon Grid */}
          <div className="overflow-y-auto flex-1 space-y-4 pr-1 py-2">
            {filteredIconGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {group.label}
                </p>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                  {group.icons.map((iconName) => {
                    const Icon = ICON_MAP[iconName];
                    if (!Icon) return null;
                    const isSelected =
                      (editDialog ? editForm.icon : addForm.icon) === iconName;
                    return (
                      <button
                        key={iconName}
                        onClick={() => selectIcon(iconName)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-150 ${
                          isSelected
                            ? "ring-2 shadow-sm"
                            : "hover:bg-gray-50"
                        }`}
                        style={
                          isSelected
                            ? { ringColor: BRAND, backgroundColor: `${BRAND}08` }
                            : undefined
                        }
                        title={iconName}
                      >
                        <Icon
                          className="w-5 h-5"
                          style={{ color: isSelected ? BRAND : "#6b7280" }}
                        />
                        <span className="text-[8px] text-gray-400 truncate w-full text-center">
                          {iconName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredIconGroups.length === 0 && (
              <p className="text-sm text-gray-400 italic text-center py-6">
                No icons match "{iconSearch}"
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Custom Category Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Category</DialogTitle>
            <DialogDescription>
              Create a new menu category for the home screen. You can link it to any existing page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm">Display Name</Label>
              <Input
                value={addForm.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setAddForm((f) => {
                    // Auto-generate route from title if route hasn't been manually edited
                    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    const wasAutoGenerated = f.route === "/" || f.route === `/menu/${f.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
                    return {
                      ...f,
                      title,
                      route: wasAutoGenerated && slug ? `/menu/${slug}` : f.route,
                    };
                  });
                }}
                placeholder="e.g., Beverages, Desserts..."
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label className="text-sm">Icon</Label>
              <button
                onClick={() => setIconPickerOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                {(() => {
                  const Icon = getIconComponent(addForm.icon);
                  return (
                    <>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND}10, ${BRAND}20)`,
                          border: `2px solid ${BRAND}25`,
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: BRAND }} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{addForm.icon}</span>
                      <Pencil className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                    </>
                  );
                })()}
              </button>
            </div>

            {/* Route */}
            <div className="space-y-1.5">
              <Label className="text-sm">Route / Link</Label>
              <Input
                value={addForm.route}
                onChange={(e) => setAddForm((f) => ({ ...f, route: e.target.value }))}
                placeholder="/menu/beverages"
              />
              <p className="text-[10px] text-gray-400">
                Use <code className="bg-gray-100 px-1 rounded">/menu/your-slug</code> for a new menu page with item management, or link to an existing page like /regular-menu.
              </p>
              {addForm.title && !addForm.route.startsWith("/menu/") && addForm.route === "/" && (
                <button
                  type="button"
                  onClick={() => {
                    const slug = addForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    setAddForm((f) => ({ ...f, route: `/menu/${slug}` }));
                  }}
                  className="text-[10px] font-medium hover:underline"
                  style={{ color: BRAND }}
                >
                  Auto-generate: /menu/{addForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addCustomCategory} className="text-white" style={{ backgroundColor: BRAND }}>
              <Plus className="w-4 h-4 mr-1" />
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Remove Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{deletingCategory?.title}"? This action can be undone by
              clicking Reset to Defaults (for built-in categories) or re-adding the category.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteCategory}>
              <Trash2 className="w-4 h-4 mr-1" />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirm Dialog */}
      <Dialog open={resetDialog} onOpenChange={setResetDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset to Defaults</DialogTitle>
            <DialogDescription>
              This will reset all categories back to the original defaults. Any custom categories and
              reordering will be lost. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReset}
              disabled={saving}
              className="text-white"
              style={{ backgroundColor: BRAND }}
            >
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-100">
        <div className="flex gap-3">
          <Smartphone className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">How it works</p>
            <ul className="space-y-0.5 text-blue-600">
              <li>Drag categories up/down to reorder them on the home screen</li>
              <li>Toggle visibility to show/hide categories without deleting</li>
              <li>Click the pencil icon to change the name or icon</li>
              <li>Add custom categories that link to any existing page</li>
              <li>Built-in categories (marked with lock) cannot be deleted or re-routed</li>
              <li>Remember to click <strong>Save</strong> to apply changes</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}