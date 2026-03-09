import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

interface User {
  id: string;
  phone: string;
  name: string;
  points: number;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  signUp: (phone: string, password: string, name: string) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Ref to prevent in-flight requests from restoring state after signout
  const signedOutRef = useRef(false);

  useEffect(() => {
    // Load from localStorage on mount
    const savedToken = localStorage.getItem("accessToken");
    const savedUser = localStorage.getItem("user");
    
    if (savedToken && savedUser) {
      console.log("🔍 Found saved token in localStorage");
      console.log("🔑 Token preview:", savedToken.substring(0, 30) + "...");
      
      // Validate that the token looks like a JWT (has 3 parts separated by dots)
      const tokenParts = savedToken.split('.');
      if (tokenParts.length === 3) {
        console.log("✅ Token format looks valid");
        setAccessToken(savedToken);
        setUser(JSON.parse(savedUser));
      } else {
        console.warn("❌ Invalid token format in localStorage, clearing...");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (phone: string, password: string, name: string) => {
    console.log(`📝 SIGNUP ATTEMPT: Starting for phone: ${phone}, name: ${name}`);
    
    try {
      const response = await fetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ phone, password, name }),
      });

      console.log(`📝 SIGNUP: Response status: ${response.status}`);
      const data = await response.json();
      console.log(`📝 SIGNUP: Response data:`, data);
      
      if (!response.ok) {
        console.error(`❌ SIGNUP: Failed with status ${response.status}:`, data.error);
        throw new Error(data.error || "Signup failed");
      }

      console.log(`📝 SIGNUP: User created, now signing in...`);
      // After signup, sign in
      await signIn(phone, password);
    } catch (error) {
      console.error(`❌ SIGNUP ERROR:`, error);
      throw error;
    }
  };

  const signIn = async (phone: string, password: string) => {
    console.log(`🔐 SIGNIN ATTEMPT: Starting for phone: ${phone}`);
    // Reset signedOut flag on new sign-in
    signedOutRef.current = false;
    
    try {
      const response = await fetch(`${API_BASE}/signin`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ phone, password }),
      });

      console.log(`🔐 SIGNIN: Response status: ${response.status}`);
      console.log(`🔐 SIGNIN: Response ok: ${response.ok}`);

      const data = await response.json();
      console.log(`🔐 SIGNIN: Response data:`, data);
      
      if (!response.ok) {
        console.error(`❌ SIGNIN: Failed with status ${response.status}:`, data.error);
        throw new Error(data.error || "Signin failed");
      }
      
      console.log(`🔐 SIGNIN RESPONSE:`, data);
      console.log(`🔐 Access Token:`, data.accessToken);
      console.log(`🔐 Is Admin?:`, data.user?.isAdmin);
      
      // Save to localStorage first
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      // Then update state
      setAccessToken(data.accessToken);
      setUser(data.user);
      
      console.log(`✅ SIGNIN: Successfully signed in as ${data.user.name}`);
    } catch (error) {
      console.error(`❌ SIGNIN ERROR:`, error);
      console.error(`❌ Error message:`, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  };

  const signOut = () => {
    console.log("🚪 SignOut: Clearing auth state and localStorage");
    
    // Set signedOut flag FIRST to prevent in-flight refreshProfile from restoring state
    signedOutRef.current = true;
    
    // Clear state
    setAccessToken(null);
    setUser(null);
    
    // Clear all auth-related localStorage
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("customToken");
    
    // Clear session markers
    sessionStorage.removeItem("justLoggedIn");
    
    console.log("✅ SignOut: Auth state cleared successfully");
  };

  const refreshProfile = async () => {
    if (!accessToken || signedOutRef.current) {
      // Silently return if no access token, user not logged in, or signed out
      return;
    }

    try {
      console.log(`🔄 Refreshing profile with token (first 30 chars): ${accessToken.substring(0, 30)}...`);
      const response = await fetch(`${API_BASE}/profile`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
      });

      console.log(`🔄 Profile refresh response status: ${response.status}`);

      // Check again after await - user may have signed out while fetch was in-flight
      if (signedOutRef.current) {
        console.log("🔄 Profile refresh aborted: user signed out during fetch");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Profile refreshed successfully!`);
        console.log(`   Previous points: ${user?.points || 0}`);
        console.log(`   New points: ${data.user.points}`);
        console.log(`   Points changed: ${(data.user.points || 0) !== (user?.points || 0)}`);
        
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to refresh profile: ${response.status}`, errorText);
      }
    } catch (error) {
      console.error("❌ Failed to refresh profile:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Add display name for better debugging and HMR support
AuthProvider.displayName = 'AuthProvider';

// Default auth context for when provider is temporarily unavailable (e.g., during HMR)
const defaultAuthContext: AuthContextType = {
  user: null,
  accessToken: null,
  loading: true,
  signUp: async () => { throw new Error("AuthProvider not available"); },
  signIn: async () => { throw new Error("AuthProvider not available"); },
  signOut: () => {},
  refreshProfile: async () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // During HMR, the provider may be temporarily unavailable.
    // Return a safe default instead of throwing to prevent crash loops.
    console.warn("useAuth: AuthContext not available, returning default (likely HMR)");
    return defaultAuthContext;
  }
  return context;
}