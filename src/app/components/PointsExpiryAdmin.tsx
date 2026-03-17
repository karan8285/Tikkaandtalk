/**
 * PointsExpiryAdmin — Admin component for configuring points expiry rules.
 * Supports earned-date, fixed-date, and rolling-window expiry models.
 */
import { useState, useEffect } from "react";
import { APP_CONFIG } from "../lib/config";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { toast } from "sonner";
import {
  Clock, Save, Loader2, RefreshCw, AlertTriangle, Users,
  Calendar, Timer, Activity, Bell, Zap, TrendingDown, Info, RotateCcw,
} from "lucide-react";
import { formatIDR } from "../lib/currency";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface ExpiryConfig {
  enabled: boolean;
  expiryModel: "earned_date" | "fixed_date" | "rolling_window";
  expiryMonths: number;
  fixedExpiryMonth: number;
  fixedExpiryDay: number;
  rollingWindowMonths: number;
  warningEnabled: boolean;
  warningDaysBefore: number;
  applyToExisting: boolean;
}

interface ExpiryReport {
  config: ExpiryConfig;
  summary: {
    totalActivePoints: number;
    totalExpiredPoints: number;
    totalSoonToExpire: number;
    usersWithPoints: number;
  };
  users: Array<{
    userId: string;
    name: string;
    phone: string;
    activePoints: number;
    expiredPoints: number;
    soonToExpire: number;
    nearestExpiry: string | null;
    currentBalance: number;
  }>;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function PointsExpiryAdmin({ customToken }: { customToken: string }) {
  const [config, setConfig] = useState<ExpiryConfig>({
    enabled: false,
    expiryModel: "earned_date",
    expiryMonths: 12,
    fixedExpiryMonth: 12,
    fixedExpiryDay: 31,
    rollingWindowMonths: 6,
    warningEnabled: true,
    warningDaysBefore: 14,
    applyToExisting: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "report">("config");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/points-expiry-config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e: any) {
      console.error("Fetch expiry config error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/points-expiry-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Points expiry configuration saved!");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save configuration");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const fetchReport = async () => {
    try {
      setLoadingReport(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/points-expiry-report`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        toast.error("Failed to load report");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load report");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleProcessAll = async () => {
    if (!confirm("This will process points expiry for ALL customers. Continue?")) return;
    try {
      setProcessing(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/process-all-points-expiry`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Processed! ${data.totalExpired} points expired for ${data.usersAffected} users. ${data.usersWarned} warned.`
        );
        fetchReport(); // Refresh report
      } else {
        toast.error(data.error || "Failed to process expiry");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to process");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
        <p className="text-sm text-muted-foreground">Loading configuration...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
            <Clock className="w-4 h-4" style={{ color: BRAND }} />
          </div>
          <div>
            <h3 className="font-bold text-sm">Points Expiry</h3>
            <p className="text-[10px] text-muted-foreground">Configure when loyalty points expire</p>
          </div>
        </div>
        <Badge
          className={`text-xs ${config.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
        >
          {config.enabled ? "Active" : "Disabled"}
        </Badge>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        {(["config", "report"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "report" && !report) fetchReport();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? "text-white shadow-md"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={activeTab === tab ? { backgroundColor: BRAND } : {}}
          >
            {tab === "config" ? "Configuration" : "Expiry Report"}
          </button>
        ))}
      </div>

      {activeTab === "config" && (
        <div className="space-y-4">
          {/* Enable/Disable */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5" style={{ color: config.enabled ? BRAND : "#9CA3AF" }} />
                <div>
                  <p className="font-semibold text-sm">Enable Points Expiry</p>
                  <p className="text-[10px] text-muted-foreground">
                    When enabled, points will expire based on the rules below
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig(c => ({ ...c, enabled: checked }))}
              />
            </div>
          </Card>

          {config.enabled && (
            <>
              {/* Expiry Model */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="w-4 h-4" style={{ color: BRAND }} />
                  <p className="font-semibold text-sm">Expiry Model</p>
                </div>

                <div className="grid gap-2">
                  {([
                    {
                      key: "earned_date" as const,
                      icon: Calendar,
                      title: "Earned Date",
                      desc: "Points expire X months after they were earned",
                    },
                    {
                      key: "fixed_date" as const,
                      icon: Clock,
                      title: "Fixed Date",
                      desc: "All points expire on a specific date each year",
                    },
                    {
                      key: "rolling_window" as const,
                      icon: Activity,
                      title: "Rolling Window",
                      desc: "Points expire X months after last activity (any order extends all points)",
                    },
                  ]).map(model => (
                    <button
                      key={model.key}
                      onClick={() => setConfig(c => ({ ...c, expiryModel: model.key }))}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        config.expiryModel === model.key
                          ? "shadow-md"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      style={config.expiryModel === model.key ? { borderColor: BRAND, backgroundColor: `${BRAND}05` } : {}}
                    >
                      <model.icon
                        className="w-5 h-5 mt-0.5 flex-shrink-0"
                        style={{ color: config.expiryModel === model.key ? BRAND : "#9CA3AF" }}
                      />
                      <div>
                        <p className="text-sm font-semibold">{model.title}</p>
                        <p className="text-[10px] text-muted-foreground">{model.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Model-specific settings */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-4 h-4" style={{ color: BRAND }} />
                  <p className="font-semibold text-sm">Expiry Duration</p>
                </div>

                {config.expiryModel === "earned_date" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Points expire after (months)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={config.expiryMonths}
                      onChange={e => setConfig(c => ({ ...c, expiryMonths: parseInt(e.target.value) || 12 }))}
                      className="w-32"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      e.g., points earned today expire in {config.expiryMonths} month{config.expiryMonths !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}

                {config.expiryModel === "fixed_date" && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      All points expire on this date each year
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px]">Month</Label>
                        <select
                          value={config.fixedExpiryMonth}
                          onChange={e => setConfig(c => ({ ...c, fixedExpiryMonth: parseInt(e.target.value) }))}
                          className="w-full h-9 rounded-md border px-2 text-sm"
                        >
                          {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <Label className="text-[10px]">Day</Label>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={config.fixedExpiryDay}
                          onChange={e => setConfig(c => ({ ...c, fixedExpiryDay: parseInt(e.target.value) || 31 }))}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      All points expire on {MONTHS[config.fixedExpiryMonth - 1]} {config.fixedExpiryDay} each year
                    </p>
                  </div>
                )}

                {config.expiryModel === "rolling_window" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Inactivity window (months)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={36}
                      value={config.rollingWindowMonths}
                      onChange={e => setConfig(c => ({ ...c, rollingWindowMonths: parseInt(e.target.value) || 6 }))}
                      className="w-32"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Points expire {config.rollingWindowMonths} month{config.rollingWindowMonths !== 1 ? "s" : ""} after last order.
                      New orders reset the timer for ALL points.
                    </p>
                  </div>
                )}
              </Card>

              {/* Warning Notifications */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4" style={{ color: BRAND }} />
                    <div>
                      <p className="font-semibold text-sm">Expiry Warnings</p>
                      <p className="text-[10px] text-muted-foreground">Notify customers before their points expire</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.warningEnabled}
                    onCheckedChange={(checked) => setConfig(c => ({ ...c, warningEnabled: checked }))}
                  />
                </div>
                {config.warningEnabled && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Warn X days before expiry
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={config.warningDaysBefore}
                      onChange={e => setConfig(c => ({ ...c, warningDaysBefore: parseInt(e.target.value) || 14 }))}
                      className="w-32"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Push notifications sent {config.warningDaysBefore} day{config.warningDaysBefore !== 1 ? "s" : ""} before expiry (max once/day)
                    </p>
                  </div>
                )}
              </Card>

              {/* Apply to existing */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RotateCcw className="w-4 h-4" style={{ color: BRAND }} />
                    <div>
                      <p className="font-semibold text-sm">Apply to Existing Points</p>
                      <p className="text-[10px] text-muted-foreground">
                        Set expiry dates on points already earned (retroactive)
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config.applyToExisting}
                    onCheckedChange={(checked) => setConfig(c => ({ ...c, applyToExisting: checked }))}
                  />
                </div>
                {config.applyToExisting && (
                  <div className="mt-2 p-2 bg-amber-50 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-amber-700">
                      Existing points will get expiry dates based on when they were originally earned.
                      Some may expire immediately if they exceed the expiry window.
                    </p>
                  </div>
                )}
              </Card>

              {/* Process All */}
              <Card className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="w-4 h-4" style={{ color: BRAND }} />
                  <div>
                    <p className="font-semibold text-sm">Manual Processing</p>
                    <p className="text-[10px] text-muted-foreground">
                      Expiry runs automatically when customers open the app. Use this button to force-process all users now.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleProcessAll}
                  disabled={processing}
                  variant="outline"
                  className="w-full h-10"
                  style={{ borderColor: "#EF4444", color: "#EF4444" }}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Process Expiry for All Users</>
                  )}
                </Button>
              </Card>
            </>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 text-white font-semibold"
            style={{ backgroundColor: BRAND }}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Configuration</>
            )}
          </Button>
        </div>
      )}

      {/* Report Tab */}
      {activeTab === "report" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Points Expiry Report</p>
            <Button
              onClick={fetchReport}
              disabled={loadingReport}
              variant="outline"
              size="sm"
              className="h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingReport ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loadingReport && !report ? (
            <Card className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
              <p className="text-sm text-muted-foreground">Loading report...</p>
            </Card>
          ) : !report ? (
            <Card className="p-8 text-center">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-muted-foreground">Click refresh to load the report</p>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Active Points</p>
                  <p className="text-lg font-bold" style={{ color: BRAND }}>
                    {report.summary.totalActivePoints.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Expired Points</p>
                  <p className="text-lg font-bold text-red-500">
                    {report.summary.totalExpiredPoints.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Expiring Soon</p>
                  <p className="text-lg font-bold text-amber-500">
                    {report.summary.totalSoonToExpire.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Users w/ Points</p>
                  <p className="text-lg font-bold text-gray-700">
                    {report.summary.usersWithPoints}
                  </p>
                </Card>
              </div>

              {/* User List */}
              {report.users.length > 0 && (
                <Card className="p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Customer Details
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {report.users.map(u => (
                      <div key={u.userId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-[10px] text-gray-500">{u.phone}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-sm font-bold" style={{ color: BRAND }}>
                            {u.activePoints.toLocaleString()} pts
                          </p>
                          <div className="flex items-center gap-2 text-[10px]">
                            {u.soonToExpire > 0 && (
                              <span className="text-amber-600">{u.soonToExpire} expiring</span>
                            )}
                            {u.expiredPoints > 0 && (
                              <span className="text-red-500">{u.expiredPoints} expired</span>
                            )}
                          </div>
                          {u.nearestExpiry && (
                            <p className="text-[9px] text-gray-400">
                              Next: {new Date(u.nearestExpiry).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
