/**
 * ChangePinDialog — Shared dialog for changing PIN (customer & staff).
 * Flow: Enter Current PIN -> Enter New PIN -> Confirm New PIN -> Submit
 * Locks out after 3 failed attempts for 12 hours.
 */
import { useState, useEffect, useCallback } from "react";
import { PinInput } from "./PinInput";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Lock, ShieldCheck, AlertTriangle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const LOCKOUT_KEY_PREFIX = "tikka_change_pin_lockout_";
const LOCKOUT_DURATION = 12 * 60 * 60 * 1000; // 12 hours
const MAX_ATTEMPTS = 3;

type Step = "current" | "new" | "confirm";

interface ChangePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "customer" | "staff";
  accessToken: string;
  userId: string;
}

function getLockoutState(userId: string): { locked: boolean; attemptsLeft: number; unlockTime?: number } {
  try {
    const key = `${LOCKOUT_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { locked: false, attemptsLeft: MAX_ATTEMPTS };

    const data = JSON.parse(raw);
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return { locked: true, attemptsLeft: 0, unlockTime: data.lockedUntil };
    }
    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
      localStorage.removeItem(key);
      return { locked: false, attemptsLeft: MAX_ATTEMPTS };
    }
    return { locked: false, attemptsLeft: MAX_ATTEMPTS - (data.failedAttempts || 0) };
  } catch {
    return { locked: false, attemptsLeft: MAX_ATTEMPTS };
  }
}

function recordFailedAttempt(userId: string): { locked: boolean; attemptsLeft: number; unlockTime?: number } {
  try {
    const key = `${LOCKOUT_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(key);
    let data = raw ? JSON.parse(raw) : { failedAttempts: 0 };
    data.failedAttempts = (data.failedAttempts || 0) + 1;

    if (data.failedAttempts >= MAX_ATTEMPTS) {
      data.lockedUntil = Date.now() + LOCKOUT_DURATION;
      localStorage.setItem(key, JSON.stringify(data));
      return { locked: true, attemptsLeft: 0, unlockTime: data.lockedUntil };
    }

    localStorage.setItem(key, JSON.stringify(data));
    return { locked: false, attemptsLeft: MAX_ATTEMPTS - data.failedAttempts };
  } catch {
    return { locked: false, attemptsLeft: MAX_ATTEMPTS };
  }
}

function clearFailedAttempts(userId: string) {
  try {
    localStorage.removeItem(`${LOCKOUT_KEY_PREFIX}${userId}`);
  } catch {}
}

function formatTimeLeft(unlockTime: number): string {
  const diff = unlockTime - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

export function ChangePinDialog({ open, onOpenChange, variant, accessToken, userId }: ChangePinDialogProps) {
  const [step, setStep] = useState<Step>("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [lockoutState, setLockoutState] = useState(() => getLockoutState(userId));

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep("current");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setError("");
      setSuccess(false);
      setLockoutState(getLockoutState(userId));
    }
  }, [open, userId]);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutState.locked || !lockoutState.unlockTime) return;
    const interval = setInterval(() => {
      const newState = getLockoutState(userId);
      setLockoutState(newState);
      if (!newState.locked) clearInterval(interval);
    }, 30000);
    return () => clearInterval(interval);
  }, [lockoutState.locked, lockoutState.unlockTime, userId]);

  const handleNext = useCallback(() => {
    setError("");
    if (step === "current") {
      if (currentPin.length !== 6) {
        setError("Please enter your complete 6-digit current PIN");
        return;
      }
      setStep("new");
    } else if (step === "new") {
      if (newPin.length !== 6) {
        setError("Please enter a complete 6-digit new PIN");
        return;
      }
      if (newPin === currentPin) {
        setError("New PIN must be different from your current PIN");
        return;
      }
      setStep("confirm");
    }
  }, [step, currentPin, newPin]);

  const handleBack = useCallback(() => {
    setError("");
    if (step === "confirm") {
      setConfirmPin("");
      setStep("new");
    } else if (step === "new") {
      setNewPin("");
      setStep("current");
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    setError("");

    if (confirmPin.length !== 6) {
      setError("Please enter the complete PIN to confirm");
      return;
    }

    if (confirmPin !== newPin) {
      setError("PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setLoading(true);
    try {
      const endpoint = variant === "staff" ? "/staff/change-pin" : "/change-pin";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Auth": accessToken,
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ currentPin, newPin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 && data.error?.toLowerCase().includes("current pin")) {
          const result = recordFailedAttempt(userId);
          setLockoutState(result);
          if (result.locked) {
            setError(`Too many failed attempts. PIN change locked for 12 hours.`);
          } else {
            setError(`Incorrect current PIN. ${result.attemptsLeft} attempt${result.attemptsLeft !== 1 ? "s" : ""} remaining.`);
          }
          setStep("current");
          setCurrentPin("");
          setNewPin("");
          setConfirmPin("");
        } else {
          setError(data.error || "Failed to change PIN");
        }
        return;
      }

      // Success
      clearFailedAttempts(userId);
      setSuccess(true);
      toast.success("PIN changed successfully!");

      // Auto-close after 2 seconds
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } catch (err: any) {
      console.error("[ChangePinDialog] Error:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [confirmPin, newPin, currentPin, variant, accessToken, userId, onOpenChange]);

  const stepIndex = step === "current" ? 0 : step === "new" ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" style={{ color: BRAND }} />
            Change PIN
          </DialogTitle>
          <DialogDescription>
            {variant === "staff" ? "Change your staff login PIN" : "Change your account login PIN"}
          </DialogDescription>
        </DialogHeader>

        {/* Success State */}
        {success ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-green-700">PIN Changed!</p>
            <p className="text-sm text-gray-500 text-center">
              Your new PIN is active. Use it next time you log in.
            </p>
          </div>
        ) : lockoutState.locked ? (
          /* Lockout State */
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-lg font-semibold text-red-700">Account Locked</p>
            <p className="text-sm text-gray-500 text-center">
              Too many incorrect attempts. PIN change is locked for security.
            </p>
            <div className="bg-red-50 rounded-lg px-4 py-2 mt-1">
              <p className="text-xs text-red-600 font-medium text-center">
                Try again in {formatTimeLeft(lockoutState.unlockTime!)}
              </p>
            </div>
          </div>
        ) : (
          /* PIN Entry Form */
          <div className="space-y-5 pt-2">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2">
              {["Current", "New", "Confirm"].map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      i < stepIndex
                        ? "bg-green-500 text-white"
                        : i === stepIndex
                        ? "text-white shadow-md"
                        : "bg-gray-200 text-gray-400"
                    }`}
                    style={i === stepIndex ? { backgroundColor: BRAND } : undefined}
                  >
                    {i < stepIndex ? "\u2713" : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium ${i === stepIndex ? "text-gray-900" : "text-gray-400"}`}>
                    {label}
                  </span>
                  {i < 2 && <div className={`w-4 h-0.5 rounded ${i < stepIndex ? "bg-green-500" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>

            {/* Step Content */}
            <div className="min-h-[140px]">
              {step === "current" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Enter Current PIN</span>
                  </div>
                  <PinInput value={currentPin} onChange={setCurrentPin} autoFocus />
                  {lockoutState.attemptsLeft < MAX_ATTEMPTS && (
                    <p className="text-[11px] text-amber-600 font-medium text-center">
                      {lockoutState.attemptsLeft} attempt{lockoutState.attemptsLeft !== 1 ? "s" : ""} remaining
                    </p>
                  )}
                </div>
              )}

              {step === "new" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Enter New PIN</span>
                  </div>
                  <PinInput value={newPin} onChange={setNewPin} autoFocus />
                  <p className="text-[10px] text-gray-400 text-center">Choose a PIN you'll remember</p>
                </div>
              )}

              {step === "confirm" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Confirm New PIN</span>
                  </div>
                  <PinInput value={confirmPin} onChange={setConfirmPin} autoFocus />
                  <p className="text-[10px] text-gray-400 text-center">Re-enter your new PIN to confirm</p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {step !== "current" && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </Button>
              )}

              {step === "confirm" ? (
                <Button
                  type="button"
                  className="flex-1 text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={handleSubmit}
                  disabled={loading || confirmPin.length < 6}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Changing...
                    </span>
                  ) : (
                    "Change PIN"
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="flex-1 text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={handleNext}
                  disabled={
                    (step === "current" && currentPin.length < 6) ||
                    (step === "new" && newPin.length < 6)
                  }
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
