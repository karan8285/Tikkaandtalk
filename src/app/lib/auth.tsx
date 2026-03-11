import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
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
  signUp: (phone: string, pin: string, name: string) => Promise<void>;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

// Persist context across HMR reloads — when Vite hot-reloads this module,
// createContext() would create a NEW object, breaking existing consumers.
const AUTH_CTX_KEY = "__TIKKA_AUTH_CTX__";
const AuthContext = ((globalThis as any)[AUTH_CTX_KEY] ??=
  createContext<AuthContextType | undefined>(undefined)) as React.Context<AuthContextType | undefined>;

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
      // Validate that the token looks like a JWT (has 3 parts separated by dots)
      const tokenParts = savedToken.split('.');
      if (tokenParts.length === 3) {
        setAccessToken(savedToken);
        setUser(JSON.parse(savedUser));
      } else {
        console.warn("Invalid token format in localStorage, clearing...");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (phone: string, pin: string, name: string) => {
    try {
      const response = await fetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ phone, pin, name }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error(`Signup failed [${response.status}]:`, data.error);
        throw new Error(data.error || "Signup failed");
      }

      // After signup, sign in
      await signIn(phone, pin);
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  };

  const signIn = async (phone: string, pin: string) => {
    // Reset signedOut flag on new sign-in
    signedOutRef.current = false;
    
    try {
      const response = await fetch(`${API_BASE}/signin`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ phone, pin }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error(`Signin failed [${response.status}]:`, data.error);
        throw new Error(data.error || "Signin failed");
      }
      
      // Save to localStorage first
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      // Then update state
      setAccessToken(data.accessToken);
      setUser(data.user);
    } catch (error) {
      console.error("Signin error:", error);
      throw error;
    }
  };

  const signOut = () => {
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
  };

  const refreshProfile = async () => {
    if (!accessToken || signedOutRef.current) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/profile`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
      });

      // Check again after await - user may have signed out while fetch was in-flight
      if (signedOutRef.current) {
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        console.error(`Failed to refresh profile: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to refresh profile:", error);
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
    return defaultAuthContext;
  }
  return context;
}