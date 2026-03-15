import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { formatIDR } from "../lib/currency";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, GripVertical, Save, RefreshCw, Settings, X } from "lucide-react";
import { MenuImageUpload } from "./MenuImageUpload";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface PackageFeature {
  emoji: string;
  text: string;
}

interface CelebrationCategory {
  id: number;
  title: string;
}

interface PartyPackage {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  priceNote: string;
  description: string;
  features: PackageFeature[];
  tierColor: string;
  tierGradient: string;
  enabled: boolean;
  displayOrder: number;
}

interface PageSettings {
  pageTitle: string;
  pageSubtitle: string;
  bannerImage: string;
  bookingWhatsAppMessage: string;
  enabled: boolean;
}

interface Props {
  customToken: string;
}

const DEFAULT_FORM: Omit<PartyPackage, "id"> = {
  categoryId: 0,
  name: "",
  price: 0,
  priceNote: "before tax",
  description: "",
  features: [{ emoji: "🎈", text: "" }],
  tierColor: "#C0C0C0",
  tierGradient: "linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 50%, #A8A8A8 100%)",
  enabled: true,
  displayOrder: 1,
};

export function PartyPackagesAdmin({ customToken }: Props) {
  const [categories, setCategories] = useState<CelebrationCategory[]>([]);
  const [packages, setPackages] = useState<PartyPackage[]>([]);
  const [settings, setSettings] = useState<PageSettings>({
    pageTitle: "Celebrate Your Special Moments",
    pageSubtitle: "Customizable packages for every occasion",
    bannerImage: "",
    bookingWhatsAppMessage: "Hi! I'd like to book a party package.",
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PartyPackage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PartyPackage | null>(null);
  const [formData, setFormData] = useState<Omit<PartyPackage, "id">>(DEFAULT_FORM);
  const [filterCategoryId, setFilterCategoryId] = useState<number>(0);

  const headers = {
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pkgRes, settingsRes, catRes] = await Promise.all([
        fetch(`${API_BASE}/admin/party-packages`, { headers }),
        fetch(`${API_BASE}/party-packages-settings`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${API_BASE}/admin/celebration-categories`, { headers }),
      ]);

      if (pkgRes.ok) {
        const data = await pkgRes.json();
        setPackages(data.items || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
      }
      if (catRes.ok) {
        const data = await catRes.json();
        setCategories((data.items || []).map((c: any) => ({ id: c.id, title: c.title })));
      }
    } catch (error) {
      console.error("Failed to fetch party packages:", error);
      toast.error("Failed to load party packages");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormData({
      ...DEFAULT_FORM,
      displayOrder: packages.length + 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (pkg: PartyPackage) => {
    setEditingItem(pkg);
    setFormData({
      categoryId: pkg.categoryId || 0,
      name: pkg.name,
      price: pkg.price,
      priceNote: pkg.priceNote,
      description: pkg.description,
      features: [...pkg.features],
      tierColor: pkg.tierColor,
      tierGradient: pkg.tierGradient,
      enabled: pkg.enabled,
      displayOrder: pkg.displayOrder,
    });
    setDialogOpen(true);
  };

  const addFeature = () => {
    setFormData((prev) => ({
      ...prev,
      features: [...prev.features, { emoji: "🎈", text: "" }],
    }));
  };

  const removeFeature = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== idx),
    }));
  };

  const updateFeature = (idx: number, field: "emoji" | "text", value: string) => {
    setFormData((prev) => {
      const features = [...prev.features];
      features[idx] = { ...features[idx], [field]: value };
      return { ...prev, features };
    });
  };

  const savePackage = async () => {
    if (!formData.name.trim()) {
      toast.error("Package name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingItem
        ? `${API_BASE}/admin/party-packages/${editingItem.id}`
        : `${API_BASE}/admin/party-packages`;
      const method = editingItem ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success(editingItem ? "Package updated!" : "Package created!");
        setDialogOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save package");
      }
    } catch (error) {
      toast.error("Failed to save package");
    } finally {
      setSaving(false);
    }
  };

  const deletePackage = async (pkg: PartyPackage) => {
    try {
      const res = await fetch(`${API_BASE}/admin/party-packages/${pkg.id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        toast.success("Package deleted");
        setDeleteConfirm(null);
        fetchData();
      } else {
        toast.error("Failed to delete package");
      }
    } catch {
      toast.error("Failed to delete package");
    }
  };

  const toggleEnabled = async (pkg: PartyPackage) => {
    try {
      const res = await fetch(`${API_BASE}/admin/party-packages/${pkg.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ enabled: !pkg.enabled }),
      });
      if (res.ok) {
        toast.success(pkg.enabled ? "Package disabled" : "Package enabled");
        fetchData();
      }
    } catch {
      toast.error("Failed to toggle package");
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/party-packages-settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success("Settings saved!");
        setSettingsOpen(false);
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
        <p className="text-muted-foreground">Loading party packages...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">Party Packages ({packages.length})</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-4 h-4 mr-1" />
            Page Settings
          </Button>
          <Button size="sm" onClick={openCreateDialog} style={{ backgroundColor: BRAND }}>
            <Plus className="w-4 h-4 mr-1" />
            Add Package
          </Button>
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategoryId(0)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategoryId === 0 ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={filterCategoryId === 0 ? { backgroundColor: BRAND } : {}}
          >
            All ({packages.length})
          </button>
          {categories.map((cat) => {
            const count = packages.filter(p => p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterCategoryId === cat.id ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={filterCategoryId === cat.id ? { backgroundColor: BRAND } : {}}
              >
                {cat.title} ({count})
              </button>
            );
          })}
          {(() => {
            const unassigned = packages.filter(p => !p.categoryId || p.categoryId === 0).length;
            return unassigned > 0 ? (
              <button
                onClick={() => setFilterCategoryId(-1)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterCategoryId === -1 ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={filterCategoryId === -1 ? { backgroundColor: BRAND } : {}}
              >
                Unassigned ({unassigned})
              </button>
            ) : null;
          })()}
        </div>
      )}

      {/* Package Cards */}
      {packages.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No party packages yet. Click "Add Package" to create one.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {packages
            .filter(pkg => filterCategoryId === 0 || (filterCategoryId === -1 ? (!pkg.categoryId || pkg.categoryId === 0) : pkg.categoryId === filterCategoryId))
            .map((pkg) => (
            <Card key={pkg.id} className={`overflow-hidden ${!pkg.enabled ? "opacity-60" : ""}`}>
              {/* Color header */}
              <div
                className="h-2"
                style={{ background: pkg.tierGradient }}
              />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-base">{pkg.name}</h3>
                    <p className="text-sm text-gray-500">
                      {pkg.price > 0 ? `${formatIDR(pkg.price)} (${pkg.priceNote})` : pkg.priceNote}
                    </p>
                    {pkg.categoryId > 0 && (
                      <p className="text-[11px] mt-0.5" style={{ color: BRAND }}>
                        {categories.find(c => c.id === pkg.categoryId)?.title || `Category #${pkg.categoryId}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => toggleEnabled(pkg)}
                    >
                      <span className={`text-xs font-bold ${pkg.enabled ? "text-green-600" : "text-red-500"}`}>
                        {pkg.enabled ? "ON" : "OFF"}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEditDialog(pkg)}
                    >
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setDeleteConfirm(pkg)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                {pkg.description && (
                  <p className="text-xs text-gray-400 italic mb-2">{pkg.description}</p>
                )}
                <div className="space-y-1">
                  {pkg.features.map((f, i) => (
                    <p key={i} className="text-xs text-gray-600">
                      {f.emoji} {f.text}
                    </p>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Order: {pkg.displayOrder}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Package" : "Add Package"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update this party package's details." : "Create a new party package."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Celebration Category *</Label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: parseInt(e.target.value) || 0 })}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value={0}>-- Select Category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.title}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Package Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Package Gold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Price Note</Label>
                <Input
                  value={formData.priceNote}
                  onChange={(e) => setFormData({ ...formData, priceNote: e.target.value })}
                  placeholder="before tax"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Short description of this package"
                rows={2}
              />
            </div>

            <div>
              <Label>Tier Color (hex)</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.tierColor}
                  onChange={(e) => setFormData({ ...formData, tierColor: e.target.value })}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={formData.tierColor}
                  onChange={(e) => setFormData({ ...formData, tierColor: e.target.value })}
                  placeholder="#C0C0C0"
                  className="flex-1"
                />
              </div>
            </div>

            <div>
              <Label>Tier Gradient CSS</Label>
              <Input
                value={formData.tierGradient}
                onChange={(e) => setFormData({ ...formData, tierGradient: e.target.value })}
                placeholder="linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 50%, #A8A8A8 100%)"
              />
              <div className="h-3 rounded mt-1" style={{ background: formData.tierGradient }} />
            </div>

            {/* Features */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Features</Label>
                <Button variant="outline" size="sm" onClick={addFeature}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {formData.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={feature.emoji}
                      onChange={(e) => updateFeature(idx, "emoji", e.target.value)}
                      className="w-14 text-center"
                      placeholder="🎈"
                    />
                    <Input
                      value={feature.text}
                      onChange={(e) => updateFeature(idx, "text", e.target.value)}
                      className="flex-1"
                      placeholder="Feature description"
                    />
                    {formData.features.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 flex-shrink-0"
                        onClick={() => removeFeature(idx)}
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: !!checked })}
                  />
                  <span className="text-sm font-medium">Enabled</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePackage} disabled={saving} style={{ backgroundColor: BRAND }}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Page Settings</DialogTitle>
            <DialogDescription>Customize the party packages page appearance.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Page Title</Label>
              <Input
                value={settings.pageTitle}
                onChange={(e) => setSettings({ ...settings, pageTitle: e.target.value })}
                placeholder="Celebrate Your Special Moments"
              />
            </div>
            <div>
              <Label>Page Subtitle</Label>
              <Input
                value={settings.pageSubtitle}
                onChange={(e) => setSettings({ ...settings, pageSubtitle: e.target.value })}
                placeholder="Customizable packages for every occasion"
              />
            </div>
            <div>
              <MenuImageUpload
                value={settings.bannerImage}
                onChange={(url) => setSettings({ ...settings, bannerImage: url })}
                customToken={customToken}
                label="Banner Image"
                context="Party Packages Banner"
                recommendedSize="1200 x 400 px"
                aspectRatio="3:1"
                maxSizeMB={5}
              />
            </div>
            <div>
              <Label>WhatsApp Booking Message</Label>
              <Textarea
                value={settings.bookingWhatsAppMessage}
                onChange={(e) => setSettings({ ...settings, bookingWhatsAppMessage: e.target.value })}
                placeholder="Hi! I'd like to book a party package."
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, enabled: !!checked })}
              />
              <span className="text-sm font-medium">Show on Home Page</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving} style={{ backgroundColor: BRAND }}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Package</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deletePackage(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}