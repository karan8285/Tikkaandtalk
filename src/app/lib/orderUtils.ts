import { APP_CONFIG } from "./config";

const PREFIX = APP_CONFIG.orders.prefix;

/**
 * Derives a short display order ID from the full order ID.
 * Example: "TNT00000102" -> "TNT-102"
 * Example: "TNT00000005" -> "TNT-5"
 * Example: "TNT00000999" -> "TNT-999"
 *
 * Logic: Strip the prefix, remove leading zeros, re-prefix with "{PREFIX}-"
 */
export function getShortOrderId(orderId: string): string {
  if (!orderId) return "";

  // Match the configured prefix followed by digits
  const re = new RegExp(`^${PREFIX}0*(\\d+)$`, "i");
  const match = orderId.match(re);
  if (match) {
    return `${PREFIX}-${match[1]}`;
  }

  // Fallback: just return the original ID
  return orderId;
}
