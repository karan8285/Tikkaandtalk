import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { APP_CONFIG } from "./config";

// ─── Session-based mascot visibility ────────────────────────────
// When the user dismisses the mascot, it stays hidden for 30 minutes.
// After that (or on a new session), it re-appears automatically.

const STORAGE_KEY = "mascot_hidden_at";
const HIDE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface MascotContextValue {
  /** Whether mascot should be shown (config enabled + not user-dismissed) */
  isMascotVisible: boolean;
  /** Dismiss mascot for 30 minutes */
  hideMascot: () => void;
  /** Re-enable mascot immediately */
  showMascot: () => void;
}

const MascotContext = createContext<MascotContextValue>({
  isMascotVisible: true,
  hideMascot: () => {},
  showMascot: () => {},
});

function isHiddenExpired(): boolean {
  try {
    const hiddenAt = sessionStorage.getItem(STORAGE_KEY);
    if (!hiddenAt) return true; // not hidden
    const elapsed = Date.now() - parseInt(hiddenAt, 10);
    return elapsed >= HIDE_DURATION_MS;
  } catch {
    return true;
  }
}

export function MascotProvider({ children }: { children: ReactNode }) {
  const [userDismissed, setUserDismissed] = useState(() => !isHiddenExpired());

  // Check expiry periodically (every 60s)
  useEffect(() => {
    if (!userDismissed) return;
    const interval = setInterval(() => {
      if (isHiddenExpired()) {
        setUserDismissed(false);
        try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [userDismissed]);

  const hideMascot = useCallback(() => {
    setUserDismissed(true);
    try { sessionStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
  }, []);

  const showMascot = useCallback(() => {
    setUserDismissed(false);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const isMascotVisible = APP_CONFIG.mascot.enabled && !userDismissed;

  return (
    <MascotContext.Provider value={{ isMascotVisible, hideMascot, showMascot }}>
      {children}
    </MascotContext.Provider>
  );
}

export function useMascot() {
  return useContext(MascotContext);
}
