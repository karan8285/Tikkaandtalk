import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { Sparkles, Award, Gift, Crown, Eye, EyeOff, User, Phone } from "lucide-react";

interface GuestAccountCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  guestName?: string; // Optional guest name to prefill
  pointsToEarn: number;
  onSuccess: () => void;
  onSignUp: (phone: string, pin: string, name: string) => Promise<void>;
}

export function GuestAccountCreationDialog({
  open,
  onOpenChange,
  phone,
  guestName,
  pointsToEarn,
  onSuccess,
  onSignUp,
}: GuestAccountCreationDialogProps) {
  const [name, setName] = useState(guestName || "");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(true);
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const hasName = !!guestName?.trim();

  // Update name when guestName prop changes
  useEffect(() => {
    if (guestName) {
      setName(guestName);
    }
  }, [guestName]);

  // Auto-focus PIN input when dialog opens
  useEffect(() => {
    if (open && hasName) {
      // Small delay to let dialog animate in
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, hasName]);

  const handleCreateAccount = async () => {
    // Validation
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (pin.length !== 6) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }

    if (!/^\d+$/.test(pin)) {
      toast.error("PIN must contain only numbers");
      return;
    }

    setLoading(true);

    try {
      await onSignUp(phone, pin, name.trim());
      toast.success(`Account created! Welcome, ${name}!`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Account creation error:", error);
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  // Render individual PIN dots/digits
  const renderPinDisplay = () => {
    const digits = pin.split("");
    return (
      <div className="flex justify-center gap-2 sm:gap-3 mt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-10 h-12 sm:w-12 sm:h-14 rounded-lg border-2 flex items-center justify-center text-xl sm:text-2xl font-bold transition-all ${
              i < digits.length
                ? "border-orange-400 bg-orange-50 text-gray-900"
                : i === digits.length
                ? "border-orange-400 bg-white animate-pulse"
                : "border-gray-200 bg-gray-50 text-gray-300"
            }`}
          >
            {digits[i] !== undefined
              ? showPin
                ? digits[i]
                : "\u2022"
              : ""}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-center mb-2">
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg sm:text-xl">
            {hasName ? `Hi ${guestName}! Claim Your Points` : "Save Your Rewards!"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Just set a PIN to claim <strong className="text-primary">+{pointsToEarn} points</strong> from this order
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Compact identity confirmation */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-3 border border-gray-100">
            <div className="flex-1 min-w-0">
              {hasName && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 truncate">
                  <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{guestName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span>{phone}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full flex-shrink-0">
              <Award className="w-3 h-3" />
              <span className="font-medium">+{pointsToEarn} pts</span>
            </div>
          </div>

          {/* Compact single-line benefits */}
          <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Gift className="w-3 h-3 text-orange-500" /> Rewards</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1"><Award className="w-3 h-3 text-orange-500" /> Points</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-orange-500" /> Tiers</span>
          </div>

          {/* Name Input - only shown when guestName is NOT provided */}
          {!hasName && (
            <div>
              <Label htmlFor="guest-name" className="text-xs sm:text-sm font-medium text-gray-700">
                Your Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="guest-name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 sm:h-11"
                disabled={loading}
                maxLength={50}
              />
            </div>
          )}

          {/* Single PIN Input - the main focus */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="guest-pin" className="text-sm font-medium text-gray-700">
                Create a 6-Digit PIN
              </Label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
              >
                {showPin ? (
                  <><EyeOff className="w-3.5 h-3.5" /> Hide</>
                ) : (
                  <><Eye className="w-3.5 h-3.5" /> Show</>
                )}
              </button>
            </div>

            {/* Visual PIN boxes */}
            <div className="relative cursor-text" onClick={() => pinInputRef.current?.focus()}>
              {renderPinDisplay()}

              {/* Actual input overlaid on top — invisible but focusable */}
              <Input
                ref={pinInputRef}
                id="guest-pin"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(value);
                }}
                className="absolute inset-0 w-full h-full opacity-0 z-10"
                disabled={loading}
                maxLength={6}
                autoComplete="off"
              />
            </div>

            {pin.length === 6 && (
              <p className="text-xs text-green-600 text-center mt-0.5 flex items-center justify-center gap-1 font-medium">
                ✓ PIN ready! Tap "Claim" to create your account.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1 flex-shrink-0">
            <Button
              onClick={handleCreateAccount}
              disabled={loading || !name.trim() || pin.length !== 6}
              className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  Claim {pointsToEarn} Points
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
              className="w-full h-9 text-xs text-gray-400"
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}