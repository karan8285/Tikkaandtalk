/**
 * Platform-agnostic storage abstraction.
 * Uses @capacitor/preferences on native (Capacitor/Android),
 * falls back to localStorage on web (PWA).
 */
let Preferences: any = null;

async function loadCapacitorPreferences() {
  if (Preferences !== null) return;
  try {
    const mod = await import('@capacitor/preferences');
    Preferences = mod.Preferences;
  } catch {
    Preferences = false;
  }
}

async function isCapacitorNative(): Promise<boolean> {
  try {
    if (typeof (window as any).Capacitor === 'undefined') return false;
    const result = await (window as any).Capacitor.isNativePlatform();
    return result === true;
  } catch {
    return false;
  }
}

let _native: boolean | null = null;
async function isNative(): Promise<boolean> {
  if (_native !== null) return _native;
  _native = await isCapacitorNative();
  return _native;
}

export async function getItem(key: string): Promise<string | null> {
  if (await isNative()) {
    await loadCapacitorPreferences();
    if (Preferences) {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }
  }
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (await isNative()) {
    await loadCapacitorPreferences();
    if (Preferences) {
      await Preferences.set({ key, value });
      return;
    }
  }
  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (await isNative()) {
    await loadCapacitorPreferences();
    if (Preferences) {
      await Preferences.remove({ key });
      return;
    }
  }
  localStorage.removeItem(key);
}

export async function clear(): Promise<void> {
  if (await isNative()) {
    await loadCapacitorPreferences();
    if (Preferences) {
      await Preferences.clear();
      return;
    }
  }
  localStorage.clear();
}
