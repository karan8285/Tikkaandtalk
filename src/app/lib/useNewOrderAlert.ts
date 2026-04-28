/**
 * useNewOrderAlert — plays sound + toast when new orders arrive.
 *
 * On native (Capacitor Android): uses android res/raw/alert.wav
 * On web: uses Web Audio API (existing behavior)
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ─── Detect Capacitor native ────────────────────────────────────────
let _isNative: boolean | null = null;

function isNativePlatform(): boolean {
  if (_isNative !== null) return _isNative;
  try {
    const Cap = (window as any).Capacitor;
    _isNative = Cap?.isNativePlatform?.() === true;
  } catch {
    _isNative = false;
  }
  return _isNative;
}

// ─── Native audio player (Android raw resource) ────────────────────
let nativeAudio: HTMLAudioElement | null = null;

async function playNativeSound(): Promise<boolean> {
  try {
    if (!nativeAudio) {
      nativeAudio = new Audio();
      nativeAudio.preload = 'auto';
      (nativeAudio as any).src = 'file:///android_asset/public/alert.wav';
    }
    nativeAudio.currentTime = 0;
    nativeAudio.volume = 1.0;
    await nativeAudio.play();
    console.log('[alert] ✅ played via file:///android_asset');
    return true;
  } catch (err) {
    console.warn('[alert] native failed:', err);
    nativeAudio = null;
    return false;
  }
}

// Fallback Web Audio beep — safe for native too (no user-gesture restriction on AudioContext for programmatic tones)
async function playBeepFallback(): Promise<boolean> {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.setValueAtTime(1800, t + 0.15);
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
    await ctx.resume();
    return true;
  } catch {
    return false;
  }
}

// ─── Web Audio API (existing behavior for web/PWA) ─────────────────

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

function primeAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().then(() => { audioPrimed = true; }).catch(() => {});
  } else if (ctx && ctx.state === "running") {
    audioPrimed = true;
  }
}

// Auto-prime on first user interaction
if (typeof window !== "undefined") {
  const gestures = ["click", "touchstart", "keydown"];
  const onGesture = () => {
    primeAudio();
    if (audioPrimed) {
      gestures.forEach((evt) => window.removeEventListener(evt, onGesture, true));
    }
  };
  gestures.forEach((evt) => window.addEventListener(evt, onGesture, true));
}

async function playWebSound(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") return false;

    audioPrimed = true;

    const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = "square") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(1.0, startTime);
      gain.gain.setValueAtTime(1.0, startTime + duration * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(1200, now, 0.15, "square");
    playTone(1200, now + 0.22, 0.15, "square");
    playTone(1500, now + 0.44, 0.25, "square");
    playTone(1200, now + 0.9, 0.15, "square");
    playTone(1200, now + 1.12, 0.15, "square");
    playTone(1500, now + 1.34, 0.25, "square");
    playTone(1600, now + 1.8, 0.12, "sawtooth");
    playTone(1600, now + 1.98, 0.12, "sawtooth");
    playTone(1800, now + 2.16, 0.3, "sawtooth");
    return true;
  } catch {
    return false;
  }
}

// ─── Unified play function ──────────────────────────────────────────

async function playAlertSound(): Promise<boolean> {
  if (isNativePlatform()) {
    const played = await playNativeSound();
    if (played) return true;
    // Native failed — try beep fallback on native too
    return playBeepFallback();
  }
  return playWebSound();
}

// ─── Hook ─────────────────────────────────────────────────────────

interface UseNewOrderAlertOptions {
  label?: string;
}

export function useNewOrderAlert(options: UseNewOrderAlertOptions = {}) {
  const { label = "New" } = options;
  const knownIdsRef = useRef<Set<string> | null>(null);
  const initializedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(audioPrimed);

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

  const checkForNewOrders = useCallback(
    (orderIds: string[]) => {
      if (!initializedRef.current) {
        knownIdsRef.current = new Set(orderIds);
        initializedRef.current = true;
        return;
      }

      const known = knownIdsRef.current!;
      const newIds = orderIds.filter((id) => !known.has(id));

      if (newIds.length > 0) {
        newIds.forEach((id) => known.add(id));

        playAlertSound().then((played) => {
          if (!played) {
            toast.warning("🔇 Sound alert blocked — tap anywhere on the page to enable sound", {
              duration: 8000,
            });
          }
        });

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

  const enableSound = useCallback(() => {
    primeAudio();
    playWebSound().then((played) => {
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
