import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG } from "./config";
import { fetchWithRetry } from "./fetchWithRetry";
import { getItem, setItem, removeItem } from "./storage";
import { toast } from "sonner";

interface User {
  id: string;
  phone: string;
  name: string;
  /** Spendable balance. Goes down when points are redeemed or expire. */
  points: number;
  /** Lifetime points ever earned. This is what tier is derived from — see lib/tiers.ts.
   *  Optional because records created before it was introduced only have `points`. */
  totalPointsEarned?: number;
  /** Server-persisted tier name. Prefer deriving with tierForUser() over reading this. */
  tier?: string;
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
  /**
   * Call with any Response from a token-authenticated request. If it is a 401, the stored
   * session is cleared and the customer is told to sign in again; returns true so the caller
   * can skip its own error handling.
   *
   * This exists because the server only verifies the token on SOME endpoints. Browsing
   * vouchers (GET /user-vouchers) needs no token at all, but redeeming one
   * (POST /claim-voucher) does — so a customer with a dead token saw a full, working app
   * and then a raw "Invalid token" toast the moment they tried to redeem, with no way out.
   */
  handleAuthResponse: (response: { status: number }) => boolean;
}

/**
 * Read `exp` out of a JWT without verifying it. Signature verification is the server's job;
 * this is only so the client can avoid presenting a token it already knows is dead.
 */
function getTokenExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    // base64url -> base64, then pad
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims?.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * True if the token is structurally invalid or its `exp` has passed.
 * A token with no `exp` claim is treated as valid — the server is still the authority.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  if (token.split(".").length !== 3) return true;
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  // 30s of leeway so a token about to lapse mid-request is treated as already gone.
  return Date.now() >= exp * 1000 - 30_000;
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
        // Previously this only checked that the token had three dot-separated parts, so an
        // expired token restored a fully logged-in UI. Tokens last 7 days and the server
        // enforces `exp`, so that produced a session that looked fine but failed every
        // request the server actually authenticates.
        if (!isTokenExpired(savedToken)) {
          setAccessToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          await removeItem("accessToken");
          await removeItem("user");
          await removeItem("customToken");
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

  /**
   * Single place that reacts to a rejected token. Clears the session and tells the customer
   * what happened, instead of surfacing the server's raw "Invalid token" string.
   *
   * Two things land here: a token that lapsed after 7 days, and every token at once if
   * JWT_SECRET is rotated on the server.
   */
  const handleAuthResponse = (response: { status: number }) => {
    if (response?.status !== 401) return false;
    if (signedOutRef.current) return true; // already handled, don't double-toast
    signOut();
    toast.error("Your session expired. Please sign in again.");
    return true;
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
      } else if (!handleAuthResponse(response)) {
        console.error(`Failed to refresh profile: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to refresh profile:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, signUp, signIn, signOut, refreshProfile, handleAuthResponse }}
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
  handleAuthResponse: () => false,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}