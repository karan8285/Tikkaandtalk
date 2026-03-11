import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { DeliveryZonesAdmin } from "./DeliveryZonesAdmin";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface RestaurantSettings {
  acceptingOrders: boolean;
  maintenanceMode: boolean;
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

      {/* Delivery Zones */}
      <DeliveryZonesAdmin customToken={customToken} />
    </div>
  );
}