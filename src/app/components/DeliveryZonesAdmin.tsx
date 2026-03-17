import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { MapPin, Plus, Trash2, Truck, AlertTriangle } from "lucide-react";
import type { DeliveryZonesConfig, DeliveryZone } from "../lib/delivery";
import { DEFAULT_DELIVERY_CONFIG } from "../lib/delivery";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function DeliveryZonesAdmin({ customToken }: { customToken: string | null }) {
  const [config, setConfig] = useState<DeliveryZonesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/delivery-zones`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await response.json();
      setConfig(data);
    } catch (error: any) {
      console.error("Error fetching delivery zones:", error);
      toast.error("Failed to load delivery zones");
      setConfig(DEFAULT_DELIVERY_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!customToken || !config) return;

    // Validate zones don't overlap and are continuous
    const sorted = [...config.zones].sort((a, b) => a.minKm - b.minKm);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].minKm >= sorted[i].maxKm) {
        toast.error(`Zone "${sorted[i].name}": min distance must be less than max distance`);
        return;
      }
      if (sorted[i].fee < 0) {
        toast.error(`Zone "${sorted[i].name}": fee cannot be negative`);
        return;
      }
    }

    // Validate max distance covers last zone
    const lastZone = sorted[sorted.length - 1];
    if (lastZone && lastZone.maxKm > config.maxDistance) {
      toast.error(`Last zone max (${lastZone.maxKm} km) exceeds max delivery distance (${config.maxDistance} km). Adjust zones or increase max distance.`);
      return;
    }

    setSaving(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/delivery-zones`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success("Delivery zones saved successfully!");
    } catch (error: any) {
      console.error("Error saving delivery zones:", error);
      toast.error(error.message || "Failed to save delivery zones");
    } finally {
      setSaving(false);
    }
  };

  const addZone = () => {
    if (!config) return;
    const sorted = [...config.zones].sort((a, b) => a.minKm - b.minKm);
    const lastMax = sorted.length > 0 ? sorted[sorted.length - 1].maxKm : 0;
    const newZone: DeliveryZone = {
      id: Date.now().toString(),
      name: `Zone ${config.zones.length + 1}`,
      minKm: lastMax,
      maxKm: lastMax + 5,
      fee: 20000,
    };
    setConfig({ ...config, zones: [...config.zones, newZone] });
  };

  const removeZone = (id: string) => {
    if (!config) return;
    if (config.zones.length <= 1) {
      toast.error("At least one zone is required");
      return;
    }
    setConfig({ ...config, zones: config.zones.filter((z) => z.id !== id) });
  };

  const updateZone = (id: string, field: keyof DeliveryZone, value: string | number) => {
    if (!config) return;
    setConfig({
      ...config,
      zones: config.zones.map((z) =>
        z.id === id ? { ...z, [field]: value } : z
      ),
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading delivery zones...</div>;
  }

  if (!config) return null;

  const sortedZones = [...config.zones].sort((a, b) => a.minKm - b.minKm);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Truck className="w-5 h-5" style={{ color: APP_CONFIG.brand.primaryColor }} />
          Delivery Zones
        </h2>
        <Button onClick={saveConfig} disabled={saving} style={{ backgroundColor: APP_CONFIG.brand.primaryColor }} className="text-white">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Restaurant Location */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <MapPin className="w-4 h-4" />
          Restaurant Location
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Set the GPS coordinates of your restaurant. You can find these from Google Maps.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Latitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={config.restaurantLocation.lat}
              onChange={(e) =>
                setConfig({
                  ...config,
                  restaurantLocation: {
                    ...config.restaurantLocation,
                    lat: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Longitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={config.restaurantLocation.lng}
              onChange={(e) =>
                setConfig({
                  ...config,
                  restaurantLocation: {
                    ...config.restaurantLocation,
                    lng: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="text-sm"
            />
          </div>
        </div>
      </Card>

      {/* Max Distance */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          Maximum Delivery Distance
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Orders beyond this distance will show "Delivery not available".
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            max="100"
            value={config.maxDistance}
            onChange={(e) =>
              setConfig({ ...config, maxDistance: parseFloat(e.target.value) || 1 })
            }
            className="w-24 text-sm"
          />
          <span className="text-sm text-gray-500">km</span>
        </div>
      </Card>

      {/* Zones */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">
            Delivery Tiers
          </h3>
          <Button size="sm" variant="outline" onClick={addZone} className="gap-1 text-xs">
            <Plus className="w-3.5 h-3.5" />
            Add Zone
          </Button>
        </div>

        <div className="space-y-3">
          {sortedZones.map((zone, index) => (
            <div
              key={zone.id}
              className="border rounded-lg p-3 bg-gray-50 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: APP_CONFIG.brand.primaryColor }}
                  >
                    {index + 1}
                  </div>
                  <Input
                    value={zone.name}
                    onChange={(e) => updateZone(zone.id, "name", e.target.value)}
                    className="w-32 h-8 text-sm font-medium"
                    placeholder="Zone name"
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeZone(zone.id)}
                  className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-gray-400">From (km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={zone.minKm}
                    onChange={(e) =>
                      updateZone(zone.id, "minKm", parseFloat(e.target.value) || 0)
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-400">To (km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={zone.maxKm}
                    onChange={(e) =>
                      updateZone(zone.id, "maxKm", parseFloat(e.target.value) || 0)
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-400">Fee (Rp)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={zone.fee}
                    onChange={(e) =>
                      updateZone(zone.id, "fee", parseFloat(e.target.value) || 0)
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-400">
                {zone.minKm}-{zone.maxKm} km = {formatIDR(zone.fee)}
              </p>
            </div>
          ))}
        </div>

        {sortedZones.length > 0 && (
          <div className="mt-4 p-3 bg-pink-50 rounded-lg border border-pink-100">
            <p className="text-xs font-medium" style={{ color: APP_CONFIG.brand.primaryColor }}>
              Zone Summary
            </p>
            <div className="mt-1 space-y-0.5">
              {sortedZones.map((zone) => (
                <p key={zone.id} className="text-[11px] text-gray-600">
                  {zone.name}: {zone.minKm}-{zone.maxKm} km = {formatIDR(zone.fee)}
                </p>
              ))}
              <p className="text-[11px] text-red-500 font-medium mt-1">
                Beyond {config.maxDistance} km: Delivery not available
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}