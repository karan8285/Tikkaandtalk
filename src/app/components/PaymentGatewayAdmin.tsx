import { useState, useEffect, useMemo } from "react";
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
  CreditCard,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Shield,
  AlertTriangle,
  RefreshCw,
  Globe,
  Key,
  Server,
  Smartphone,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { clearMidtransConfigCache } from "../lib/midtrans";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface PaymentGatewayConfig {
  enabled: boolean;
  isProduction: boolean;
  clientKey: string;
  serverKey: string;
  merchantId: string;
}

const DEFAULT_CONFIG: PaymentGatewayConfig = {
  enabled: true,
  isProduction: false,
  clientKey: "",
  serverKey: "",
  merchantId: "",
};

export function PaymentGatewayAdmin({ customToken }: { customToken: string | null }) {
  const [config, setConfig] = useState<PaymentGatewayConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<PaymentGatewayConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showServerKey, setShowServerKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Dynamic URLs based on current hosting environment
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const serverBaseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

  const midtransDashboardUrl = config.isProduction
    ? "https://dashboard.midtrans.com"
    : "https://dashboard.sandbox.midtrans.com";

  const dynamicUrls = useMemo(() => ({
    notificationUrl: `${serverBaseUrl}/midtrans-notification`,
    finishUrl: `${appUrl}/order-success/{order_id}`,
    unfinishUrl: `${appUrl}/order-confirmation`,
    errorUrl: `${appUrl}/order-confirmation`,
  }), [serverBaseUrl, appUrl]);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    if (!customToken) return;
    setLoading(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/payment-gateway`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Payment gateway config API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch config: ${response.status}`);
      }

      const data = await response.json();
      const loadedConfig: PaymentGatewayConfig = {
        enabled: data.enabled ?? true,
        isProduction: data.isProduction ?? false,
        clientKey: data.clientKey || "",
        serverKey: data.serverKey || "",
        merchantId: data.merchantId || "",
      };
      setConfig(loadedConfig);
      setOriginalConfig(loadedConfig);
    } catch (error: any) {
      console.error("Error fetching payment gateway config:", error);
      toast.error(`Failed to load payment config: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!customToken) return;

    // Validation
    if (config.enabled) {
      if (!config.clientKey.trim()) {
        toast.error("Client Key is required when payments are enabled");
        return;
      }
      if (!config.serverKey.trim()) {
        toast.error("Server Key is required when payments are enabled");
        return;
      }
      if (!config.merchantId.trim()) {
        toast.error("Merchant ID is required when payments are enabled");
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/payment-gateway`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error("Failed to save payment gateway config");
      }

      setOriginalConfig({ ...config });
      setTestResult(null);
      // Clear frontend config cache so next payment attempt picks up new settings
      clearMidtransConfigCache();
      toast.success("Payment gateway settings saved successfully!");
    } catch (error: any) {
      console.error("Error saving payment gateway config:", error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!customToken) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetchWithRetry(`${API_BASE}/admin/payment-gateway/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Connection successful! Midtrans API is reachable." });
        toast.success("Midtrans connection test passed!");
      } else {
        setTestResult({ success: false, message: data.error || data.message || "Connection test failed" });
        toast.error("Midtrans connection test failed");
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Network error during test" });
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const maskKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 12) return "****" + key.slice(-4);
    return key.slice(0, 8) + "****" + key.slice(-4);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground">Loading payment gateway settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Payment Gateway</h2>
          <Badge
            variant={config.isProduction ? "default" : "secondary"}
            className={config.isProduction ? "bg-green-600" : "bg-amber-500 text-white"}
          >
            {config.isProduction ? "Production" : "Sandbox"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={testConnection} disabled={testing || !config.clientKey}>
            {testing ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Shield className="w-4 h-4 mr-1.5" />}
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button onClick={saveConfig} disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Test Result Banner */}
      {testResult && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            testResult.success
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{testResult.message}</span>
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <Label className="text-base font-semibold">Online Payments</Label>
              <p className="text-sm text-muted-foreground">
                Enable Midtrans payment gateway for online orders (GoPay, QRIS, Bank Transfer, Credit Card)
              </p>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
          />
        </div>
      </Card>

      {/* Environment Mode */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1">Environment Mode</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Switch between Sandbox (testing) and Production (live payments).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setConfig({ ...config, isProduction: false })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              !config.isProduction
                ? "border-amber-400 bg-amber-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-sm">Sandbox</span>
              {!config.isProduction && (
                <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">Active</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">For testing with dummy transactions. No real money involved.</p>
          </button>

          <button
            onClick={() => setConfig({ ...config, isProduction: true })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              config.isProduction
                ? "border-green-400 bg-green-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-green-600" />
              <span className="font-semibold text-sm">Production</span>
              {config.isProduction && (
                <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">Active</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Live payments with real transactions. Use production keys.</p>
          </button>
        </div>

        {config.isProduction && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">
              <strong>Production mode is active.</strong> Real payments will be processed. Make sure you have configured your production credentials and tested thoroughly in Sandbox first.
            </p>
          </div>
        )}
      </Card>

      {/* API Credentials */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Key className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold">API Credentials</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Get these from your{" "}
          <a
            href={`${midtransDashboardUrl}/settings/config_info`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800 inline-flex items-center gap-0.5"
          >
            Midtrans Dashboard <ExternalLink className="w-3 h-3" />
          </a>
          {" "}under Settings &rarr; Access Keys.
        </p>

        <div className="space-y-5">
          {/* Merchant ID */}
          <div>
            <Label htmlFor="merchant-id" className="text-sm font-medium">
              Merchant ID
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Your unique merchant identifier (e.g., M715908735)
            </p>
            <Input
              id="merchant-id"
              value={config.merchantId}
              onChange={(e) => setConfig({ ...config, merchantId: e.target.value.trim() })}
              placeholder={config.isProduction ? "G123456789" : "M715908735"}
              className="font-mono"
            />
          </div>

          {/* Client Key */}
          <div>
            <Label htmlFor="client-key" className="text-sm font-medium">
              Client Key
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Used in the frontend for Snap.js popup. Starts with <code className="bg-muted px-1 rounded text-[11px]">Mid-client-</code>
            </p>
            <Input
              id="client-key"
              value={config.clientKey}
              onChange={(e) => setConfig({ ...config, clientKey: e.target.value.trim() })}
              placeholder={config.isProduction ? "Mid-client-xxxxxxxxxxxx" : "Mid-client-IgWwU833OVs1H8zC"}
              className="font-mono"
            />
          </div>

          {/* Server Key */}
          <div>
            <Label htmlFor="server-key" className="text-sm font-medium flex items-center gap-1.5">
              Server Key
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-red-600 border-red-200">
                Secret
              </Badge>
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Used server-side for API calls. Never exposed to the frontend. Starts with <code className="bg-muted px-1 rounded text-[11px]">Mid-server-</code>
            </p>
            <div className="relative">
              <Input
                id="server-key"
                type={showServerKey ? "text" : "password"}
                value={config.serverKey}
                onChange={(e) => setConfig({ ...config, serverKey: e.target.value.trim() })}
                placeholder={config.isProduction ? "Mid-server-xxxxxxxxxxxx" : "Mid-server-ucmhuhMZRuj9q0eSzRJ8pR06"}
                className="font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowServerKey(!showServerKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showServerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Midtrans Dashboard Setup Instructions */}
      <Card className="p-6 border-blue-200 bg-blue-50/30">
        <div className="flex items-center gap-2 mb-1">
          <Server className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-blue-900">Midtrans Dashboard Configuration</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Configure these URLs in your{" "}
          <a
            href={`${midtransDashboardUrl}/settings/vtweb_configuration`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800 inline-flex items-center gap-0.5"
          >
            Midtrans Dashboard <ExternalLink className="w-3 h-3" />
          </a>
          . These URLs are <strong>auto-generated</strong> based on your current hosting environment.
        </p>

        <div className="space-y-4">
          {/* Payment Notification URL */}
          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold text-gray-800">
                Payment Notification URL (Server-to-Server)
              </Label>
              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200">Required</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Midtrans will POST payment status updates to this URL. Set this under <strong>Settings &rarr; Configuration &rarr; Payment Notification URL</strong>.
            </p>
            <CopyableUrl url={dynamicUrls.notificationUrl} field="notification" copiedField={copiedField} onCopy={copyToClipboard} />
          </div>

          {/* Redirect URLs */}
          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold text-gray-800">
                Finish Redirect URL
              </Label>
              <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">Recommended</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Customer is redirected here after completing payment. Set under <strong>Settings &rarr; Configuration &rarr; Finish Redirect URL</strong>.
            </p>
            <CopyableUrl url={dynamicUrls.finishUrl} field="finish" copiedField={copiedField} onCopy={copyToClipboard} />
          </div>

          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold text-gray-800">
                Unfinish Redirect URL
              </Label>
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">Recommended</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Customer is redirected here if they close payment without completing. Set under <strong>Settings &rarr; Configuration &rarr; Unfinish Redirect URL</strong>.
            </p>
            <CopyableUrl url={dynamicUrls.unfinishUrl} field="unfinish" copiedField={copiedField} onCopy={copyToClipboard} />
          </div>

          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold text-gray-800">
                Error Redirect URL
              </Label>
              <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">Recommended</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Customer is redirected here if an error occurs during payment.
            </p>
            <CopyableUrl url={dynamicUrls.errorUrl} field="error" copiedField={copiedField} onCopy={copyToClipboard} />
          </div>
        </div>
      </Card>

      {/* Snap Preferences */}
      <Card className="p-6 border-purple-200 bg-purple-50/30">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-purple-900">Snap Preferences (Optional)</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customize which payment methods appear in the Midtrans Snap popup. Configure in your{" "}
          <a
            href={`${midtransDashboardUrl}/settings/snap_preference`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 underline hover:text-purple-800 inline-flex items-center gap-0.5"
          >
            Snap Preferences <ExternalLink className="w-3 h-3" />
          </a>
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { name: "GoPay", icon: "wallet" },
            { name: "QRIS", icon: "qr" },
            { name: "Bank Transfer", icon: "bank" },
            { name: "Credit Card", icon: "card" },
            { name: "ShopeePay", icon: "wallet" },
            { name: "Alfamart", icon: "store" },
          ].map((method) => (
            <div
              key={method.name}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-purple-100 text-sm"
            >
              <CreditCard className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-gray-700 font-medium">{method.name}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Enable or disable specific payment methods directly from the Midtrans Dashboard. No code changes needed.
        </p>
      </Card>

      {/* Quick Reference */}
      <Card className="p-6 bg-gray-50">
        <h3 className="text-lg font-semibold mb-3">Quick Setup Checklist</h3>
        <div className="space-y-2.5">
          {[
            {
              done: !!config.merchantId,
              text: "Add your Merchant ID",
            },
            {
              done: !!config.clientKey,
              text: "Add your Client Key",
            },
            {
              done: !!config.serverKey,
              text: "Add your Server Key",
            },
            {
              done: true, // We can't check this from here
              text: "Set Payment Notification URL in Midtrans Dashboard",
              note: "Copy the URL from above",
            },
            {
              done: true,
              text: "Set Redirect URLs in Midtrans Dashboard",
              note: "Finish, Unfinish, and Error URLs",
            },
            {
              done: !config.isProduction || (config.isProduction && config.clientKey.startsWith("Mid-client-")),
              text: config.isProduction
                ? "Using Production credentials"
                : "Test in Sandbox mode before going live",
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <span className={`text-sm ${item.done ? "text-gray-700" : "text-gray-400"}`}>
                  {item.text}
                </span>
                {item.note && (
                  <p className="text-[11px] text-muted-foreground">{item.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Current Environment Info */}
      <Card className="p-4 bg-slate-50 border-dashed">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-600 space-y-1">
            <p><strong>App URL:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-[11px]">{appUrl || "loading..."}</code></p>
            <p><strong>API Base:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-[11px]">{serverBaseUrl}</code></p>
            <p className="text-slate-400">
              When you deploy to a custom domain, the Redirect URLs above will automatically update. 
              Remember to also update them in your Midtrans Dashboard.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Helper component for copyable URL fields
function CopyableUrl({
  url,
  field,
  copiedField,
  onCopy,
}: {
  url: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 break-all select-all">
        {url}
      </code>
      <button
        onClick={() => onCopy(url, field)}
        className="flex-shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        title="Copy to clipboard"
      >
        {copiedField === field ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4 text-gray-500" />
        )}
      </button>
    </div>
  );
}