import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { PinInput } from "../components/PinInput";
import { User, Smartphone, Award, LogOut, ShieldCheck, Key, Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut, loading, refreshProfile, accessToken } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  
  // Switch to PIN state
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [switchingPin, setSwitchingPin] = useState(false);

  useEffect(() => {
    // Refresh profile on mount to get latest points
    if (!loading && user && accessToken) {
      refreshProfile();
    }
  }, [loading, user, accessToken]);

  const handleSignOut = async () => {
    console.log("🚪 Sign out clicked");
    setIsSigningOut(true);
    signOut();
    
    // Navigate immediately - signOut is synchronous and clears everything
    console.log("✅ Navigating to home after sign out");
    navigate("/", { replace: true });
  };

  const getTierName = (points: number) => {
    if (points >= 1000) return "Diamond";
    if (points >= 500) return "Gold";
    return "Silver";
  };

  const handleSwitchToPin = async () => {
    setPinError("");

    // Validate inputs
    if (!currentPassword) {
      setPinError("Please enter your current password");
      return;
    }

    if (newPin.length !== 6) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }

    if (newPin !== confirmNewPin) {
      setPinError("PINs do not match");
      return;
    }

    setSwitchingPin(true);

    try {
      const response = await fetch(`${API_BASE}/switch-to-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify({
          currentPassword,
          newPin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to switch to PIN");
      }

      toast.success("Successfully switched to PIN login! Please use your PIN next time you login.");
      setShowPinDialog(false);
      setCurrentPassword("");
      setNewPin("");
      setConfirmNewPin("");
      
      // Refresh profile to update usesPin flag
      if (accessToken) {
        await refreshProfile();
      }
    } catch (error) {
      console.error("Switch to PIN error:", error);
      setPinError(error instanceof Error ? error.message : "Failed to switch to PIN");
    } finally {
      setSwitchingPin(false);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showBack title="Profile" />
        <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100vh - 64px)" }}>
          <div className="text-center max-w-sm">
            <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Profile Access</h2>
            <p className="text-muted-foreground mb-6">Please log in to view your profile and loyalty points</p>
            <Button onClick={() => navigate("/login")} className="w-full">
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Profile" />
      
      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* User Info Card */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{user.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>{user.phone}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Loyalty Tier</span>
              </div>
              <span className="font-semibold text-primary">
                {getTierName(user.points)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium">Total Points</span>
              </div>
              <span className="font-semibold text-accent">{user.points} pts</span>
            </div>

            {user.isAdmin && (
              <div className="flex items-center justify-between bg-accent/10 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium">Admin Access</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
          <h3 className="font-semibold mb-3">Quick Actions</h3>
          
          <Button
            onClick={() => navigate("/order-history")}
            variant="outline"
            className="w-full justify-start"
          >
            <Smartphone className="w-4 h-4 mr-2" />
            Order History
          </Button>

          <Button
            onClick={() => navigate("/rewards")}
            variant="outline"
            className="w-full justify-start"
          >
            <Award className="w-4 h-4 mr-2" />
            Rewards & Offers
          </Button>

          {user.isAdmin && (
            <Button
              onClick={() => navigate("/admin")}
              variant="outline"
              className="w-full justify-start border-accent text-accent hover:bg-accent/10"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Admin Dashboard
            </Button>
          )}
        </div>

        {/* Security Settings - Only show for non-admin users without PIN */}
        {!user.isAdmin && !(user as any).usesPin && (
          <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
            <h3 className="font-semibold mb-3">Security Settings</h3>
            
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm mb-1">Switch to PIN Login</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Use a 6-digit PIN for faster, more convenient mobile login
                  </p>
                  <Button
                    onClick={() => setShowPinDialog(true)}
                    variant="outline"
                    size="sm"
                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Set Up PIN
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show PIN status if user uses PIN */}
        {(user as any).usesPin && (
          <div className="bg-white rounded-xl shadow-md p-5">
            <div className="flex items-center gap-3 text-green-600">
              <Key className="w-5 h-5" />
              <div>
                <p className="font-medium text-sm">PIN Login Enabled</p>
                <p className="text-xs text-muted-foreground">You're using secure PIN authentication</p>
              </div>
            </div>
          </div>
        )}

        {/* Sign Out */}
        <Button
          onClick={handleSignOut}
          variant="destructive"
          className="w-full"
          disabled={isSigningOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </Button>
      </main>

      {/* Switch to PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Switch to PIN Login</DialogTitle>
            <DialogDescription>
              Set up a 6-digit PIN for faster, more convenient mobile login
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPinError("");
                }}
                disabled={switchingPin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPin">New 6-Digit PIN</Label>
              <PinInput
                value={newPin}
                onChange={(value) => {
                  setNewPin(value);
                  setPinError("");
                }}
                error={!!pinError && newPin.length === 6}
                disabled={switchingPin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmNewPin">Confirm PIN</Label>
              <PinInput
                value={confirmNewPin}
                onChange={(value) => {
                  setConfirmNewPin(value);
                  setPinError("");
                }}
                error={!!pinError && confirmNewPin.length === 6}
                disabled={switchingPin}
              />
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <div className="bg-blue-50 p-3 rounded text-xs text-muted-foreground">
              <ul className="list-disc list-inside space-y-1">
                <li>Your PIN must be exactly 6 digits</li>
                <li>You'll use this PIN for future logins</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPinDialog(false);
                setCurrentPassword("");
                setNewPin("");
                setConfirmNewPin("");
                setPinError("");
              }}
              disabled={switchingPin}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSwitchToPin}
              disabled={switchingPin || !currentPassword || newPin.length !== 6 || confirmNewPin.length !== 6}
              className="bg-primary hover:bg-primary/90"
            >
              {switchingPin ? "Switching..." : "Switch to PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}