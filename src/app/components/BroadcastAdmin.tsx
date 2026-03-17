/**
 * BroadcastAdmin — Admin panel for managing broadcast messages on the Home page.
 * Supports creating, editing, deleting broadcasts with customizable icons,
 * colors, scheduling (start/end time), priority ordering, and optional URLs.
 * Also allows configuring the auto-scroll interval.
 */
import { useState, useEffect, useCallback } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { toast } from "sonner";
import {
  Megaphone, Plus, Trash2, RefreshCw, Edit3, Save, X, ExternalLink,
  Clock, ChevronRight, AlertCircle, Loader2, Settings2, Eye, EyeOff, GripVertical,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { APP_CONFIG } from "../lib/config";
import { fetchWithRetry } from "../lib/fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

// Predefined icon options for broadcasts
const ICON_OPTIONS = [
  { emoji: "📢", label: "Megaphone" },
  { emoji: "🎉", label: "Celebration" },
  { emoji: "🔥", label: "Fire/Hot" },
  { emoji: "⭐", label: "Star" },
  { emoji: "💰", label: "Money" },
  { emoji: "🎁", label: "Gift" },
  { emoji: "🍽️", label: "Dining" },
  { emoji: "🍕", label: "Pizza" },
  { emoji: "🍛", label: "Curry" },
  { emoji: "🥘", label: "Pot of Food" },
  { emoji: "🎊", label: "Confetti" },
  { emoji: "💯", label: "100" },
  { emoji: "🆕", label: "New" },
  { emoji: "⏰", label: "Alarm Clock" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "💝", label: "Heart Gift" },
  { emoji: "🏷️", label: "Price Tag" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "🎯", label: "Target" },
  { emoji: "📌", label: "Pin" },
  { emoji: "🔔", label: "Bell" },
  { emoji: "💡", label: "Light Bulb" },
  { emoji: "⚡", label: "Lightning" },
  { emoji: "🌟", label: "Glowing Star" },
];

// Predefined color presets
const COLOR_PRESETS = [
  { bg: "#FFF0F5", text: "#9B1B5A", label: "Rose Pink" },
  { bg: "#FFF8E1", text: "#E65100", label: "Warm Amber" },
  { bg: "#E8F5E9", text: "#1B5E20", label: "Fresh Green" },
  { bg: "#E3F2FD", text: "#1565C0", label: "Sky Blue" },
  { bg: "#F3E5F5", text: "#6A1B9A", label: "Lavender" },
  { bg: "#FBE9E7", text: "#BF360C", label: "Coral" },
  { bg: "#E0F7FA", text: "#00695C", label: "Teal" },
  { bg: "#FFFDE7", text: "#F57F17", label: "Sunshine" },
];

interface Broadcast {
  id: string;
  message: string;
  icon: string;
  bgColor: string;
  textColor: string;
  url: string;
  startAt: string;
  endAt: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

interface BroadcastForm {
  message: string;
  icon: string;
  bgColor: string;
  textColor: string;
  url: string;
  startAt: string;
  endAt: string;
  priority: number;
  active: boolean;
}

const emptyForm: BroadcastForm = {
  message: "",
  icon: "📢",
  bgColor: "#FFF0F5",
  textColor: "#9B1B5A",
  url: "",
  startAt: "",
  endAt: "",
  priority: 0,
  active: true,
};

function toLocalDatetimeStr(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeStr(localStr: string): string {
  if (!localStr) return "";
  return new Date(localStr).toISOString();
}

export function BroadcastAdmin({ customToken }: { customToken: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BroadcastForm>(emptyForm);
  const [scrollInterval, setScrollInterval] = useState(7);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const headers = {
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
    "Content-Type": "application/json",
  };

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/broadcasts`, { headers });
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts || []);
        if (data.settings?.scrollInterval) setScrollInterval(data.settings.scrollInterval);
      } else {
        toast.error("Failed to load broadcasts");
      }
    } catch (error) {
      toast.error("Network error loading broadcasts");
    } finally {
      setLoading(false);
    }
  }, [customToken]);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEditDialog = (broadcast: Broadcast) => {
    setEditingId(broadcast.id);
    setForm({
      message: broadcast.message,
      icon: broadcast.icon,
      bgColor: broadcast.bgColor,
      textColor: broadcast.textColor,
      url: broadcast.url || "",
      startAt: toLocalDatetimeStr(broadcast.startAt),
      endAt: toLocalDatetimeStr(broadcast.endAt),
      priority: broadcast.priority,
      active: broadcast.active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.message.trim()) {
      toast.error("Message is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        startAt: form.startAt ? fromLocalDatetimeStr(form.startAt) : new Date().toISOString(),
        endAt: form.endAt ? fromLocalDatetimeStr(form.endAt) : "",
      };

      let res;
      if (editingId) {
        res = await fetchWithRetry(`${API_BASE}/admin/broadcasts/${editingId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetchWithRetry(`${API_BASE}/admin/broadcasts`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        toast.success(editingId ? "Broadcast updated!" : "Broadcast created!");
        setShowDialog(false);
        fetchBroadcasts();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save broadcast");
      }
    } catch (error) {
      toast.error("Network error saving broadcast");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/broadcasts/${id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        toast.success("Broadcast deleted");
        setDeleteConfirm(null);
        fetchBroadcasts();
      } else {
        toast.error("Failed to delete broadcast");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleToggleActive = async (broadcast: Broadcast) => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/broadcasts/${broadcast.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ active: !broadcast.active }),
      });
      if (res.ok) {
        toast.success(broadcast.active ? "Broadcast paused" : "Broadcast activated");
        fetchBroadcasts();
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/broadcast-settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ scrollInterval }),
      });
      if (res.ok) {
        toast.success("Scroll interval saved!");
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingSettings(false);
    }
  };

  const getBroadcastStatus = (b: Broadcast): { label: string; color: string } => {
    if (!b.active) return { label: "Paused", color: "bg-gray-100 text-gray-600" };
    const now = new Date();
    if (b.startAt && new Date(b.startAt) > now) return { label: "Scheduled", color: "bg-blue-100 text-blue-700" };
    if (b.endAt && new Date(b.endAt) < now) return { label: "Expired", color: "bg-red-100 text-red-700" };
    return { label: "Live", color: "bg-green-100 text-green-700" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
            <Megaphone className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Broadcast Messages</h2>
            <p className="text-sm text-gray-500">Manage banners shown on the Home page</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchBroadcasts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={openCreateDialog} style={{ backgroundColor: BRAND }}>
            <Plus className="w-4 h-4 mr-1" /> New Broadcast
          </Button>
        </div>
      </div>

      {/* Scroll Interval Setting */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Settings2 className="w-5 h-5 text-gray-500" />
          <div className="flex-1">
            <Label className="text-sm font-semibold">Auto-Scroll Interval</Label>
            <p className="text-xs text-gray-500">How many seconds each broadcast is shown before scrolling to the next</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={3}
              max={30}
              value={scrollInterval}
              onChange={(e) => setScrollInterval(Number(e.target.value))}
              className="w-20 text-center"
            />
            <span className="text-sm text-gray-500">sec</span>
            <Button size="sm" variant="outline" onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </Card>

      {/* Broadcasts List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : broadcasts.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-600">No Broadcasts Yet</h3>
          <p className="text-sm text-gray-400 mb-4">Create your first broadcast message to display on the Home page</p>
          <Button onClick={openCreateDialog} style={{ backgroundColor: BRAND }}>
            <Plus className="w-4 h-4 mr-1" /> Create Broadcast
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => {
            const status = getBroadcastStatus(b);
            return (
              <Card key={b.id} className="overflow-hidden">
                {/* Preview Banner */}
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ backgroundColor: b.bgColor, color: b.textColor }}
                >
                  <span className="text-2xl flex-shrink-0">{b.icon}</span>
                  <p className="text-sm font-medium flex-1 leading-snug">
                    {renderBoldText(b.message)}
                  </p>
                  {b.url && <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between px-4 py-3 bg-white border-t">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
                    {b.endAt && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Ends: {new Date(b.endAt).toLocaleDateString()} {new Date(b.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {b.url && (
                      <span className="text-xs text-blue-500 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        Has link
                      </span>
                    )}
                    <span className="text-xs text-gray-400">Priority: {b.priority}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(b)}
                      title={b.active ? "Pause" : "Activate"}
                    >
                      {b.active ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-green-600" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(b)}>
                      <Edit3 className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(b.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Broadcast" : "Create Broadcast"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update this broadcast message" : "Create a new broadcast message for the Home page"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Message *</Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="e.g. **20% OFF** on all orders this weekend! Use code **WEEKEND20**"
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-gray-400">Wrap text in **double asterisks** to make it bold</p>
            </div>

            {/* Icon Selection */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.emoji}
                    onClick={() => setForm({ ...form, icon: opt.emoji })}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all border-2 ${
                      form.icon === opt.emoji
                        ? "border-current shadow-md scale-110"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    style={form.icon === opt.emoji ? { borderColor: BRAND } : {}}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Presets */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Color Theme</Label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setForm({ ...form, bgColor: preset.bg, textColor: preset.text })}
                    className={`rounded-lg p-2 text-center transition-all border-2 ${
                      form.bgColor === preset.bg && form.textColor === preset.text
                        ? "ring-2 ring-offset-1 scale-105"
                        : "border-transparent"
                    }`}
                    style={{
                      backgroundColor: preset.bg,
                      color: preset.text,
                      ...(form.bgColor === preset.bg && form.textColor === preset.text ? { ringColor: BRAND } : {}),
                    }}
                  >
                    <span className="text-xs font-semibold">{preset.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Background</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.bgColor}
                      onChange={(e) => setForm({ ...form, bgColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={form.bgColor}
                      onChange={(e) => setForm({ ...form, bgColor: e.target.value })}
                      className="flex-1 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Text</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.textColor}
                      onChange={(e) => setForm({ ...form, textColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={form.textColor}
                      onChange={(e) => setForm({ ...form, textColor: e.target.value })}
                      className="flex-1 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Preview</Label>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: form.bgColor }}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ color: form.textColor }}
                >
                  <span className="text-2xl flex-shrink-0">{form.icon}</span>
                  <p className="text-sm font-medium flex-1 leading-snug">
                    {form.message ? renderBoldText(form.message) : <span className="opacity-50">Your message here...</span>}
                  </p>
                  {form.url && <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />}
                </div>
              </div>
            </div>

            {/* URL (Optional) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Link URL (Optional)</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="e.g. /flash-sale or https://example.com"
              />
              <p className="text-xs text-gray-400">If provided, tapping the banner will navigate to this URL</p>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Start Time</Label>
                <Input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
                <p className="text-xs text-gray-400">Leave empty = now</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">End Time</Label>
                <Input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
                <p className="text-xs text-gray-400">Leave empty = no expiry</p>
              </div>
            </div>

            {/* Priority & Active */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm font-semibold">Priority</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  className="w-24"
                />
                <p className="text-xs text-gray-400">Lower = shown first</p>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                />
                <Label className="text-sm">{form.active ? "Active" : "Paused"}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" /> Delete Broadcast
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this broadcast? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to render **bold** text
function renderBoldText(msg: string) {
  const parts = msg.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <span key={i} className="font-bold">{part.slice(2, -2)}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}