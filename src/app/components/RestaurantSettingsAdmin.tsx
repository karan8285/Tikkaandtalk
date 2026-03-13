import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { DeliveryZonesAdmin } from "./DeliveryZonesAdmin";
import { Input } from "./ui/input";
import { MessageCircle, Store, Info, MapPin, Image } from "lucide-react";

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
}

export function RestaurantSettingsAdmin({ customToken }: { customToken: string | null }) {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    if (!customToken) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/settings`, {
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
      const response = await fetch(`${API_BASE}/admin/settings`, {
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
              placeholder="e.g., Tikka N Talk"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="restaurant-tagline">Tagline</Label>
            <Input
              id="restaurant-tagline"
              value={settings.restaurantTagline}
              onChange={(e) => setSettings({ ...settings, restaurantTagline: e.target.value })}
              placeholder="e.g., AN INDIAN KITCHEN"
              className="mt-1"
            />
          </div>
          {!settings.restaurantName && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                When empty, the app uses the default name "Tikka N Talk". Set your restaurant name here to customize it across all pages.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Restaurant Logo */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Image className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Restaurant Logo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Set a custom logo URL. This replaces the default logo on the Home page.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="restaurant-logo-url">Logo Image URL</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Paste a direct link to your logo image (PNG, JPG, or SVG). Use a transparent background for best results.
            </p>
            <Input
              id="restaurant-logo-url"
              value={settings.restaurantLogoUrl}
              onChange={(e) => setSettings({ ...settings, restaurantLogoUrl: e.target.value })}
              placeholder="https://example.com/your-logo.png"
              className="mt-1"
            />
          </div>
          {settings.restaurantLogoUrl && (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs text-gray-600 font-medium mb-3">Preview:</p>
              <div className="flex justify-center" style={{ backgroundColor: "#FFF5F7" }}>
                <img
                  src={settings.restaurantLogoUrl}
                  alt="Logo preview"
                  className="max-w-[200px] max-h-[120px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    toast.error("Could not load logo image. Check the URL.");
                  }}
                />
              </div>
            </div>
          )}
          {!settings.restaurantLogoUrl && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                When empty, the app uses the default built-in logo. Paste a URL here to use your own custom logo.
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