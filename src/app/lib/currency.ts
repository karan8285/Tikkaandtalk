/**
 * Currency utilities — powered by config for white-label rebranding.
 * Change currency in /src/app/lib/config.ts to switch to USD, EUR, INR, etc.
 */
import { APP_CONFIG } from "./config";

const { symbol, locale, decimals, pointsPerUnit } = APP_CONFIG.currency;

/**
 * Format a number in the configured currency.
 * Examples:
 *   IDR: formatCurrency(15000) -> "Rp 15.000"
 *   USD: formatCurrency(15.99) -> "$15.99"
 */
export function formatCurrency(amount: number): string {
  const rounded = decimals === 0 ? Math.round(amount) : amount;
  const formatted = rounded.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol} ${formatted}`;
}

/**
 * @deprecated Use formatCurrency() instead. Kept for backward compatibility.
 */
export const formatIDR = formatCurrency;

/**
 * Calculate loyalty points from an order total.
 * Rule is configured in APP_CONFIG.currency.pointsPerUnit.
 * Default: 1 point per Rp 1.000
 */
export function calculatePoints(orderTotal: number): number {
  return Math.floor(orderTotal / pointsPerUnit);
}
