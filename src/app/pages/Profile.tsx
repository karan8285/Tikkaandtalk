import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useMascot } from "../lib/mascot-context";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { AddToHomeScreen } from "../components/AddToHomeScreen";
import { User, Smartphone, Award, LogOut, ShieldCheck, Key, Bot, Bell, BellOff, BellRing, KeyRound } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "../lib/config";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isCurrentlySubscribed, getPushPermissionStatus } from "../lib/pushNotifications";
import { toast } from "sonner";
import { ChangePinDialog } from "../components/ChangePinDialog";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut, loading, refreshProfile, accessToken } = useAuth();
  const { isMascotVisible, hideMascot, showMascot } = useMascot();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isStandalone, setIsStandalone] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);

  useEffect(() => {
    // Refresh profile on mount to get latest points
    if (!loading && user && accessToken) {
      refreshProfile();
    }
  }, [loading, user, accessToken]);

  // Check push notification status and standalone mode
  useEffect(() => {
    if (!user) return;
    const supported = isPushSupported();
    setPushSupported(supported);
    setPushPermission(getPushPermissionStatus());
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
    if (supported) {
      isCurrentlySubscribed().then(setPushEnabled);
    }
  }, [user]);

  const handleTogglePush = async () => {
    if (!user || pushToggling) return;
    setPushToggling(true);
    try {
      if (pushEnabled) {
        const success = await unsubscribeFromPush(user.id, accessToken || undefined);
        if (success) {
          setPushEnabled(false);
          toast.success("Push notifications disabled");
        }
      } else {
        const success = await subscribeToPush(user.id, accessToken || undefined);
        if (success) {
          setPushEnabled(true);
          setPushPermission("granted");
          toast.success("Push notifications enabled!");
        } else {
          const perm = getPushPermissionStatus();
          setPushPermission(perm);
          if (perm === "denied") {
            toast.error("Notifications blocked. Please enable in browser settings.");
          }
        }
      }
    } catch (err) {
      console.error("[Profile] Push toggle error:", err);
    } finally {
      setPushToggling(false);
    }
  };

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

  // Determine notification status info
  const getNotifStatusInfo = () => {
    if (pushEnabled) {
      return { icon: BellRing, color: "text-green-600", bg: "bg-green-100", label: "Active", desc: "Order updates & alerts on your device" };
    }
    if (pushPermission === "denied") {
      return { icon: BellOff, color: "text-red-500", bg: "bg-red-100", label: "Blocked", desc: "Blocked in browser settings" };
    }
    if (!pushSupported && !isStandalone) {
      return { icon: Bell, color: "text-amber-500", bg: "bg-amber-100", label: "Requires App", desc: "Install the app first to enable" };
    }
    return { icon: Bell, color: "text-gray-400", bg: "bg-gray-100", label: "Off", desc: "Tap to enable order alerts" };
  };

  const notifInfo = getNotifStatusInfo();
  const NotifIcon = notifInfo.icon;

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
        </div>

        {/* ─── App Setup Section ─── */}
        <div className="space-y-1">
          <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wider px-1 pt-2">
            App Setup
          </h3>

          {/* Add to Home Screen */}
          <AddToHomeScreen variant="card" />

          {/* Push Notifications — always show, with contextual content */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${notifInfo.bg} flex items-center justify-center flex-shrink-0`}>
                  <NotifIcon className={`w-4.5 h-4.5 ${notifInfo.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Push Notifications</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      pushEnabled
                        ? "bg-green-100 text-green-700"
                        : pushPermission === "denied"
                        ? "bg-red-100 text-red-600"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {notifInfo.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {notifInfo.desc}
                  </p>
                </div>
              </div>

              {/* Toggle: only show when push is supported or standalone */}
              {(pushSupported || isStandalone) && pushPermission !== "denied" && (
                <button
                  onClick={handleTogglePush}
                  disabled={pushToggling}
                  className="relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 flex-shrink-0"
                  style={{
                    backgroundColor: pushEnabled ? APP_CONFIG.brand.primaryColor : "#D1D5DB",
                  }}
                  aria-label={pushEnabled ? "Disable push notifications" : "Enable push notifications"}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
                    style={{
                      transform: pushEnabled ? "translateX(20px)" : "translateX(0)",
                    }}
                  />
                </button>
              )}
            </div>

            {/* Denied state: show how to unblock */}
            {pushPermission === "denied" && (
              <div className="mt-3 bg-red-50 rounded-lg p-3">
                <p className="text-[11px] text-red-700 font-medium mb-1">
                  Notifications are blocked in your browser settings
                </p>
                <ol className="text-[10px] text-red-600 list-decimal list-inside space-y-0.5 mb-2">
                  <li>Tap the lock/info icon in your browser's address bar</li>
                  <li>Find <strong>Notifications</strong> → change to <strong>Allow</strong></li>
                  <li>Refresh this page</li>
                </ol>
                <button
                  onClick={() => window.location.reload()}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-white active:scale-95 transition-transform"
                >
                  Refresh Page
                </button>
              </div>
            )}

            {/* Not supported + not standalone: nudge to install app first */}
            {!pushSupported && !isStandalone && pushPermission !== "denied" && (
              <div className="mt-3 bg-amber-50 rounded-lg p-3">
                <p className="text-[11px] text-amber-700 leading-snug">
                  <strong>Install the app</strong> to your home screen first (above), then push notifications will be available.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Security Info */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <div className="flex items-center gap-3 text-green-600">
            <KeyRound className="w-5 h-5" />
            <div>
              <p className="font-medium text-sm">PIN Login Enabled</p>
              <p className="text-xs text-muted-foreground">You're using secure 6-digit PIN authentication</p>
            </div>
          </div>
          <Button
            onClick={() => setChangePinOpen(true)}
            variant="outline"
            className="w-full justify-start mt-3"
          >
            <Key className="w-4 h-4 mr-2" />
            Change PIN
          </Button>
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
      {user && accessToken && (
        <ChangePinDialog
          open={changePinOpen}
          onOpenChange={setChangePinOpen}
          variant="customer"
          accessToken={accessToken}
          userId={user.id}
        />
      )}
    </div>
  );
}