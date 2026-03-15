/**
 * useNewOrderAlert — Shared hook for playing a sound + toast when new orders arrive.
 *
 * On first call (mount), it silently registers all existing order IDs as "known".
 * On subsequent calls, any ID not in the known set triggers a sound alert + toast.
 * Uses Web Audio API — no external sound file required.
 */
import { useRef, useCallback } from "react";
import { toast } from "sonner";

/** Generates a pleasant two-tone "ding-ding" notification via Web Audio API */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // First ding
    playTone(880, now, 0.25);        // A5
    // Second ding (higher)
    playTone(1174.66, now + 0.18, 0.3); // D6

    // Cleanup context after sound finishes
    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    // Audio not supported or blocked — silently ignore
    console.warn("Audio alert not available:", e);
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

        // Play sound
        playAlertSound();

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

  return { checkForNewOrders };
}
