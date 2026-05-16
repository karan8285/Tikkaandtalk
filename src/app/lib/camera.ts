/**
 * Camera Plugin — direct native camera launch for proof-of-delivery photos.
 * Bypasses Android WebView file input limitations.
 * Returns image as base64 data URL for direct use.
 */

interface CaptureResult {
  base64: string;
  path: string;
}

function getCameraPlugin() {
  try {
    return (window as any).Capacitor?.Plugins?.Camera || null;
  } catch {
    return null;
  }
}

function getCameraPermissionsPlugin() {
  try {
    return (window as any).Capacitor?.Plugins?.CameraPermissions || null;
  } catch {
    return null;
  }
}

/** Open native camera and return captured photo as base64 */
export async function openNativeCamera(): Promise<CaptureResult> {
  const plugin = getCameraPlugin();
  if (!plugin) {
    throw new Error("Camera plugin not available");
  }
  const result = await plugin.requestPermissionAndCapture();
  return { base64: result.base64, path: result.path };
}

/** Check if camera permission is already granted */
export async function hasCameraPermission(): Promise<boolean> {
  try {
    const plugin = getCameraPermissionsPlugin();
    if (plugin) {
      const result = await plugin.hasPermission();
      return !!result?.granted;
    }
    const camera = getCameraPlugin();
    if (camera) {
      const result = await camera.hasPermission();
      return !!result?.granted;
    }
    return false;
  } catch {
    return false;
  }
}

/** Request camera permission via CameraPermissionsPlugin, then open camera */
export async function requestCameraPermission(): Promise<boolean> {
  const perms = getCameraPermissionsPlugin();
  if (perms) {
    try {
      await perms.requestPermission();
    } catch {
      // Permission denied — but still try to open camera
    }
  }
  return hasCameraPermission();
}