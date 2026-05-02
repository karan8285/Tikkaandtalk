/**
 * PrinterSettings — Bluetooth thermal printer management panel.
 * Allows connecting, testing, and managing EPPOS POS58L (58mm) printer via Web Bluetooth.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import {
  Printer, Bluetooth, BluetoothConnected, BluetoothOff,
  CheckCircle2, XCircle, Loader2, Trash2, RefreshCw, FileText, AlertTriangle, Info,
} from "lucide-react";
import { toast } from "sonner";
import { BRAND_COLOR } from "../lib/config";
import {
  isBluetoothAvailable,
  requestBluetoothPermission,
  getSavedPrinter,
  clearSavedPrinter,
  isPrinterConnected,
  connectPrinter,
  disconnectPrinter,
  forgetPrinter,
  testPrint,
  ensureConnected,
  reconnectPrinter,
} from "../lib/thermalPrinter";

export function PrinterSettings() {
  const [btAvailable] = useState(isBluetoothAvailable());
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [connected, setConnected] = useState(false);
  const [savedPrinter, setSavedPrinter] = useState(getSavedPrinter());
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  // Poll connection status — reconnect silently if dropped
  useEffect(() => {
    let reconnecting = false;
    const interval = setInterval(async () => {
      const wasConnected = connected;
      const isConn = await isPrinterConnected();
      if (wasConnected && !isConn && !reconnecting) {
        reconnecting = true;
        const revived = await ensureConnected();
        setConnected(revived);
        reconnecting = false;
      } else {
        setConnected(isConn);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [connected]);

  // Check Bluetooth permission + connection status on mount
  useEffect(() => {
    isPrinterConnected().then(setConnected);
    setCheckingPermission(true);
    requestBluetoothPermission()
      .then((result) => {
        setPermissionGranted(result.granted);
        setCheckingPermission(false);
      })
      .catch(() => {
        setCheckingPermission(false);
      });
  }, []);

  const handleGrantPermission = useCallback(async () => {
    const result = await requestBluetoothPermission();
    setPermissionGranted(result.granted);
    if (!result.granted) {
      toast.error("Permission denied. Bluetooth requires location permission on Android.");
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await connectPrinter();
      if (result.success) {
        toast.success(`Connected to ${result.name}`);
        setConnected(true);
        setSavedPrinter(getSavedPrinter());
      } else {
        toast.error(result.error || "Failed to connect");
      }
    } catch (err: any) {
      toast.error(err.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnectPrinter();
    setConnected(false);
    toast.info("Printer disconnected");
  }, []);

  const handleForget = useCallback(() => {
    forgetPrinter();
    setConnected(false);
    setSavedPrinter(null);
    toast.info("Printer forgotten");
  }, []);

  const handleTestPrint = useCallback(async () => {
    setTesting(true);
    try {
      // Try silent reconnect if connection dropped
      const ready = await ensureConnected();
      if (!ready) {
        toast.error("Printer not connected. Please connect first.");
        setTesting(false);
        return;
      }
      setConnected(true);
      await testPrint();
      toast.success("Test print sent successfully!");
    } catch (err: any) {
      toast.error(`Test print failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Printer className="w-5 h-5" style={{ color: BRAND_COLOR }} />
        <h2 className="text-lg font-bold text-gray-900">Thermal Printer</h2>
        <Badge variant="outline" className="text-xs">58mm</Badge>
      </div>

      {/* Bluetooth Availability / Permission Check */}
      {checkingPermission && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="text-sm text-blue-700">Checking Bluetooth permissions...</p>
          </div>
        </Card>
      )}
      {!checkingPermission && !btAvailable && !permissionGranted && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <BluetoothOff className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Bluetooth Permission Required</p>
              {permissionGranted ? (
                <>
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    Permission granted — tap below to scan for printers.
                  </p>
                  <Button
                    onClick={handleConnect}
                    disabled={connecting}
                    size="sm"
                    className="mt-2"
                    style={{ backgroundColor: BRAND_COLOR }}
                  >
                    {connecting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</>
                    ) : (
                      <><Bluetooth className="w-4 h-4 mr-2" /> Scan & Connect Printer</>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-amber-600 mt-1">
                    Web Bluetooth needs permission to find your thermal printer.
                  </p>
                  <Button
                    onClick={handleGrantPermission}
                    size="sm"
                    className="mt-2"
                    style={{ backgroundColor: BRAND_COLOR }}
                  >
                    Grant Bluetooth Permission
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Permission granted but navigator.bluetooth still null */}
      {!checkingPermission && !btAvailable && permissionGranted && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-green-800">
              Permission granted — tap "Scan & Connect Printer" below.
            </p>
          </div>
        </Card>
      )}

      {/* Printer Info Card */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-semibold text-gray-700">Printer Model</Label>
          <Badge variant="secondary" className="text-xs">EPPOS POS58L</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
          <div>
            <span className="text-gray-400">Paper Width</span>
            <p className="font-medium text-gray-800">58mm</p>
          </div>
          <div>
            <span className="text-gray-400">Connection</span>
            <p className="font-medium text-gray-800">Bluetooth (BLE)</p>
          </div>
          <div>
            <span className="text-gray-400">Protocol</span>
            <p className="font-medium text-gray-800">ESC/POS</p>
          </div>
          <div>
            <span className="text-gray-400">Chars/Line</span>
            <p className="font-medium text-gray-800">32</p>
          </div>
        </div>
      </Card>

      {/* Connection Status */}
      <Card className={`p-4 ${connected ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {connected ? (
              <BluetoothConnected className="w-6 h-6 text-green-600" />
            ) : (
              <Bluetooth className="w-6 h-6 text-gray-400" />
            )}
            <div>
              <p className={`text-sm font-semibold ${connected ? "text-green-800" : "text-gray-600"}`}>
                {connected ? "Connected" : "Not Connected"}
              </p>
              {savedPrinter && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {savedPrinter.name} &bull; Last connected: {new Date(savedPrinter.connectedAt).toLocaleString("en-US", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
          {connected ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-gray-300" />
          )}
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-2">
        {!connected ? (
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full h-11 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            {connecting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning for Printers...</>
            ) : (
              <><Bluetooth className="w-4 h-4 mr-2" /> {savedPrinter ? "Reconnect Printer" : "Scan & Connect Printer"}</>
            )}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleTestPrint}
              disabled={testing}
              variant="outline"
              className="h-10 text-sm font-medium"
            >
              {testing ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Printing...</>
              ) : (
                <><FileText className="w-4 h-4 mr-1.5" /> Test Print</>
              )}
            </Button>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              className="h-10 text-sm font-medium text-red-600 border-red-200 hover:bg-red-50"
            >
              <BluetoothOff className="w-4 h-4 mr-1.5" /> Disconnect
            </Button>
          </div>
        )}

        {savedPrinter && (
          <Button
            onClick={handleForget}
            variant="ghost"
            className="w-full h-9 text-xs text-gray-500 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Forget Saved Printer
          </Button>
        )}
      </div>

      {/* How to Connect Guide */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-blue-800">How to Connect</p>
            <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
              <li>Turn on your EPPOS POS58L printer</li>
              <li>Enable Bluetooth on your device</li>
              <li>Tap <strong>"Scan & Connect Printer"</strong> above</li>
              <li>Select your printer from the popup list (usually named "POS58" or "BlueTooth Printer")</li>
              <li>Wait for connection to establish</li>
              <li>Tap <strong>"Test Print"</strong> to verify it works</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* Troubleshooting */}
      <Card className="p-4 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-800">Troubleshooting</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>&bull; Make sure the printer is turned on and Bluetooth LED is blinking</li>
              <li>&bull; Stay within 10 meters of the printer</li>
              <li>&bull; If the printer doesn't appear, restart it and try again</li>
              <li>&bull; Use Chrome or Edge browser (Safari not supported)</li>
              <li>&bull; If test print fails, disconnect and reconnect</li>
              <li>&bull; Make sure no other device is connected to the printer</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
