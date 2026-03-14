// Centralized WhatsApp configuration
// Defaults are pulled from config; overridden at runtime by admin settings.

import { APP_CONFIG } from "./config";

/** Default WhatsApp number (fallback when not configured in admin) */
const DEFAULT_WHATSAPP_NUMBER = APP_CONFIG.whatsapp.defaultNumber;
const DEFAULT_WHATSAPP_DISPLAY = APP_CONFIG.whatsapp.defaultDisplay;

// Cached dynamic config from restaurant-status endpoint
let _cachedWhatsApp: { number: string; display: string } | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Set WhatsApp config from restaurant-status data (called by pages that fetch status) */
export function setWhatsAppConfig(number: string, display: string) {
  if (number) {
    _cachedWhatsApp = { number, display: display || `+${number}` };
    _cacheTimestamp = Date.now();
  }
}

/** Get current WhatsApp number — prefers admin-configured, falls back to default */
export function getWhatsAppNumber(): string {
  if (_cachedWhatsApp && (Date.now() - _cacheTimestamp < CACHE_TTL_MS)) {
    return _cachedWhatsApp.number;
  }
  return DEFAULT_WHATSAPP_NUMBER;
}

/** Get display-friendly WhatsApp number */
export function getWhatsAppDisplay(): string {
  if (_cachedWhatsApp && (Date.now() - _cacheTimestamp < CACHE_TTL_MS)) {
    return _cachedWhatsApp.display;
  }
  return DEFAULT_WHATSAPP_DISPLAY;
}

// Keep backward-compatible exports (used across many files)
export const WHATSAPP_NUMBER = DEFAULT_WHATSAPP_NUMBER;
export const WHATSAPP_DISPLAY = DEFAULT_WHATSAPP_DISPLAY;

/** Generate a wa.me link with optional pre-filled message */
export function getWhatsAppLink(message?: string): string {
  const number = getWhatsAppNumber();
  if (message) {
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${number}`;
}

/**
 * Ensure a phone number is formatted for wa.me links (digits only, with country code).
 * Handles all formats:
 *   "+628123456789" -> "628123456789"  (already international)
 *   "08123456789"   -> "628123456789"  (local with leading 0)
 *   "8123456789"    -> "628123456789"  (legacy without prefix)
 *   "628123456789"  -> "628123456789"  (already correct digits)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const defaultDial = APP_CONFIG.phone.defaultCountryDial;
  // Remove all non-digit characters (strips +, spaces, dashes)
  let digits = phone.replace(/\D/g, "");
  // If starts with 0, replace with default country dial code
  if (digits.startsWith("0")) {
    digits = defaultDial + digits.slice(1);
  }
  // If the number is short (no country code), prepend default dial code
  if (digits.length <= 12 && !digits.startsWith(defaultDial) && !digits.startsWith("1") && !digits.startsWith("44") && !digits.startsWith("91")) {
    digits = defaultDial + digits;
  }
  return digits;
}
