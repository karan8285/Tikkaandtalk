/**
 * DineInVoucherRedeem — Staff component for verifying and redeeming dine-in vouchers.
 * Supports manual code input and QR camera scanning.
 */
import { useState, useRef, useEffect } from "react";
import { APP_CONFIG } from "../lib/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Ticket, Search, Camera, CheckCircle, XCircle, AlertCircle, Loader2, User, Phone, Percent, DollarSign, Clock, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { formatIDR } from "../lib/currency";
import jsQR from "jsqr";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface DineInVoucherRedeemProps {
  customToken: string;
  staffName: string;
}

interface VerifiedVoucher {
  status: string;
  assignment?: {
    id: string;
    redeemed: boolean;
    redeemedAt?: string;
    redeemedBy?: string;
  };
  voucher: {
    id: string;
    title: string;
    description: string;
    discountType: string;
    discountValue: number;
    minOrderAmount: number;
    expiryDate: string | null;
    code: string;
  };
  customer?: {
    name: string;
    phone: string;
  };
}

interface PendingAssignment {
  id: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  assignedAt: string;
}

interface CodeLookupResult {
  voucher: {
    id: string;
    title: string;
    description: string;
    discountType: string;
    discountValue: number;
    minOrderAmount: number;
    expiryDate: string | null;
    code: string;
    isActive: boolean;
  };
  pendingAssignments: PendingAssignment[];
}

export function DineInVoucherRedeem({ customToken, staffName }: DineInVoucherRedeemProps) {
  const [inputCode, setInputCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // QR mode: verified by assignment ID
  const [verifiedVoucher, setVerifiedVoucher] = useState<VerifiedVoucher | null>(null);
  // Code mode: lookup result with pending assignments
  const [codeLookupResult, setCodeLookupResult] = useState<CodeLookupResult | null>(null);

  // Recent redemptions (session local)
  const [recentRedemptions, setRecentRedemptions] = useState<Array<{ title: string; customer: string; time: string }>>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": customToken,
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setShowCamera(true);
      setScanResult(null);

      // Wait for video element to render
      await new Promise(r => setTimeout(r, 300));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start scanning interval using canvas + simple pattern matching
      scanIntervalRef.current = setInterval(() => {
        scanQRFrame();
      }, 500);
    } catch (e: any) {
      console.error("Camera error:", e);
      toast.error("Could not access camera. Please enter the code manually.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const scanQRFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      console.log("QR scanned:", code.data);
      // Stop scanning immediately
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setScanResult(code.data);
      toast.success("QR code scanned!");
      // Auto-verify the scanned data
      handleManualScan(code.data);
      stopCamera();
    }
  };

  const handleManualScan = async (scannedText: string) => {
    if (!scannedText.trim()) return;

    // Check if it's a QR code format: "DINEIN:{assignmentId}"
    if (scannedText.startsWith("DINEIN:")) {
      const assignmentId = scannedText.replace("DINEIN:", "").trim();
      await verifyByAssignmentId(assignmentId);
    } else {
      // Treat as a voucher code
      await verifyByCode(scannedText.trim().toUpperCase());
    }
  };

  const verifyByAssignmentId = async (assignmentId: string) => {
    try {
      setVerifying(true);
      setVerifiedVoucher(null);
      setCodeLookupResult(null);

      const res = await fetchWithRetry(`${API_BASE}/staff/verify-dinein-assignment/${assignmentId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVerifiedVoucher(data);
        stopCamera();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Invalid voucher");
      }
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const verifyByCode = async (code: string) => {
    try {
      setVerifying(true);
      setVerifiedVoucher(null);
      setCodeLookupResult(null);

      const res = await fetchWithRetry(`${API_BASE}/staff/verify-dinein-code/${code}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCodeLookupResult(data);
        stopCamera();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Invalid voucher code");
      }
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleRedeem = async (assignmentId: string) => {
    try {
      setRedeeming(true);
      const res = await fetchWithRetry(`${API_BASE}/staff/redeem-dinein-voucher`, {
        method: "POST",
        headers,
        body: JSON.stringify({ assignmentId, staffName }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Voucher "${data.voucher.title}" redeemed for ${data.customer?.name || "customer"}!`);
        setRecentRedemptions(prev => [{
          title: data.voucher.title,
          customer: data.customer?.name || "Customer",
          time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        }, ...prev].slice(0, 10));
        setVerifiedVoucher(null);
        setCodeLookupResult(null);
        setInputCode("");
      } else {
        toast.error(data.error || "Failed to redeem");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to redeem");
    } finally {
      setRedeeming(false);
    }
  };

  const handleVerifyInput = () => {
    if (!inputCode.trim()) return;
    handleManualScan(inputCode.trim());
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
          <Ticket className="w-4 h-4" style={{ color: BRAND }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">Redeem Dine-In Voucher</h3>
          <p className="text-[10px] text-muted-foreground">Scan QR or enter voucher code</p>
        </div>
      </div>

      {/* Input Section */}
      <Card className="p-4">
        <div className="flex gap-2 mb-3">
          <Input
            value={inputCode}
            onChange={e => setInputCode(e.target.value.toUpperCase())}
            placeholder="Enter voucher code or scan QR..."
            className="font-mono flex-1"
            onKeyDown={e => { if (e.key === "Enter") handleVerifyInput(); }}
          />
          <Button
            onClick={handleVerifyInput}
            disabled={verifying || !inputCode.trim()}
            size="sm"
            style={{ backgroundColor: BRAND }}
            className="text-white px-4"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        <Button
          onClick={startCamera}
          variant="outline"
          className="w-full h-10 text-sm"
          style={{ borderColor: BRAND, color: BRAND }}
        >
          <Camera className="w-4 h-4 mr-2" /> Scan QR Code
        </Button>
      </Card>

      {/* QR Scanned — Verified by Assignment ID */}
      {verifiedVoucher && (
        <Card className="p-4 border-2" style={{ borderColor: verifiedVoucher.status === "valid" ? "#22C55E" : "#EF4444" }}>
          {/* Status indicator */}
          <div className="flex items-center gap-2 mb-3">
            {verifiedVoucher.status === "valid" ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : verifiedVoucher.status === "already_redeemed" ? (
              <XCircle className="w-5 h-5 text-red-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            <span className={`text-sm font-bold ${
              verifiedVoucher.status === "valid" ? "text-green-700" :
              verifiedVoucher.status === "already_redeemed" ? "text-red-700" : "text-amber-700"
            }`}>
              {verifiedVoucher.status === "valid" ? "Valid Voucher" :
               verifiedVoucher.status === "already_redeemed" ? "Already Redeemed" :
               verifiedVoucher.status === "expired" ? "Expired" : "Inactive"}
            </span>
          </div>

          {/* Voucher info */}
          <h4 className="font-semibold text-sm mb-1">{verifiedVoucher.voucher.title}</h4>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: `${BRAND}10` }}>
              {verifiedVoucher.voucher.discountType === "percentage" ? (
                <Percent className="w-3 h-3" style={{ color: BRAND }} />
              ) : (
                <DollarSign className="w-3 h-3" style={{ color: BRAND }} />
              )}
              <span className="text-xs font-bold" style={{ color: BRAND }}>
                {verifiedVoucher.voucher.discountType === "percentage"
                  ? `${verifiedVoucher.voucher.discountValue}% OFF`
                  : formatIDR(verifiedVoucher.voucher.discountValue)
                }
              </span>
            </div>
            <span className="text-[10px] font-mono text-gray-500">{verifiedVoucher.voucher.code}</span>
          </div>

          {/* Customer info */}
          {verifiedVoucher.customer && (
            <div className="flex items-center gap-3 text-xs text-gray-600 mb-3 bg-gray-50 rounded-lg px-3 py-2">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {verifiedVoucher.customer.name}</span>
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {verifiedVoucher.customer.phone}</span>
            </div>
          )}

          {verifiedVoucher.status === "already_redeemed" && verifiedVoucher.assignment && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
              Redeemed by {verifiedVoucher.assignment.redeemedBy} on{" "}
              {verifiedVoucher.assignment.redeemedAt
                ? new Date(verifiedVoucher.assignment.redeemedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                : "unknown"
              }
            </div>
          )}

          {/* Redeem button */}
          {verifiedVoucher.status === "valid" && verifiedVoucher.assignment && (
            <Button
              onClick={() => handleRedeem(verifiedVoucher.assignment!.id)}
              disabled={redeeming}
              className="w-full h-11 text-white font-semibold"
              style={{ backgroundColor: "#22C55E" }}
            >
              {redeeming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redeeming...</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" /> Redeem This Voucher</>
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs"
            onClick={() => { setVerifiedVoucher(null); setInputCode(""); }}
          >
            Clear & Scan Another
          </Button>
        </Card>
      )}

      {/* Code Lookup — shows list of pending assignments for this code */}
      {codeLookupResult && (
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-1">{codeLookupResult.voucher.title}</h4>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: `${BRAND}10` }}>
              {codeLookupResult.voucher.discountType === "percentage" ? (
                <Percent className="w-3 h-3" style={{ color: BRAND }} />
              ) : (
                <DollarSign className="w-3 h-3" style={{ color: BRAND }} />
              )}
              <span className="text-xs font-bold" style={{ color: BRAND }}>
                {codeLookupResult.voucher.discountType === "percentage"
                  ? `${codeLookupResult.voucher.discountValue}% OFF`
                  : formatIDR(codeLookupResult.voucher.discountValue)
                }
              </span>
            </div>
            {!codeLookupResult.voucher.isActive && (
              <Badge className="text-[10px] bg-red-100 text-red-600">Inactive</Badge>
            )}
          </div>

          {codeLookupResult.pendingAssignments.length === 0 ? (
            <div className="text-center py-4">
              <AlertCircle className="w-6 h-6 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground">No unredeemed vouchers found for this code</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">
                {codeLookupResult.pendingAssignments.length} unredeemed — select customer:
              </p>
              {codeLookupResult.pendingAssignments.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{a.customerName}</p>
                    <p className="text-[10px] text-gray-500">{a.customerPhone}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleRedeem(a.id)}
                    disabled={redeeming}
                    className="h-8 text-xs text-white"
                    style={{ backgroundColor: "#22C55E" }}
                  >
                    {redeeming ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                    Redeem
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-xs"
            onClick={() => { setCodeLookupResult(null); setInputCode(""); }}
          >
            Clear & Search Another
          </Button>
        </Card>
      )}

      {/* Recent Redemptions */}
      {recentRedemptions.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Recent Redemptions</p>
          <div className="space-y-1.5">
            {recentRedemptions.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                <span className="font-medium">{r.title}</span>
                <span className="text-gray-400">-</span>
                <span className="text-gray-600">{r.customer}</span>
                <span className="text-gray-400 ml-auto">{r.time}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => { if (!open) stopCamera(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Point the camera at the customer's voucher QR code
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3]">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/60 rounded-2xl">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-white rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-white rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-white rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-white rounded-br-lg" />
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <p className="text-xs text-center text-gray-500">
              Or enter the code from the customer's voucher manually:
            </p>

            <div className="flex gap-2">
              <Input
                value={scanResult || ""}
                onChange={e => setScanResult(e.target.value.toUpperCase())}
                placeholder="DINEIN:xxx or voucher code"
                className="font-mono flex-1 text-sm"
                onKeyDown={e => {
                  if (e.key === "Enter" && scanResult) {
                    handleManualScan(scanResult);
                    stopCamera();
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (scanResult) {
                    handleManualScan(scanResult);
                    stopCamera();
                  }
                }}
                disabled={!scanResult || verifying}
                size="sm"
                style={{ backgroundColor: BRAND }}
                className="text-white"
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={stopCamera} className="w-full">
              <X className="w-4 h-4 mr-1" /> Close Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}