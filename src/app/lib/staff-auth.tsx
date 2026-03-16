import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

export type StaffRole = 'superuser' | 'manager' | 'cashier' | 'kitchen' | 'delivery';

export interface StaffUser {
  id: string;
  phone: string;
  name: string;
  role: StaffRole;
}

interface StaffAuthContextType {
  staff: StaffUser | null;
  accessToken: string | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => void;
}

const STAFF_CTX_KEY = "__TIKKA_STAFF_AUTH_CTX__";
const StaffAuthContext = ((globalThis as any)[STAFF_CTX_KEY] ??=
  createContext<StaffAuthContextType | undefined>(undefined)) as React.Context<StaffAuthContextType | undefined>;

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

// Role display labels
export const ROLE_LABELS: Record<StaffRole, string> = {
  superuser: "Super User",
  manager: "Manager",
  cashier: "Cashier",
  kitchen: "Kitchen Staff",
  delivery: "Delivery",
};

// Role colors for badges
export const ROLE_COLORS: Record<StaffRole, string> = {
  superuser: "bg-red-100 text-red-800",
  manager: "bg-blue-100 text-blue-800",
  cashier: "bg-green-100 text-green-800",
  kitchen: "bg-orange-100 text-orange-800",
  delivery: "bg-purple-100 text-purple-800",
};

// Permission definitions
export const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  superuser: ['all'],
  manager: ['orders', 'customers', 'sales', 'analytics', 'vouchers', 'tiers', 'menu', 'special', 'kids', 'flash', 'parties', 'celebrations', 'layout', 'custom', 'insights', 'payments', 'notifications'],
  cashier: ['orders', 'payments'],
  kitchen: ['kitchen'],
  delivery: ['delivery'],
};

export function hasPermission(role: StaffRole | undefined, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('all') || perms.includes(permission);
}

// Role-based route mapping
export function getStaffDashboardRoute(role: StaffRole): string {
  switch (role) {
    case 'superuser':
    case 'manager':
      return '/staff/admin';
    case 'cashier':
      return '/staff/cashier';
    case 'kitchen':
      return '/staff/kitchen';
    case 'delivery':
      return '/staff/delivery';
    default:
      return '/staff';
  }
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("staffAccessToken");
    const savedStaff = localStorage.getItem("staffUser");
    const savedExpiry = localStorage.getItem("staffTokenExpiry");

    if (savedToken && savedStaff && savedExpiry) {
      // Check 24h expiry
      const expiryTime = parseInt(savedExpiry, 10);
      if (Date.now() < expiryTime) {
        const tokenParts = savedToken.split('.');
        if (tokenParts.length === 3) {
          setAccessToken(savedToken);
          setStaff(JSON.parse(savedStaff));
        }
      } else {
        // Session expired
        localStorage.removeItem("staffAccessToken");
        localStorage.removeItem("staffUser");
        localStorage.removeItem("staffTokenExpiry");
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (phone: string, pin: string) => {
    try {
      const response = await fetch(`${API_BASE}/staff/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ phone, pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Staff sign-in failed");
      }

      const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      localStorage.setItem("staffAccessToken", data.accessToken);
      localStorage.setItem("staffUser", JSON.stringify(data.staff));
      localStorage.setItem("staffTokenExpiry", expiry.toString());

      setAccessToken(data.accessToken);
      setStaff(data.staff);
    } catch (error) {
      console.error("Staff signin error:", error);
      throw error;
    }
  };

  const signOut = () => {
    setAccessToken(null);
    setStaff(null);
    localStorage.removeItem("staffAccessToken");
    localStorage.removeItem("staffUser");
    localStorage.removeItem("staffTokenExpiry");
  };

  return (
    <StaffAuthContext.Provider value={{ staff, accessToken, loading, signIn, signOut }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

const defaultStaffAuth: StaffAuthContextType = {
  staff: null,
  accessToken: null,
  loading: true,
  signIn: async () => { throw new Error("StaffAuthProvider not available"); },
  signOut: () => {},
};

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (!context) return defaultStaffAuth;
  return context;
}