import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PinInput } from "../components/PinInput";
import { Smartphone, Info, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import logoImage from "figma:asset/eaec9b840a2852be3b4c61f12d73c18841efc0f2.png";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [usePin, setUsePin] = useState(true); // Default to PIN for better UX
  const [loginComplete, setLoginComplete] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.slice(0, 10);
    
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log(`📱 LOGIN: Submitting with phone: "${phone}"`);
    console.log(`📱 LOGIN: Phone length: ${phone.length}`);
    console.log(`📱 LOGIN: Phone has dashes: ${phone.includes('-')}`);

    try {
      // Mark that we're logging in (to prevent auto-logout during token initialization)
      sessionStorage.setItem("justLoggedIn", Date.now().toString());
      
      console.log(`📱 LOGIN: Calling signIn...`);
      await signIn(phone, password);
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
          onMouseDown={(e) => {
            e.preventDefault();
            navigate(-1);
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
          <h1 className="text-2xl font-bold">Welcome Back</h1>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-md p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g., 081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={12}
                required
                className="bg-input-background"
              />
              <p className="text-xs text-muted-foreground">Phone number (up to 12 digits)</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">
                  {usePin ? "6-Digit PIN" : "Password"}
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setUsePin(!usePin);
                    setPassword("");
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {usePin ? "Use Password" : "Use PIN"}
                </button>
              </div>
              
              {usePin ? (
                <PinInput
                  value={password}
                  onChange={setPassword}
                  autoFocus={false}
                />
              ) : (
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-input-background"
                />
              )}
              
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                <span>
                  {usePin 
                    ? "New users: Sign up to create your PIN. Admin: Use password login." 
                    : "Legacy password login for existing users"
                  }
                </span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link to="/signup" state={{ from: location.state?.from }} className="text-primary font-medium hover:underline">
              Sign up
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