/**
 * Currency utilities for Indonesian Rupiah (IDR)
 */

/**
 * Format number as Indonesian Rupiah
 * @param amount - The amount to format
 * @returns Formatted string like "Rp 15.000"
 */
export function formatIDR(amount: number): string {
  // Round to nearest integer (no decimals for IDR)
  const rounded = Math.round(amount);
  
  // Format with Indonesian locale (periods as thousands separator)
  return `Rp ${rounded.toLocaleString('id-ID')}`;
}

/**
 * Convert USD price to IDR (approximate conversion rate: 1 USD = 15,000 IDR)
 * This is for migrating existing USD prices to IDR
 * @param usdAmount - Amount in USD
 * @returns Amount in IDR
 */
export function usdToIDR(usdAmount: number): number {
  const conversionRate = 15000; // 1 USD = 15,000 IDR
  return Math.round(usdAmount * conversionRate);
}

/**
 * Calculate reward points from order total
 * Rule: 1 point per Rp 1.000
 * @param orderTotal - Total order amount in IDR
 * @returns Points earned
 */
export function calculatePoints(orderTotal: number): number {
  return Math.floor(orderTotal / 1000);
}
