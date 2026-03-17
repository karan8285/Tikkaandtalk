import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useAuth } from "./auth";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "./fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function getSessionId(): string {
  let sessionId = sessionStorage.getItem("presenceSessionId");
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem("presenceSessionId", sessionId);
  }
  return sessionId;
}

async function sendHeartbeat(payload: {
  sessionId: string;
  page: string;
  userId?: string | null;
  userName?: string | null;
  userPhone?: string | null;
  isGuest: boolean;
}) {
  try {
    await fetchWithRetry(`${API_BASE}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Heartbeat failures should never affect user experience
  }
}

/**
 * Hook that sends presence heartbeats to the server every 30 seconds.
 * Place this in RootLayout so it runs on every page.
 * It tracks the current page + whether the user is logged in or a guest.
 */
export function usePresence() {
  const { user } = useAuth();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageRef = useRef(location.pathname);

  // Keep page ref updated
  useEffect(() => {
    pageRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const sessionId = getSessionId();

    const beat = () => {
      sendHeartbeat({
        sessionId,
        page: pageRef.current,
        userId: user?.id || null,
        userName: user?.name || null,
        userPhone: user?.phone || null,
        isGuest: !user,
      });
    };

    // Send immediately on mount / user change
    beat();

    // Set interval
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user?.id]); // Re-run when user logs in/out

  // Also send heartbeat on page change (not just every 30s)
  useEffect(() => {
    const sessionId = getSessionId();
    sendHeartbeat({
      sessionId,
      page: location.pathname,
      userId: user?.id || null,
      userName: user?.name || null,
      userPhone: user?.phone || null,
      isGuest: !user,
    });
  }, [location.pathname]);
}