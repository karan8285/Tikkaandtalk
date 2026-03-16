/**
 * useNewOrderAlert — Shared hook for playing a sound + toast when new orders arrive.
 *
 * On first call (mount), it silently registers all existing order IDs as "known".
 * On subsequent calls, any ID not in the known set triggers a sound alert + toast.
 * Uses Web Audio API — no external sound file required.
 */
import { useRef, useCallback } from "react";
import { toast } from "sonner";

/** Generates a loud, urgent multi-tone alert via Web Audio API */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

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

    // Cleanup context after sound finishes
    setTimeout(() => ctx.close(), 4000);
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