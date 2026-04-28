import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "./config";
import { fetchWithRetry } from "./fetchWithRetry";
import { getItem, setItem, removeItem } from "./storage";

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

// Persist context across HMR reloads
const AUTH_CTX_KEY = APP_CONFIG.keys.authContextKey;
const AuthContext = ((globalThis as any)[AUTH_CTX_KEY] ??=
  createContext<AuthContextType | undefined>(undefined)) as React.Context<AuthContextType | undefined>;

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const signedOutRef = useRef(false);

  useEffect(() => {
    (async () => {
      const savedToken = await getItem("accessToken");
      const savedUser = await getItem("user");

      if (savedToken && savedUser) {
        const tokenParts = savedToken.split('.');
        if (tokenParts.length === 3) {
          setAccessToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          await removeItem("accessToken");
          await removeItem("user");
        }
      }
      setLoading(false);
    })();
  }, []);

  const signUp = async (phone: string, pin: string, name: string) => {
    try {
      const response = await fetchWithRetry(`${API_BASE}/signup`, {
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

      await signIn(phone, pin);
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  };

  const signIn = async (phone: string, pin: string) => {
    signedOutRef.current = false;

    const response = await fetchWithRetry(`${API_BASE}/signin`, {
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

    await setItem("accessToken", data.accessToken);
    await setItem("user", JSON.stringify(data.user));

    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const signOut = () => {
    signedOutRef.current = true;
    setAccessToken(null);
    setUser(null);
    removeItem("accessToken");
    removeItem("user");
    removeItem("customToken");
    sessionStorage.removeItem("justLoggedIn");
  };

  const refreshProfile = async () => {
    if (!accessToken || signedOutRef.current) return;

    try {
      const response = await fetchWithRetry(`${API_BASE}/profile`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
      });

      if (signedOutRef.current) return;

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        await setItem("user", JSON.stringify(data.user));
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

AuthProvider.displayName = 'AuthProvider';

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
    return defaultAuthContext;
  }
  return context;
}