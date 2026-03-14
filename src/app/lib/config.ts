// ================================================================
//  MASTER CONFIGURATION FILE  —  EDIT THIS ONE FILE TO REBRAND
// ================================================================
//
//  This is THE ONLY file you edit to deploy for a different
//  restaurant. Change the values below, then:
//
//    1. Copy server-relevant values to /supabase/functions/server/config.ts
//    2. Set env vars in Supabase Dashboard → Edge Functions → Secrets:
//         ADMIN_PHONE   — admin's phone number (e.g. +629999999999)
//         ADMIN_PIN     — admin's 6-digit PIN (e.g. 999999)
//         JWT_SECRET    — any long random string for token signing
//         MIDTRANS_SERVER_KEY — from Midtrans dashboard (if using payments)
//         MIDTRANS_CLIENT_KEY — from Midtrans dashboard (if using payments)
//    3. Redeploy
//
//  Everything else (menu, logo, WhatsApp number, tax, delivery zones)
//  is configurable from the Admin Panel after go-live.
// ================================================================

export const APP_CONFIG = {

  // ─── Restaurant Identity ───────────────────────────────────────
  restaurant: {
    /** Restaurant name shown across the app */
    name: "Tikka N Talk",
    /** Tagline / subtitle shown under the name */
    tagline: "AN INDIAN KITCHEN",
    /** Default address (admin can override in Restaurant Settings) */
    defaultAddress:
      "Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940",
    /** User-Agent string for outgoing API requests (e.g. geocoding) */
    userAgent: "TikkaNTalk-App/1.0",
    /** Default restaurant coordinates for delivery distance calc */
    defaultCoordinates: { lat: -6.2088, lng: 106.8456 },
  },

  // ─── Brand Colors ──────────────────────────────────────────────
  brand: {
    /** Main brand color (buttons, icons, accents, CSS --primary) */
    primaryColor: "#D91A60",
    /** Soft shadow tint for logo drop-shadows */
    primaryShadow: "rgba(217, 26, 96, 0.15)",
    /** Footer / hero gradient start */
    gradientStart: "#E91E63",
    /** Footer / hero gradient end */
    gradientEnd: "#C2185B",
    /** Light background tint for the Home page */
    backgroundTint: "#FFF5F7",
    /** Status badge background (active order bar, etc.) */
    badgeBg: "#FFF0F5",
    /** Desktop phone-frame background gradient */
    desktopBg:
      "linear-gradient(135deg, #FFF5F7 0%, #FCE4EC 30%, #F8BBD0 60%, #F48FB1 100%)",
  },

  // ─── Currency ──────────────────────────────────────────────────
  currency: {
    /** ISO 4217 currency code */
    code: "IDR",
    /** Symbol shown before amounts */
    symbol: "Rp",
    /** BCP 47 locale for number formatting */
    locale: "id-ID",
    /** Decimal places (0 for IDR, 2 for USD/EUR) */
    decimals: 0,
    /** Loyalty points: 1 point per this many currency units */
    pointsPerUnit: 1000,
    /** Human-readable label for points rule (shown in UI) */
    pointsLabel: "Rp 1.000",
  },

  // ─── Default Country / Phone ───────────────────────────────────
  phone: {
    /** Default country calling code (shown pre-selected in login) */
    defaultCountryCode: "+62",
    /** Digits-only version of the calling code */
    defaultCountryDial: "62",
    /** ISO 3166-1 alpha-2 country code */
    defaultCountryFlag: "ID",
    /** Country name for display */
    defaultCountryName: "Indonesia",
  },

  // ─── WhatsApp Defaults ─────────────────────────────────────────
  // Overridden at runtime when admin sets them in Restaurant Settings
  whatsapp: {
    /** Default WhatsApp number (digits only, with country code) */
    defaultNumber: "628192515550",
    /** Display-friendly format */
    defaultDisplay: "+62 819-2515-550",
  },

  // ─── Order System ──────────────────────────────────────────────
  orders: {
    /** Prefix for order numbers: e.g. "TNT" -> TNT00000001 */
    prefix: "TNT",
    /** Prefix for auto-generated promo codes: e.g. "TNT-A3X9ZP" */
    promoPrefix: "TNT",
    /** Default tax rate % (overridden by admin in Restaurant Settings) */
    defaultTaxRate: 11,
  },

  // ─── Seed / Sample Data ────────────────────────────────────────
  // These appear as defaults before admin configures the menu.
  // Change them to match your restaurant's cuisine.
  samples: {
    /** Default "Today's Special" item */
    specialOffer: {
      title: "Chicken Tikka Masala",
      description: "Tender chicken in creamy tomato-based sauce with aromatic spices",
    },
    /** Placeholder text in menu item name fields */
    menuPlaceholder: "e.g., Paneer Tikka",
    /** Placeholder text in kids menu item name fields */
    kidsMenuPlaceholder: "e.g., Mini Chicken Tikka",
    /** Default seed items for "Load Defaults" button */
    defaultItems: "Chicken Tikka Masala, Butter Chicken, Samosa",
  },

  // ─── Mascot ────────────────────────────────────────────────────
  mascot: {
    /** Show the chef mascot across all pages (user can also toggle in Profile) */
    enabled: true,
    /** Custom mascot image URL — leave empty to use the built-in chef image */
    customImageUrl: "",
    /** Fallback greeting when no context applies */
    defaultMessage: "What would you like to eat today?",
    /** Guest visitor greeting (not logged in) */
    guestMessage: "Welcome! Login to start earning loyalty points with every order.",
  },

  // ─── Internal Keys / Identifiers ───────────────────────────────
  // Prevent collisions when multiple apps share the same browser.
  // Change these per restaurant to avoid localStorage conflicts.
  keys: {
    /** React context key for AuthProvider (survives HMR) */
    authContextKey: "__TIKKA_AUTH_CTX__",
    /** React context key for CartProvider (survives HMR) */
    cartContextKey: "__TIKKA_CART_CTX__",
    /** localStorage key for cached restaurant logo URL */
    logoCacheKey: "tikka_restaurant_logo_url",
    /** Email domain used by the server for phone-to-email mapping */
    emailDomain: "tikka.app",
    /** Fallback JWT secret (MUST set JWT_SECRET env var in production) */
    defaultJwtSecret: "tikka-n-talk-default-dev-key-CHANGE-ME",
  },
} as const;

// ─── Derived helpers (do not edit) ────────────────────────────────

/** Full alt-text for logo images */
export const LOGO_ALT = `${APP_CONFIG.restaurant.name} - ${APP_CONFIG.restaurant.tagline}`;

/** Shorthand for brand color — import this in any component file */
export const BRAND_COLOR = APP_CONFIG.brand.primaryColor;

/** Build a WhatsApp message mentioning the restaurant name */
export function whatsAppOrderMessage(): string {
  return `Hello ${APP_CONFIG.restaurant.name}, I want to place an order.`;
}

/** Build a WhatsApp PIN-reset message */
export function whatsAppPinResetMessage(): string {
  return `Hi, I need help to reset my PIN for ${APP_CONFIG.restaurant.name} app. Please help me reset my account PIN.`;
}