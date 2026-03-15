import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useMascot } from "../lib/mascot-context";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { User, Smartphone, Award, LogOut, ShieldCheck, Key, Bot } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut, loading, refreshProfile, accessToken } = useAuth();
  const { isMascotVisible, hideMascot, showMascot } = useMascot();
  const [isSigningOut, setIsSigningOut] = useState(false);

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

          {/* Admin access moved to /staff portal — no longer accessible from customer side */}
        </div>

        {/* Security Info */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <div className="flex items-center gap-3 text-green-600">
            <Key className="w-5 h-5" />
            <div>
              <p className="font-medium text-sm">PIN Login Enabled</p>
              <p className="text-xs text-muted-foreground">You're using secure 6-digit PIN authentication</p>
            </div>
          </div>
        </div>

        {/* Mascot Preferences */}
        {APP_CONFIG.mascot.enabled && (
          <div className="bg-white rounded-xl shadow-md p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5" style={{ color: APP_CONFIG.brand.primaryColor }} />
                <div>
                  <p className="font-medium text-sm">Chef Mascot</p>
                  <p className="text-xs text-muted-foreground">
                    {isMascotVisible ? "Showing tips & greetings" : "Hidden for 30 minutes"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => isMascotVisible ? hideMascot() : showMascot()}
                className="relative w-11 h-6 rounded-full transition-colors duration-200"
                style={{
                  backgroundColor: isMascotVisible ? APP_CONFIG.brand.primaryColor : "#D1D5DB",
                }}
                aria-label={isMascotVisible ? "Hide mascot" : "Show mascot"}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
                  style={{
                    transform: isMascotVisible ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </button>
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
    </div>
  );
}