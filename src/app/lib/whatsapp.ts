// Centralized WhatsApp configuration
// Using Indonesian international format (+62) so anyone worldwide can message

/** WhatsApp number in international format for wa.me links (no + sign needed for wa.me) */
export const WHATSAPP_NUMBER = "628192515550";

/** Display-friendly format with +62 country code */
export const WHATSAPP_DISPLAY = "+62 819-2515-550";

/** Generate a wa.me link with optional pre-filled message */
export function getWhatsAppLink(message?: string): string {
  if (message) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${WHATSAPP_NUMBER}`;
}

/**
 * Ensure a phone number is formatted for wa.me links (digits only, with country code).
 * Handles all formats:
 *   "+628123456789" → "628123456789"  (already international)
 *   "08123456789"   → "628123456789"  (Indonesian local with leading 0)
 *   "8123456789"    → "628123456789"  (legacy without prefix)
 *   "628123456789"  → "628123456789"  (already correct digits)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters (strips +, spaces, dashes)
  let digits = phone.replace(/\D/g, "");
  // If starts with 0, replace with 62 (Indonesian local → international)
  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  }
  // If the number is short (no country code), prepend 62
  // A number with a country code is typically > 10 digits; Indonesian local numbers are 9-12 digits
  // But since we now store full international, most numbers will already start with a country code.
  // Only prepend 62 if it doesn't already start with a known country code (simple heuristic: check for 62)
  if (digits.length <= 12 && !digits.startsWith("62") && !digits.startsWith("1") && !digits.startsWith("44") && !digits.startsWith("91")) {
    // Short number without recognizable country code — assume Indonesian
    digits = "62" + digits;
  }
  return digits;
}
