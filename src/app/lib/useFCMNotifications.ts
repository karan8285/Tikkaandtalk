/**
 * Stub for FCM notifications — used on web (Vercel).
 * Capacitor native app uses the real implementation via dynamic import.
 * This file ensures the import path resolves during web builds.
 */
export function useFCMNotifications() {
  // No-op on web. Real FCM setup is loaded dynamically in StaffLayout on native only.
}
