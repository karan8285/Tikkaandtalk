import { MessageCircle, Store, Info, MapPin, Image, Upload, Trash2, Loader2, SmilePlus, Globe, Smartphone, Star } from "lucide-react";
import { APP_CONFIG } from "../lib/config";
import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import { DeliveryZonesAdmin } from "./DeliveryZonesAdmin";
import { Input } from "./ui/input";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface RestaurantSettings {
  acceptingOrders: boolean;
  maintenanceMode: boolean;
  taxRate: number;
  whatsappNumber: string;
  whatsappDisplay: string;
  restaurantName: string;
  restaurantTagline: string;
  restaurantAddress: string;
  restaurantLogoUrl: string;
  mascotImageUrl: string;
  siteTitle: string;
  appShortName: string;
  faviconUrl: string;
}

export function RestaurantSettingsAdmin({ customToken }: { customToken: string | null }) {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  // Mascot image upload state
  const [mascotUploading, setMascotUploading] = useState(false);
  const [mascotDragOver, setMascotDragOver] = useState(false);
  const [mascotVersion, setMascotVersion] = useState(0);
  const [mascotLoadError, setMascotLoadError] = useState(false);
  const [mascotLocalPreview, setMascotLocalPreview] = useState<string | null>(null);
  // Favicon upload state
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconDragOver, setFaviconDragOver] = useState(false);
  const [faviconVersion, setFaviconVersion] = useState(0);
  const [faviconLoadError, setFaviconLoadError] = useState(false);
  const [faviconLocalPreview, setFaviconLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    if (!customToken) return;
    
    setLoading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/settings`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Settings API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch settings: ${response.status}`);
      }

      const data = await response.json();
      setSettings({
        acceptingOrders: data.acceptingOrders ?? true,
        maintenanceMode: data.maintenanceMode ?? false,
        taxRate: data.taxRate ?? 11,
        whatsappNumber: data.whatsappNumber ?? "",
        whatsappDisplay: data.whatsappDisplay ?? "",
        restaurantName: data.restaurantName ?? "",
        restaurantTagline: data.restaurantTagline ?? "",
        restaurantAddress: data.restaurantAddress ?? "",
        restaurantLogoUrl: data.restaurantLogoUrl ?? "",
        mascotImageUrl: data.mascotImageUrl ?? "",
        siteTitle: data.siteTitle ?? "",
        appShortName: data.appShortName ?? "",
        faviconUrl: data.faviconUrl ?? "",
      });
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      toast.error(`Failed to load settings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!customToken || !settings) return;
    
    setSaving(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!customToken) return;
    
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, SVG, WebP, or GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setUploading(true);
    try {
      // Show local preview immediately while uploading
      const objectUrl = URL.createObjectURL(file);
      setLocalPreview(objectUrl);
      setLogoLoadError(false);

      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetchWithRetry(`${API_BASE}/admin/upload-logo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await response.json();
      console.log("✅ Logo upload response:", data);
      // Use the signed URL directly from the upload response (most reliable)
      if (settings && data.logoUrl) {
        setSettings({ ...settings, restaurantLogoUrl: data.logoUrl });
      }
      setLogoLoadError(false);
      setLogoVersion((v) => v + 1); // Cache-bust the preview
      setLocalPreview(null); // Clear local preview, server URL will take over
      toast.success("Logo uploaded successfully!");
    } catch (error: any) {
      console.error("Logo upload error:", error);
      toast.error(`Failed to upload logo: ${error.message}`);
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!customToken) return;

    setUploading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/delete-logo`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete logo");
      }

      if (settings) {
        setSettings({ ...settings, restaurantLogoUrl: "" });
      }
      setLocalPreview(null);
      setLogoLoadError(false);
      toast.success("Logo removed. The default logo will be used.");
    } catch (error: any) {
      console.error("Logo delete error:", error);
      toast.error(`Failed to delete logo: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLogoUpload(file);
    e.target.value = ""; // Reset so same file can be re-selected
  };

  // ─── Mascot Image Upload/Delete ───────────────────────────────
  const handleMascotUpload = async (file: File) => {
    if (!customToken) return;
    
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, SVG, WebP, or GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setMascotUploading(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      setMascotLocalPreview(objectUrl);
      setMascotLoadError(false);

      const formData = new FormData();
      formData.append("mascot", file);

      const response = await fetchWithRetry(`${API_BASE}/admin/upload-mascot`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await response.json();
      console.log("Mascot upload response:", data);
      if (settings && data.mascotUrl) {
        setSettings({ ...settings, mascotImageUrl: data.mascotUrl });
      }
      setMascotLoadError(false);
      setMascotVersion((v) => v + 1);
      setMascotLocalPreview(null);
      // Update localStorage cache so Mascot component picks it up immediately
      try {
        localStorage.setItem("tikka_mascot_url", data.mascotUrl);
        window.dispatchEvent(new Event("restaurant-mascot-updated"));
      } catch {}
      toast.success("Mascot image uploaded successfully!");
    } catch (error: any) {
      console.error("Mascot upload error:", error);
      toast.error(`Failed to upload mascot: ${error.message}`);
      setMascotLocalPreview(null);
    } finally {
      setMascotUploading(false);
    }
  };

  const handleMascotDelete = async () => {
    if (!customToken) return;

    setMascotUploading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/delete-mascot`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete mascot");
      }

      if (settings) {
        setSettings({ ...settings, mascotImageUrl: "" });
      }
      setMascotLocalPreview(null);
      setMascotLoadError(false);
      // Clear localStorage cache
      try {
        localStorage.removeItem("tikka_mascot_url");
        window.dispatchEvent(new Event("restaurant-mascot-updated"));
      } catch {}
      toast.success("Mascot image removed. The default emoji will be used.");
    } catch (error: any) {
      console.error("Mascot delete error:", error);
      toast.error(`Failed to delete mascot: ${error.message}`);
    } finally {
      setMascotUploading(false);
    }
  };

  const handleMascotDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setMascotDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleMascotUpload(file);
  };

  const handleMascotFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleMascotUpload(file);
    e.target.value = "";
  };

  // ─── Favicon Upload/Delete ───────────────────────────────
  const handleFaviconUpload = async (file: File) => {
    if (!customToken) return;
    
    const allowedTypes = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/webp", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, ICO, SVG, WebP, JPG, or JPEG.");
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 1MB.");
      return;
    }

    setFaviconUploading(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      setFaviconLocalPreview(objectUrl);
      setFaviconLoadError(false);

      const formData = new FormData();
      formData.append("favicon", file);

      const response = await fetchWithRetry(`${API_BASE}/admin/upload-favicon`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await response.json();
      console.log("Favicon upload response:", data);
      if (settings && data.faviconUrl) {
        setSettings({ ...settings, faviconUrl: data.faviconUrl });
      }
      setFaviconLoadError(false);
      setFaviconVersion((v) => v + 1);
      setFaviconLocalPreview(null);
      toast.success("Favicon uploaded successfully!");
    } catch (error: any) {
      console.error("Favicon upload error:", error);
      toast.error(`Failed to upload favicon: ${error.message}`);
      setFaviconLocalPreview(null);
    } finally {
      setFaviconUploading(false);
    }
  };

  const handleFaviconDelete = async () => {
    if (!customToken) return;

    setFaviconUploading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/delete-favicon`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete favicon");
      }

      if (settings) {
        setSettings({ ...settings, faviconUrl: "" });
      }
      setFaviconLocalPreview(null);
      setFaviconLoadError(false);
      toast.success("Favicon removed. The default favicon will be used.");
    } catch (error: any) {
      console.error("Favicon delete error:", error);
      toast.error(`Failed to delete favicon: ${error.message}`);
    } finally {
      setFaviconUploading(false);
    }
  };

  const handleFaviconDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFaviconDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFaviconUpload(file);
  };

  const handleFaviconFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFaviconUpload(file);
    e.target.value = "";
  };

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>;
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Restaurant Settings</h2>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Quick Controls */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Controls</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="accepting-orders">Accepting Orders</Label>
              <p className="text-sm text-muted-foreground">Toggle to stop accepting new orders</p>
            </div>
            <Switch
              id="accepting-orders"
              checked={settings.acceptingOrders}
              onCheckedChange={(checked) => setSettings({ ...settings, acceptingOrders: checked })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="maintenance-mode">Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">Completely close the restaurant</p>
            </div>
            <Switch
              id="maintenance-mode"
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
            />
          </div>
        </div>
      </Card>

      {/* Restaurant Branding */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Restaurant Branding</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Set your restaurant name and tagline. These appear across the app.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="restaurant-name">Restaurant Name</Label>
            <Input
              id="restaurant-name"
              value={settings.restaurantName}
              onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })}
              placeholder={`e.g., ${APP_CONFIG.restaurant.name}`}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="restaurant-tagline">Tagline</Label>
            <Input
              id="restaurant-tagline"
              value={settings.restaurantTagline}
              onChange={(e) => setSettings({ ...settings, restaurantTagline: e.target.value })}
              placeholder={`e.g., ${APP_CONFIG.restaurant.tagline}`}
              className="mt-1"
            />
          </div>
          {!settings.restaurantName && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                When empty, the app uses the default name "{APP_CONFIG.restaurant.name}". Set your restaurant name here to customize it across all pages.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Browser Tab & Home Screen */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-semibold">Browser Tab & Home Screen</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customize the browser tab title, favicon, and the name shown when customers add the app to their home screen.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="site-title">Browser Tab Title</Label>
            <Input
              id="site-title"
              value={settings.siteTitle}
              onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
              placeholder={`e.g., ${settings.restaurantName || APP_CONFIG.restaurant.name} - ${settings.restaurantTagline || APP_CONFIG.restaurant.tagline}`}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The title shown in the browser tab. Leave empty to use "<strong>{settings.restaurantName || APP_CONFIG.restaurant.name} - {settings.restaurantTagline || APP_CONFIG.restaurant.tagline}</strong>".
            </p>
          </div>
          <div>
            <Label htmlFor="app-short-name">Home Screen App Name</Label>
            <Input
              id="app-short-name"
              value={settings.appShortName}
              onChange={(e) => setSettings({ ...settings, appShortName: e.target.value })}
              placeholder={settings.restaurantName || APP_CONFIG.restaurant.name}
              className="mt-1"
              maxLength={12}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Short name shown under the app icon on the home screen (max 12 characters). Leave empty to use "<strong>{settings.restaurantName || APP_CONFIG.restaurant.name}</strong>".
            </p>
          </div>

          {/* Favicon Upload Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-indigo-500" />
              <Label className="text-sm font-semibold">Favicon (Browser Tab Icon)</Label>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Upload a custom favicon that appears in the browser tab next to the page title. If not set, the restaurant logo is used instead.
            </p>

            {/* Favicon Specifications */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3">
              <p className="text-[11px] font-semibold text-indigo-700 mb-1.5">Image Specifications for Best Results:</p>
              <ul className="text-[11px] text-indigo-600 space-y-1 list-disc pl-4">
                <li><strong>Size:</strong> 32×32 px (minimum), 64×64 px or 128×128 px (recommended)</li>
                <li><strong>Format:</strong> PNG (recommended for transparency), ICO, SVG, or WebP</li>
                <li><strong>Shape:</strong> Square (1:1 aspect ratio) — non-square images will be distorted</li>
                <li><strong>Background:</strong> Transparent PNG preferred for a clean look</li>
                <li><strong>Design:</strong> Simple, recognizable icon — avoid text or fine details (it displays at 16×16 px in most tabs)</li>
                <li><strong>File size:</strong> Under 1 MB (smaller is better for fast loading)</li>
              </ul>
            </div>

            {/* Current favicon preview */}
            {(settings.faviconUrl || faviconLocalPreview) && (
              <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-200 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-600 font-medium">
                    {faviconLocalPreview && faviconUploading ? "Uploading..." : "Current Favicon:"}
                  </p>
                  {!faviconUploading && settings.faviconUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                      onClick={handleFaviconDelete}
                      disabled={faviconUploading}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4 p-3 rounded-md bg-white border border-gray-200">
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[9px] text-gray-400 uppercase">Actual Size</p>
                    <div className="w-4 h-4 bg-gray-100 rounded-sm flex items-center justify-center overflow-hidden">
                      {faviconLocalPreview ? (
                        <img src={faviconLocalPreview} alt="Favicon" className="w-4 h-4 object-contain" />
                      ) : (
                        <img
                          src={`${settings.faviconUrl}${settings.faviconUrl.includes("?") ? "&" : "?"}v=${faviconVersion}`}
                          alt="Favicon"
                          className="w-4 h-4 object-contain"
                          onLoad={() => setFaviconLoadError(false)}
                          onError={() => setFaviconLoadError(true)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[9px] text-gray-400 uppercase">Preview (32px)</p>
                    <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                      {faviconLocalPreview ? (
                        <img src={faviconLocalPreview} alt="Favicon" className="w-8 h-8 object-contain" />
                      ) : (
                        <img
                          src={`${settings.faviconUrl}${settings.faviconUrl.includes("?") ? "&" : "?"}v=${faviconVersion}`}
                          alt="Favicon"
                          className="w-8 h-8 object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[9px] text-gray-400 uppercase">Preview (64px)</p>
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {faviconLocalPreview ? (
                        <img src={faviconLocalPreview} alt="Favicon" className="w-16 h-16 object-contain" />
                      ) : (
                        <img
                          src={`${settings.faviconUrl}${settings.faviconUrl.includes("?") ? "&" : "?"}v=${faviconVersion}`}
                          alt="Favicon"
                          className="w-16 h-16 object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {faviconUploading && faviconLocalPreview && (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 className="animate-spin h-3.5 w-3.5 text-indigo-500" />
                    <p className="text-xs text-indigo-600">Saving to server...</p>
                  </div>
                )}
                {faviconLoadError && !faviconLocalPreview && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Info className="w-3.5 h-3.5 text-red-400" />
                    <p className="text-[11px] text-red-500">Could not load favicon preview. Try uploading again.</p>
                  </div>
                )}
              </div>
            )}

            {/* Favicon upload area */}
            <div
              className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                faviconUploading ? "pointer-events-none opacity-60" : ""
              } ${
                faviconDragOver
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
              } ${settings.faviconUrl ? "py-3" : "py-6"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setFaviconDragOver(true);
              }}
              onDragLeave={() => setFaviconDragOver(false)}
              onDrop={handleFaviconDrop}
              onClick={() => !faviconUploading && document.getElementById("favicon-upload")?.click()}
            >
              {faviconUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin h-6 w-6 text-indigo-500" />
                  <p className="text-sm text-indigo-600 font-medium">Uploading...</p>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                    <Upload className="h-4 w-4 text-indigo-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    {settings.faviconUrl ? "Replace favicon" : "Upload favicon"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Drag & drop or click to browse
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    PNG (recommended), ICO, SVG, WebP, JPG — max 1MB — Square image
                  </p>
                </>
              )}
              <input
                type="file"
                id="favicon-upload"
                className="hidden"
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp,image/jpeg,image/jpg"
                onChange={handleFaviconFileSelect}
              />
            </div>

            {!settings.faviconUrl && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 mt-3">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  No custom favicon uploaded. The <strong>restaurant logo</strong> will be used as the browser tab icon by default.
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Preview</p>
            <div className="space-y-3">
              {/* Browser tab preview */}
              <div>
                <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">Browser Tab</p>
                <div className="bg-white border border-gray-300 rounded-t-lg px-3 py-1.5 flex items-center gap-2 max-w-[280px]">
                  <div className="w-4 h-4 bg-gray-200 rounded-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(settings.faviconUrl || settings.restaurantLogoUrl) ? (
                      <img src={settings.faviconUrl || settings.restaurantLogoUrl} alt="" className="w-4 h-4 object-contain" />
                    ) : (
                      <Globe className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                  <span className="text-xs text-gray-700 truncate">
                    {settings.siteTitle || `${settings.restaurantName || APP_CONFIG.restaurant.name} - ${settings.restaurantTagline || APP_CONFIG.restaurant.tagline}`}
                  </span>
                </div>
              </div>
              {/* Home screen preview */}
              <div>
                <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">Home Screen Icon</p>
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <div className="w-14 h-14 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
                    {settings.restaurantLogoUrl ? (
                      <img src={settings.restaurantLogoUrl} alt="" className="w-12 h-12 object-contain" />
                    ) : (
                      <Smartphone className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-700 text-center leading-tight truncate w-full">
                    {settings.appShortName || settings.restaurantName || APP_CONFIG.restaurant.name}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              The <strong>restaurant logo</strong> is used as the home screen icon. If no custom favicon is uploaded above, the logo also serves as the browser tab icon. After updating, customers may need to re-add the app to their home screen for the new icon to appear.
            </p>
          </div>
        </div>
      </Card>

      {/* Restaurant Logo */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Image className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Restaurant Logo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your restaurant logo. This replaces the default logo across the app. Use a transparent background for best results.
        </p>
        <div className="space-y-4">
          {/* Current logo preview */}
          {(settings.restaurantLogoUrl || localPreview) && (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-600 font-medium">
                  {localPreview && uploading ? "Uploading..." : "Current Logo:"}
                </p>
                {!uploading && settings.restaurantLogoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                    onClick={handleLogoDelete}
                    disabled={uploading}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-md" style={{ backgroundColor: "#FFF5F7" }}>
                {localPreview ? (
                  <img
                    src={localPreview}
                    alt="Logo preview"
                    className="max-w-[200px] max-h-[120px] object-contain"
                  />
                ) : (
                  <>
                    <img
                      src={`${settings.restaurantLogoUrl}${settings.restaurantLogoUrl.includes("?") ? "&" : "?"}v=${logoVersion}`}
                      alt="Logo preview"
                      className="max-w-[200px] max-h-[120px] object-contain"
                      onLoad={() => setLogoLoadError(false)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        setLogoLoadError(true);
                        console.error("Logo preview failed to load:", settings.restaurantLogoUrl);
                      }}
                    />
                    {logoLoadError && (
                      <div className="flex flex-col items-center gap-1 py-2">
                        <Info className="w-4 h-4 text-red-400" />
                        <p className="text-xs text-red-500 text-center">
                          Could not load logo preview. Try uploading again.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {uploading && localPreview && (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 className="animate-spin h-3.5 w-3.5 text-purple-500" />
                    <p className="text-xs text-purple-600">Saving to server...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload area */}
          <div
            className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
              uploading ? "pointer-events-none opacity-60" : ""
            } ${
              dragOver
                ? "border-purple-500 bg-purple-50"
                : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
            } ${settings.restaurantLogoUrl ? "py-4" : "py-8"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById("logo-upload")?.click()}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="animate-spin h-8 w-8 text-purple-500" />
                <p className="text-sm text-purple-600 font-medium">Uploading...</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Upload className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  {settings.restaurantLogoUrl ? "Replace logo" : "Upload your logo"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Drag & drop or click to browse
                </p>
                <p className="text-[10px] text-gray-400 mt-2">
                  PNG, JPG, SVG, WebP, GIF — max 5MB
                </p>
              </>
            )}
            <input
              type="file"
              id="logo-upload"
              className="hidden"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,image/gif"
              onChange={handleFileSelect}
            />
          </div>

          {!settings.restaurantLogoUrl && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                No logo uploaded yet. The app will use the default built-in logo until you upload one.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Mascot Image */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <SmilePlus className="w-5 h-5 text-amber-600" />
          <h3 className="text-lg font-semibold">Mascot Image</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a custom mascot/chef character image. This appears as the friendly helper across all pages. Use a transparent PNG for best results.
        </p>
        <div className="space-y-4">
          {/* Current mascot preview */}
          {(settings.mascotImageUrl || mascotLocalPreview) && (
            <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-600 font-medium">
                  {mascotLocalPreview && mascotUploading ? "Uploading..." : "Current Mascot:"}
                </p>
                {!mascotUploading && settings.mascotImageUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                    onClick={handleMascotDelete}
                    disabled={mascotUploading}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-md" style={{ backgroundColor: "#FFF8F0" }}>
                {mascotLocalPreview ? (
                  <img
                    src={mascotLocalPreview}
                    alt="Mascot preview"
                    className="max-w-[150px] max-h-[150px] object-contain"
                  />
                ) : (
                  <>
                    <img
                      src={`${settings.mascotImageUrl}${settings.mascotImageUrl.includes("?") ? "&" : "?"}v=${mascotVersion}`}
                      alt="Mascot preview"
                      className="max-w-[150px] max-h-[150px] object-contain"
                      onLoad={() => setMascotLoadError(false)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        setMascotLoadError(true);
                        console.error("Mascot preview failed to load:", settings.mascotImageUrl);
                      }}
                    />
                    {mascotLoadError && (
                      <div className="flex flex-col items-center gap-1 py-2">
                        <Info className="w-4 h-4 text-red-400" />
                        <p className="text-xs text-red-500 text-center">
                          Could not load mascot preview. Try uploading again.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {mascotUploading && mascotLocalPreview && (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 className="animate-spin h-3.5 w-3.5 text-amber-500" />
                    <p className="text-xs text-amber-600">Saving to server...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload area */}
          <div
            className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
              mascotUploading ? "pointer-events-none opacity-60" : ""
            } ${
              mascotDragOver
                ? "border-amber-500 bg-amber-50"
                : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
            } ${settings.mascotImageUrl ? "py-4" : "py-8"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setMascotDragOver(true);
            }}
            onDragLeave={() => setMascotDragOver(false)}
            onDrop={handleMascotDrop}
            onClick={() => !mascotUploading && document.getElementById("mascot-upload")?.click()}
          >
            {mascotUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="animate-spin h-8 w-8 text-amber-500" />
                <p className="text-sm text-amber-600 font-medium">Uploading...</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                  <Upload className="h-5 w-5 text-amber-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  {settings.mascotImageUrl ? "Replace mascot image" : "Upload mascot image"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Drag & drop or click to browse
                </p>
                <p className="text-[10px] text-gray-400 mt-2">
                  PNG, JPG, SVG, WebP, GIF — max 5MB. Transparent PNG recommended.
                </p>
              </>
            )}
            <input
              type="file"
              id="mascot-upload"
              className="hidden"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,image/gif"
              onChange={handleMascotFileSelect}
            />
          </div>

          {!settings.mascotImageUrl && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                No mascot image uploaded yet. The app will show a chef emoji (👨‍🍳) as the default mascot until you upload a custom image.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Restaurant Address */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold">Restaurant Address</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Set your restaurant address. This appears in the Home page footer.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="restaurant-address">Full Address</Label>
            <textarea
              id="restaurant-address"
              value={settings.restaurantAddress}
              onChange={(e) => setSettings({ ...settings, restaurantAddress: e.target.value })}
              placeholder="e.g., Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
            />
          </div>
          {!settings.restaurantAddress && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                When empty, the app uses the default hardcoded address. Set your address here to display the correct one on the Home page.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* WhatsApp Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-semibold">WhatsApp Configuration</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Set your WhatsApp number for customer communication. This is used for order inquiries, support, and PIN reset requests.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="whatsapp-number">WhatsApp Number (International Format)</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Digits only, with country code, no + sign. Example: 628192515550
            </p>
            <Input
              id="whatsapp-number"
              value={settings.whatsappNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setSettings({ ...settings, whatsappNumber: val });
              }}
              placeholder="628192515550"
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="whatsapp-display">Display Format</Label>
            <p className="text-xs text-muted-foreground mb-1">
              How the number appears to customers. Example: +62 819-2515-550
            </p>
            <Input
              id="whatsapp-display"
              value={settings.whatsappDisplay}
              onChange={(e) => setSettings({ ...settings, whatsappDisplay: e.target.value })}
              placeholder="+62 819-2515-550"
              className="mt-1"
            />
          </div>
          {settings.whatsappNumber && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-xs text-green-700 font-medium mb-1">Preview:</p>
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-700 underline"
              >
                wa.me/{settings.whatsappNumber}
              </a>
            </div>
          )}
          {!settings.whatsappNumber && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                When empty, the app uses the default hardcoded WhatsApp number. Set your number here to use the correct one across all pages.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Tax Configuration */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Tax Configuration</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tax-rate">Tax Rate (PPN %)</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Set the tax percentage applied to all orders. Enter 0 to disable tax.
            </p>
            <div className="flex items-center gap-3">
              <div className="relative w-32">
                <Input
                  id="tax-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={settings.taxRate}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 100) {
                      setSettings({ ...settings, taxRate: val });
                    }
                  }}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">%</span>
              </div>
              <div className="flex gap-2">
                {[0, 5, 10, 11, 15].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setSettings({ ...settings, taxRate: rate })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      settings.taxRate === rate
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
            {settings.taxRate === 0 && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                Warning: Tax is currently disabled. No tax will be applied to orders.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Delivery Zones */}
      <DeliveryZonesAdmin customToken={customToken} />
    </div>
  );
}