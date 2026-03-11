/**
 * Derives a short display order ID from the full order ID.
 * Example: "TNT00000102" -> "TNT-102"
 * Example: "TNT00000005" -> "TNT-5"
 * Example: "TNT00000999" -> "TNT-999"
 * 
 * Logic: Strip the "TNT" prefix, remove leading zeros, re-prefix with "TNT-"
 */
export function getShortOrderId(orderId: string): string {
  if (!orderId) return "";
  
  // Match the TNT prefix followed by digits
  const match = orderId.match(/^TNT0*(\d+)$/i);
  if (match) {
    return `TNT-${match[1]}`;
  }
  
  // Fallback: just return the original ID
  return orderId;
}
