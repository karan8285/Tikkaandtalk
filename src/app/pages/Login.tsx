import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { useAuth } from "../lib/auth";
import { getRestaurantLogo } from "../lib/useRestaurantLogo";
import { CountryCodeSelect } from "../components/CountryCodeSelect";
import { DEFAULT_COUNTRY_CODE, buildFullPhone } from "../lib/countryCodes";
import { LOGO_ALT, APP_CONFIG } from "../lib/config";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PinInput } from "../components/PinInput";
import { ArrowLeft, Info } from "lucide-react";
import { toast } from "sonner";

// Login page component
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE.code);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginComplete, setLoginComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Build full international phone number
    const rawPhone = phone.replace(/\D/g, "");
    const fullPhone = buildFullPhone(countryCode, rawPhone);
    
    console.log(`📱 LOGIN: Submitting with phone: "${fullPhone}"`);
    console.log(`📱 LOGIN: Country code: ${countryCode}, local: ${rawPhone}`);

    try {
      // Mark that we're logging in (to prevent auto-logout during token initialization)
      sessionStorage.setItem("justLoggedIn", Date.now().toString());
      
      console.log(`📱 LOGIN: Calling signIn...`);
      await signIn(fullPhone, pin);
      toast.success("Signed in successfully!");
      
      console.log(`📱 LOGIN: SignIn completed, waiting before navigation...`);
      // Wait a bit before navigating to ensure auth state is set
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Mark login as complete - the useEffect below will handle navigation
      console.log(`📱 LOGIN: Marking login complete for redirect...`);
      setLoginComplete(true);
    } catch (error) {
      console.error(`📱 LOGIN ERROR:`, error);
      toast.error(error instanceof Error ? error.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  // Handle redirect after successful login via useEffect to ensure
  // React has processed auth state changes before navigating
  useEffect(() => {
    if (loginComplete) {
      const authRedirect = localStorage.getItem("authRedirect");
      const fromState = location.state?.from as string | undefined;
      const redirectTo = authRedirect || (fromState === "/checkout" ? "/order" : fromState) || "/";
      
      console.log(`📱 LOGIN: authRedirect=${authRedirect}, fromState=${fromState}, redirectTo=${redirectTo}`);
      
      localStorage.removeItem("authRedirect");
      navigate(redirectTo, { replace: true });
    }
  }, [loginComplete, navigate, location.state]);

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
              src={getRestaurantLogo()} 
              alt={LOGO_ALT} 
              className="w-48 h-auto"
              style={{ 
                filter: `drop-shadow(0 2px 8px ${APP_CONFIG.brand.primaryShadow})`,
                objectFit: "contain"
              }}
            />
          </div>
          <h1 className="text-2xl font-bold">Welcome Back</h1>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
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
              <p className="text-xs text-muted-foreground">Enter your local number without leading zero</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin">6-Digit PIN</Label>
              <PinInput
                value={pin}
                onChange={setPin}
                autoFocus={false}
              />
              
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                <span>
                  New members: Register to create your PIN.
                </span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Not a member yet? </span>
            <Link to="/signup" state={{ from: location.state?.from }} className="text-primary font-medium hover:underline">
              Register
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link to="/forgot-pin" className="text-xs text-muted-foreground hover:text-primary hover:underline">
              Forgot your PIN?
            </Link>
          </div>

          {/* Admin Access Info */}
          <div className="mt-6 pt-6 border-t border-border">
            {/* Admin Debug Button */}
            <div className="mt-4">
              <Link to="/admin-debug">
                
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}