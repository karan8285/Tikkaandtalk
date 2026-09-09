import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { APP_CONFIG } from "../lib/config";
import { clearTierCache, type Tier } from "../lib/tiers";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Award, Plus, Trash2, GripVertical, RotateCcw, Users, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface TierConfigAdminProps {
  customToken: string;
}

interface RetierResult {
  dryRun: boolean;
  totalUsers: number;
  changed: number;
  unchanged: number;
  backfilled: number;
  promoted: number;
  demoted: number;
  sample: Array<{ userId: string; name?: string; from: string; to: string; lifetime: number }>;
}

/** A blank row for a newly added tier. */
function emptyTier(): Tier {
  return { name: "", minLifetimePoints: 0, color: "#6B7280" };
}

export function TierConfigAdmin({ customToken }: TierConfigAdminProps) {
  const [rows, setRows] = useState<Tier[]>([]);
  const [serverRows, setServerRows] = useState<Tier[]>([]);
  const [defaults, setDefaults] = useState<Tier[]>([]);
  const [isCustomised, setIsCustomised] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retiering, setRetiering] = useState(false);
  const [preview, setPreview] = useState<RetierResult | null>(null);
  const [confirmRetier, setConfirmRetier] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/tier-config`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load tiers");
      setRows(data.tiers ?? []);
      setServerRows(data.tiers ?? []);
      setDefaults(data.defaults ?? []);
      setIsCustomised(!!data.isCustomised);
    } catch (error: any) {
      toast.error(error?.message || "Could not load the tier ladder");
    } finally {
      setLoading(false);
    }
  }

  const dirty = JSON.stringify(rows) !== JSON.stringify(serverRows);

  function update(index: number, patch: Partial<Tier>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setPreview(null);
  }

  function addTier() {
    const highest = rows.reduce((max, r) => Math.max(max, r.minLifetimePoints), 0);
    setRows((prev) => [...prev, { ...emptyTier(), minLifetimePoints: highest + 5000 }]);
    setPreview(null);
  }

  function removeTier(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
  }

  /** Validation mirrors the server's, so a save is not round-tripped just to be rejected. */
  function validate(candidate: Tier[]): string | null {
    if (candidate.length === 0) return "You need at least one tier.";
    if (candidate.some((r) => !r.name.trim())) return "Every tier needs a name.";

    const names = candidate.map((r) => r.name.trim().toLowerCase());
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) return `Two tiers are both called "${dupe}". Names must be unique.`;

    const sorted = [...candidate].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
    if (sorted[0].minLifetimePoints !== 0) {
      return `The entry tier ("${sorted[0].name}") must start at 0 points — every customer needs a tier.`;
    }
    const clash = sorted.find(
      (r, i) => i > 0 && r.minLifetimePoints === sorted[i - 1].minLifetimePoints
    );
    if (clash) return `"${clash.name}" has the same threshold as the tier below it.`;
    return null;
  }

  const validationError = validate(rows);

  async function save() {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/tier-config`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ tiers: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");

      clearTierCache();
      setRows(data.tiers);
      setServerRows(data.tiers);
      setIsCustomised(true);

      if (data.removedTiers?.length && (data.orphanedVouchers || data.orphanedBenefits)) {
        toast.warning(
          `Saved. ${data.orphanedVouchers} voucher(s) and ${data.orphanedBenefits} benefit(s) still target the removed tier(s): ${data.removedTiers.join(", ")}. Re-point them or they will reach nobody.`,
          { duration: 12000 }
        );
      } else {
        toast.success("Tier ladder saved. Run Re-tier customers to apply it to existing accounts.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not save the tier ladder");
    } finally {
      setSaving(false);
    }
  }

  async function runRetier(dryRun: boolean) {
    setRetiering(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/retier-all?dryRun=${dryRun}`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Re-tier failed");
      setPreview(data);
      if (dryRun) {
        toast.success(`Preview ready: ${data.changed} of ${data.totalUsers} customers would change tier.`);
      } else {
        toast.success(`Re-tiered ${data.changed} customer(s). ${data.promoted} promoted, ${data.demoted} demoted.`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not re-tier customers");
    } finally {
      setRetiering(false);
      setConfirmRetier(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">Loading tier ladder…</Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Award className="w-5 h-5" style={{ color: BRAND }} />
            Tier Ladder
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Tiers are earned on <strong>lifetime points</strong>, so redeeming points never demotes
            a customer. Voucher targeting means <strong>this tier and above</strong>.
          </p>
        </div>
        <Badge variant={isCustomised ? "default" : "outline"} className="text-xs">
          {isCustomised ? "Customised" : "Using defaults"}
        </Badge>
      </div>

      <Card className="p-4">
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-3 flex-wrap sm:flex-nowrap">
              <GripVertical className="w-4 h-4 text-muted-foreground mb-3 flex-shrink-0" />

              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Tier name</Label>
                <Input
                  value={row.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="e.g. VIP Member"
                />
              </div>

              <div className="w-full sm:w-40">
                <Label className="text-xs">
                  {index === 0 ? "Starts at (entry tier)" : "Lifetime points needed"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={row.minLifetimePoints}
                  disabled={index === 0}
                  onChange={(e) =>
                    update(index, { minLifetimePoints: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                />
              </div>

              <div className="w-24">
                <Label className="text-xs">Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${row.name || "Tier"} colour`}
                    value={row.color}
                    onChange={(e) => update(index, { color: e.target.value })}
                    className="h-9 w-9 rounded border cursor-pointer bg-transparent"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{row.color}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => removeTier(index)}
                disabled={rows.length <= 1}
                title={rows.length <= 1 ? "You need at least one tier" : "Remove this tier"}
                className="mb-0.5"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="w-4 h-4 mr-1" /> Add tier
          </Button>
          {defaults.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRows(defaults);
                setPreview(null);
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Reset to defaults
            </Button>
          )}
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRows(serverRows);
                setPreview(null);
              }}
            >
              Discard changes
            </Button>
          )}
        </div>

        {validationError && (
          <p className="text-sm text-destructive mt-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {validationError}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Button onClick={save} disabled={saving || !dirty || !!validationError}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving…" : "Save ladder"}
          </Button>
          {dirty && !validationError && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: BRAND }} />
          Apply to existing customers
        </h4>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Saving the ladder does not move anyone on its own. This recomputes every customer's
          stored tier against the current ladder, fills in lifetime totals for older accounts, and
          issues any tier vouchers they have newly become eligible for. Preview first.
        </p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => runRetier(true)} disabled={retiering || dirty}>
            {retiering ? "Working…" : "Preview changes"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setConfirmRetier(true)}
            disabled={retiering || dirty || !preview}
          >
            Re-tier customers
          </Button>
          {dirty && (
            <span className="text-xs text-muted-foreground">Save the ladder first</span>
          )}
          {!dirty && !preview && (
            <span className="text-xs text-muted-foreground">Run a preview to enable</span>
          )}
        </div>

        {preview && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex gap-4 flex-wrap text-sm">
              <span><strong>{preview.totalUsers}</strong> customers</span>
              <span><strong>{preview.changed}</strong> would change</span>
              <span className="text-emerald-600"><strong>{preview.promoted}</strong> promoted</span>
              <span className="text-amber-600"><strong>{preview.demoted}</strong> demoted</span>
              <span className="text-muted-foreground"><strong>{preview.backfilled}</strong> backfilled</span>
            </div>

            {preview.sample.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-3">Customer</th>
                      <th className="py-1 pr-3">Lifetime pts</th>
                      <th className="py-1 pr-3">From</th>
                      <th className="py-1">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((change) => (
                      <tr key={change.userId} className="border-b last:border-0">
                        <td className="py-1 pr-3">{change.name || change.userId.slice(0, 8)}</td>
                        <td className="py-1 pr-3 tabular-nums">{change.lifetime.toLocaleString()}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{change.from}</td>
                        <td className="py-1 font-semibold">{change.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.changed > preview.sample.length && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing the first {preview.sample.length} of {preview.changed} changes.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <AlertDialog open={confirmRetier} onOpenChange={setConfirmRetier}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-tier all customers?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview
                ? `This will change the tier of ${preview.changed} customer(s) — ${preview.promoted} promoted and ${preview.demoted} demoted — and cannot be undone automatically. Demoted customers will see their badge drop in the app.`
                : "This rewrites every customer's stored tier and cannot be undone automatically."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runRetier(false)}>
              Re-tier {preview?.changed ?? ""} customer(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
