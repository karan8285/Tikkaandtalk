// ================================================================
//  SERVER CONFIGURATION  —  KEEP IN SYNC WITH FRONTEND CONFIG
// ================================================================
//  This mirrors the server-relevant values from:
//    /src/app/lib/config.ts
//
//  When rebranding, update BOTH files with the same values.
// ================================================================

export const SERVER_CONFIG = {
  /** Restaurant name (used in log messages, seed data, User-Agent) */
  restaurantName: "Tikka N Talk",

  /** Email domain for phone-to-email mapping (e.g. 628xxx@tikka.app) */
  emailDomain: "tikka.app",

  /** Prefix for sequential order numbers (e.g. TNT00000001) */
  orderPrefix: "TNT",

  /** Prefix for auto-generated promo codes (e.g. TNT-A3X9ZP) */
  promoPrefix: "TNT",

  /** Default country code for phone normalization */
  defaultCountryCode: "+62",
  defaultCountryDial: "62",

  /** User-Agent for outgoing API requests (geocoding etc.) */
  userAgent: "TikkaNTalk-App/1.0",

  /** Fallback JWT secret (overridden by JWT_SECRET env var) */
  defaultJwtSecret: "tikka-n-talk-default-dev-key-CHANGE-ME",
} as const;
