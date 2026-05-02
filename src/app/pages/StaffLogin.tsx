import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth, getStaffDashboardRoute } from "../lib/staff-auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { PinInput } from "../components/PinInput";
import { CountryCodeSelect } from "../components/CountryCodeSelect";
import { Lock, Phone, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { useRestaurantLogo } from "../lib/useRestaurantLogo";
import { StaffAddToHomeScreen } from "../components/StaffAddToHomeScreen";

export default function StaffLogin() {
  const navigate = useNavigate();
  const { staff, signIn, loading: authLoading } = useStaffAuth();
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(APP_CONFIG.phone.defaultCountryCode);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const { logo: logoUrl, loading: logoLoading } = useRestaurantLogo();

  // Redirect if already logged in (must be in useEffect, not during render)
  useEffect(() => {
    if (!authLoading && staff) {
      navigate(getStaffDashboardRoute(staff.role), { replace: true });
    }
  }, [staff, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || pin.length < 6) {
      toast.error("Please enter phone number and 6-digit PIN");
      return;
    }

    try {
      setLoading(true);
      const fullPhone = `${countryCode}${phone.replace(/^0+/, '')}`;
      await signIn(fullPhone, pin);
      toast.success("Welcome back!");
      // Navigation handled by useEffect above when staff state updates
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Show nothing while checking auth or already authenticated
  if (authLoading || staff) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)' }}>
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)' }}>
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          {!logoLoading && logoUrl && (
            <img src={logoUrl} alt={APP_CONFIG.restaurant.name} className="h-14 sm:h-16 mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Staff Portal</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{APP_CONFIG.restaurant.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2 text-sm font-medium">
              <Phone className="w-4 h-4" /> Phone Number
            </Label>
            <div className="flex gap-2">
              <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <Input
                id="phone"
                type="tel"
                placeholder="8123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="flex-1"
                autoComplete="tel"
              />
            </div>
          </div>

          {/* PIN */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Lock className="w-4 h-4" /> 6-Digit PIN
            </Label>
            <PinInput value={pin} onChange={setPin} />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold text-white"
            style={{ backgroundColor: BRAND_COLOR }}
            disabled={loading || !phone || pin.length < 6}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </div>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-5 sm:mt-6 pt-3 sm:pt-4 border-t text-center">
          <p className="text-xs text-gray-400">
            This portal is for authorized staff only.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Contact your supervisor if you need access.
          </p>
        </div>
      </Card>

      {/* Staff Add to Home Screen */}
      <div className="w-full max-w-md mt-3 sm:mt-4">
        <StaffAddToHomeScreen variant="card" />
      </div>

      {/* Android APK Download */}
      <div className="w-full max-w-md mt-3">
        <a
          href="/tnt-staff-debug.apk"
          download="TikkaNtalk-Staff.apk"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-300 transition-colors text-sm"
        >
          <Download className="w-4 h-4" />
          Download Android App
        </a>
      </div>
    </div>
  );
}