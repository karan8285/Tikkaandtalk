import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Save, RefreshCw, Settings, X } from "lucide-react";
import { MenuImageUpload } from "./MenuImageUpload";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface CelebrationCategory {
  id: number;
  title: string;
  subtitle: string;
  buttonText: string;
  image: string;
  gradientStart: string;
  gradientEnd: string;
  enabled: boolean;
  displayOrder: number;
}

interface HubSettings {
  pageTitle: string;
  pageTitleHighlight: string;
  pageSubtitle: string;
  enabled: boolean;
}

interface Props {
  customToken: string;
}

const DEFAULT_FORM: Omit<CelebrationCategory, "id"> = {
  title: "",
  subtitle: "",
  buttonText: "View Packages",
  image: "",
  gradientStart: "#E91E63",
  gradientEnd: "#C2185B",
  enabled: true,
  displayOrder: 1,
};

export function CelebrationCategoriesAdmin({ customToken }: Props) {
  const [categories, setCategories] = useState<CelebrationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<CelebrationCategory, "id">>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Hub Settings
  const [showSettings, setShowSettings] = useState(false);
  const [hubSettings, setHubSettings] = useState<HubSettings>({
    pageTitle: "Choose Your",
    pageTitleHighlight: "Party & Catering Package",
    pageSubtitle: "Select an option for your next event",
    enabled: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/celebration-categories`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch celebration categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const fetchHubSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/celebrations-hub-settings`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHubSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch hub settings:", error);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchHubSettings();
  }, []);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `${API_BASE}/admin/celebration-categories/${editingId}`
        : `${API_BASE}/admin/celebration-categories`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success(editingId ? "Category updated!" : "Category created!");
        setShowForm(false);
        setEditingId(null);
        setForm(DEFAULT_FORM);
        fetchCategories();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch (error) {
      toast.error("Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this celebration category?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/celebration-categories/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (res.ok) {
        toast.success("Category deleted");
        fetchCategories();
      }
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const handleEdit = (cat: CelebrationCategory) => {
    setEditingId(cat.id);
    setForm({
      title: cat.title,
      subtitle: cat.subtitle,
      buttonText: cat.buttonText,
      image: cat.image,
      gradientStart: cat.gradientStart,
      gradientEnd: cat.gradientEnd,
      enabled: cat.enabled,
      displayOrder: cat.displayOrder,
    });
    setShowForm(true);
  };

  const handleSaveHubSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE}/admin/celebrations-hub-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(hubSettings),
      });
      if (res.ok) {
        toast.success("Hub settings updated!");
        setShowSettings(false);
      } else {
        toast.error("Failed to save hub settings");
      }
    } catch (error) {
      toast.error("Failed to save hub settings");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Celebration Categories</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-4 h-4 mr-1" />
            Hub Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCategories}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setForm({
                ...DEFAULT_FORM,
                displayOrder: categories.length + 1,
              });
              setShowForm(true);
            }}
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Categories List */}
      {loading ? (
        <p className="text-gray-500 text-center py-8">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No celebration categories yet</p>
      ) : (
        <div className="grid gap-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-4">
              <div className="flex gap-3">
                {/* Preview thumbnail */}
                <div
                  className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 relative"
                >
                  {cat.image && (
                    <img
                      src={cat.image}
                      alt={cat.title}
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${cat.gradientStart}AA, ${cat.gradientEnd}CC)`,
                    }}
                  />
                  <span className="relative z-10 text-white text-[10px] font-bold p-1.5 leading-tight block">
                    {cat.title}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-800 truncate">{cat.title}</h4>
                    {!cat.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{cat.subtitle}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Button: "{cat.buttonText}" | Order: {cat.displayOrder}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(cat)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(cat.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              Configure a celebration category card for the hub page
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Birthday Party Packages"
              />
            </div>

            <div>
              <Label>Subtitle</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="e.g. Complete party bundles with food, decor, and setup"
              />
            </div>

            <div>
              <Label>Button Text</Label>
              <Input
                value={form.buttonText}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                placeholder="e.g. View Packages"
              />
            </div>

            <div>
              <MenuImageUpload
                value={form.image}
                onChange={(url) => setForm({ ...form, image: url })}
                customToken={customToken}
                label="Category Image"
                context="Celebration Category Card"
                recommendedSize="800 x 500 px"
                aspectRatio="16:10"
                maxSizeMB={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gradient Start</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.gradientStart}
                    onChange={(e) =>
                      setForm({ ...form, gradientStart: e.target.value })
                    }
                    className="w-8 h-8 rounded cursor-pointer border-0"
                  />
                  <Input
                    value={form.gradientStart}
                    onChange={(e) =>
                      setForm({ ...form, gradientStart: e.target.value })
                    }
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label>Gradient End</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.gradientEnd}
                    onChange={(e) =>
                      setForm({ ...form, gradientEnd: e.target.value })
                    }
                    className="w-8 h-8 rounded cursor-pointer border-0"
                  />
                  <Input
                    value={form.gradientEnd}
                    onChange={(e) =>
                      setForm({ ...form, gradientEnd: e.target.value })
                    }
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div>
              <Label className="mb-2 block">Preview</Label>
              <div
                className="relative rounded-xl overflow-hidden h-32"
              >
                {form.image && (
                  <img
                    src={form.image}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, ${form.gradientStart}90, ${form.gradientEnd}CC)`,
                  }}
                />
                <div className="relative z-10 flex flex-col justify-between h-full p-3">
                  <h4 className="text-base font-extrabold text-white drop-shadow">
                    {form.title || "Category Title"}
                  </h4>
                  <div>
                    <p className="text-white/90 text-[10px] mb-2">{form.subtitle}</p>
                    <span
                      className="inline-block px-3 py-1 rounded-full text-[10px] font-bold text-white border border-white/40"
                      style={{ backgroundColor: form.gradientStart }}
                    >
                      {form.buttonText || "View"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) =>
                  setForm({ ...form, displayOrder: parseInt(e.target.value) || 1 })
                }
                min={1}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(v) =>
                  setForm({ ...form, enabled: v === true })
                }
              />
              <Label className="!mb-0 cursor-pointer">Enabled</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: BRAND }}
            >
              <Save className="w-4 h-4 mr-1" />
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hub Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Celebrations Hub Settings</DialogTitle>
            <DialogDescription>
              Configure the celebrations hub landing page
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Page Title (Line 1)</Label>
              <Input
                value={hubSettings.pageTitle}
                onChange={(e) =>
                  setHubSettings({ ...hubSettings, pageTitle: e.target.value })
                }
                placeholder="Choose Your"
              />
            </div>
            <div>
              <Label>Page Title Highlight (Line 2, colored)</Label>
              <Input
                value={hubSettings.pageTitleHighlight}
                onChange={(e) =>
                  setHubSettings({
                    ...hubSettings,
                    pageTitleHighlight: e.target.value,
                  })
                }
                placeholder="Party & Catering Package"
              />
            </div>
            <div>
              <Label>Subtitle</Label>
              <Input
                value={hubSettings.pageSubtitle}
                onChange={(e) =>
                  setHubSettings({
                    ...hubSettings,
                    pageSubtitle: e.target.value,
                  })
                }
                placeholder="Select an option for your next event"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveHubSettings}
              disabled={savingSettings}
              style={{ backgroundColor: BRAND }}
            >
              <Save className="w-4 h-4 mr-1" />
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
