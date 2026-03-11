import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PinInput } from "../components/PinInput";
import { Smartphone, AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import logoImage from "../lib/logo";
import { CountryCodeSelect } from "../components/CountryCodeSelect";
import { DEFAULT_COUNTRY_CODE, buildFullPhone } from "../lib/countryCodes";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE.code);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");

    // Validate PIN
    if (pin.length !== 6) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }

    if (pin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      // Build full international phone number (e.g., +628123456789)
      const rawPhone = phone.replace(/\D/g, "");
      const fullPhone = buildFullPhone(countryCode, rawPhone);
      await signUp(fullPhone, pin, name.trim());
      setSignupComplete(true);
    } catch (error) {
      console.error("❌ Registration error:", error);
      setPinError(error instanceof Error ? error.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (signupComplete) {
      // Read redirect from localStorage (set by Checkout page), fallback to location.state
      const authRedirect = localStorage.getItem("authRedirect");
      const fromState = location.state?.from as string | undefined;
      const redirectTo = authRedirect || (fromState === "/checkout" ? "/order" : fromState) || "/";
      
      console.log(`📝 SIGNUP: authRedirect=${authRedirect}, fromState=${fromState}, redirectTo=${redirectTo}`);
      
      // Clean up the redirect marker
      localStorage.removeItem("authRedirect");
      
      navigate(redirectTo, { replace: true });
    }
  }, [signupComplete, navigate, location.state]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Back Button */}
        <button
          onClick={() => {
            if (window.history.state?.idx > 0) {
              navigate(-1);
            } else {
              navigate("/", { replace: true });
            }
          }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src={logoImage} 
              alt="Tikka N Talk - An Indian Kitchen" 
              className="w-48 h-auto"
              style={{ 
                filter: "drop-shadow(0 2px 8px rgba(217, 26, 96, 0.15))",
                objectFit: "contain"
              }}
            />
          </div>
          <h1 className="text-2xl font-bold">Member Registration</h1>
          <p className="text-sm text-muted-foreground">Join our loyalty program to unlock vouchers & rewards</p>
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Number</Label>
              <div className="flex">
                <CountryCodeSelect
                  value={countryCode}
                  onChange={setCountryCode}
                />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="8123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  maxLength={13}
                  required
                  className="bg-input-background rounded-l-none border-l-0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your local number without leading zero
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin">Create 6-Digit PIN</Label>
              <PinInput
                value={pin}
                onChange={(value) => {
                  setPin(value);
                  setPinError("");
                }}
                error={!!pinError && pin.length === 6}
                autoFocus={false}
              />
              <p className="text-xs text-muted-foreground">
                Choose a secure 6-digit PIN for quick mobile login
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <PinInput
                value={confirmPin}
                onChange={(value) => {
                  setConfirmPin(value);
                  setPinError("");
                }}
                error={!!pinError && confirmPin.length === 6}
                autoFocus={false}
              />
              {pinError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12"
            >
              {loading ? "Registering..." : "Register as Member"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already a member? </span>
            <Link to="/login" state={{ from: location.state?.from }} className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}