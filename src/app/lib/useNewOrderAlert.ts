/**
 * useNewOrderAlert — Shared hook for playing a sound + toast when new orders arrive.
 *
 * On first call (mount), it silently registers all existing order IDs as "known".
 * On subsequent calls, any ID not in the known set triggers a sound alert + toast.
 * Uses Web Audio API — no external sound file required.
 *
 * Fixes for Web Audio autoplay policy:
 * - Uses a persistent, shared AudioContext (reused across all calls)
 * - Auto-resumes the AudioContext on every play attempt
 * - Primes the AudioContext on the first user gesture (click/touch/keydown)
 * - Exports `isAudioPrimed` so staff pages can show "Tap to enable sound" prompt
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ─── Shared AudioContext (module-level singleton) ───────────────────────────
let sharedCtx: AudioContext | null = null;
let audioPrimed = false;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Prime (resume) the AudioContext — must be called from a user gesture handler */
function primeAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().then(() => {
      audioPrimed = true;
    }).catch(() => {});
  } else if (ctx && ctx.state === "running") {
    audioPrimed = true;
  }
}

// Auto-prime on first user interaction (click, touch, keydown)
if (typeof window !== "undefined") {
  const gestures = ["click", "touchstart", "keydown"];
  const onGesture = () => {
    primeAudio();
    // Keep listeners for a bit in case the first gesture doesn't fully prime
    if (audioPrimed) {
      gestures.forEach((evt) => window.removeEventListener(evt, onGesture, true));
    }
  };
  gestures.forEach((evt) => window.addEventListener(evt, onGesture, true));
}

/** Generates a loud, urgent multi-tone alert via Web Audio API */
async function playAlertSound(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    // Always try to resume — this is the key fix for autoplay policy
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // If still suspended after resume attempt, audio is blocked
    if (ctx.state !== "running") {
      console.warn("AudioContext still suspended — user gesture required");
      return false;
    }

    audioPrimed = true;

    const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = "square") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      // Loud volume — max safe level
      gain.gain.setValueAtTime(1.0, startTime);
      gain.gain.setValueAtTime(1.0, startTime + duration * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;

    // === Round 1: Urgent triple beep ===
    playTone(1200, now, 0.15, "square");
    playTone(1200, now + 0.22, 0.15, "square");
    playTone(1500, now + 0.44, 0.25, "square");

    // === Round 2: Repeat after short pause (makes it feel like a real alert) ===
    playTone(1200, now + 0.9, 0.15, "square");
    playTone(1200, now + 1.12, 0.15, "square");
    playTone(1500, now + 1.34, 0.25, "square");

    // === Round 3: Final attention-grab ===
    playTone(1600, now + 1.8, 0.12, "sawtooth");
    playTone(1600, now + 1.98, 0.12, "sawtooth");
    playTone(1800, now + 2.16, 0.3, "sawtooth");

    return true;
  } catch (e) {
    // Audio not supported or blocked — silently ignore
    console.warn("Audio alert not available:", e);
    return false;
  }
}

interface UseNewOrderAlertOptions {
  /** Label used in the toast, e.g. "Kitchen", "Cashier" */
  label?: string;
}

export function useNewOrderAlert(options: UseNewOrderAlertOptions = {}) {
  const { label = "New" } = options;
  const knownIdsRef = useRef<Set<string> | null>(null); // null = first load
  const initializedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(audioPrimed);

  // Poll audioPrimed state so the component can show the prompt
  useEffect(() => {
    if (soundEnabled) return;
    const interval = setInterval(() => {
      if (audioPrimed) {
        setSoundEnabled(true);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  /**
   * Call this every time you receive a fresh list of orders.
   * Pass ALL order IDs from the response (not just filtered ones).
   */
  const checkForNewOrders = useCallback(
    (orderIds: string[]) => {
      if (!initializedRef.current) {
        // First load — register all existing IDs silently
        knownIdsRef.current = new Set(orderIds);
        initializedRef.current = true;
        return;
      }

      const known = knownIdsRef.current!;
      const newIds = orderIds.filter((id) => !known.has(id));

      if (newIds.length > 0) {
        // Add new IDs to known set
        newIds.forEach((id) => known.add(id));

        // Play sound (async but we don't await — fire and forget)
        playAlertSound().then((played) => {
          if (!played) {
            // Sound couldn't play — show extra guidance in toast
            toast.warning("🔇 Sound alert blocked — tap anywhere on the page to enable sound", {
              duration: 8000,
            });
          }
        });

        // Show toast
        toast.success(
          newIds.length === 1
            ? `${label}: 1 new order!`
            : `${label}: ${newIds.length} new orders!`,
          { icon: "🔔", duration: 5000 }
        );
      }
    },
    [label]
  );

  /**
   * Manually prime audio — call this from a button click handler
   * if the automatic priming didn't work.
   */
  const enableSound = useCallback(() => {
    primeAudio();
    // Also play a short test beep so staff knows it's working
    playAlertSound().then((played) => {
      if (played) {
        setSoundEnabled(true);
        toast.success("Sound alerts enabled! ✅", { duration: 3000 });
      } else {
        toast.error("Could not enable sound. Please check your device volume.", { duration: 5000 });
      }
    });
  }, []);

  return { checkForNewOrders, soundEnabled, enableSound };
}
