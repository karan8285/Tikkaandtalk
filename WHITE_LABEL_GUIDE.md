# White-Label Deployment Guide

## How to Rebrand This App for a Different Restaurant

This app is built as a **white-label mobile loyalty and ordering platform**. It can be redeployed for any restaurant by changing configuration values in a small number of files. No feature code needs to change.

This guide uses **Tikka N Talk - AN INDIAN KITCHEN** as the current example values and explains exactly what to change and why.

---

## Table of Contents

1. [Quick Overview: What Files to Edit](#1-quick-overview-what-files-to-edit)
2. [File 1: Frontend Config (`/src/app/lib/config.ts`)](#2-file-1-frontend-config)
3. [File 2: Server Config (`/supabase/functions/server/config.ts`)](#3-file-2-server-config)
4. [File 3: CSS Theme (`/src/styles/theme.css`)](#4-file-3-css-theme)
5. [File 4: Carousel CSS (`/src/styles/carousel.css`)](#5-file-4-carousel-css)
6. [File 5: Font Import (`/src/styles/fonts.css`)](#6-file-5-font-import)
7. [File 6: Server Geocoding (`/supabase/functions/server/index.tsx`)](#7-file-6-server-geocoding)
8. [File 7: Delivery Areas (`/src/app/lib/delivery.ts`)](#8-file-7-delivery-areas)
9. [File 8: Menu Image Mapper (`/supabase/functions/server/menu_images.tsx`)](#9-file-8-menu-image-mapper)
10. [File 9: Seed Menu Data (server `index.tsx`)](#10-file-9-seed-menu-data)
11. [Environment Variables (Supabase Dashboard)](#11-environment-variables)
12. [Post-Deployment: Admin Panel Configuration](#12-post-deployment-admin-panel)
13. [Checklist: Complete White-Label Rebranding](#13-checklist)

---

## 1. Quick Overview: What Files to Edit

| # | File | What Changes | Difficulty |
|---|------|-------------|------------|
| 1 | `/src/app/lib/config.ts` | Restaurant name, colors, currency, phone, all branding | **Easy** (just values) |
| 2 | `/supabase/functions/server/config.ts` | Mirror of server-relevant values from #1 | **Easy** (copy from #1) |
| 3 | `/src/styles/theme.css` | CSS `--primary` color variable | **Easy** (1 line) |
| 4 | `/src/styles/carousel.css` | Carousel dot active color | **Easy** (1 line) |
| 5 | `/src/styles/fonts.css` | Logo/branding font import | **Easy** (1 line) |
| 6 | `/supabase/functions/server/index.tsx` | Geocoding city/country in 2-3 lines | **Easy** (find & replace) |
| 7 | `/src/app/lib/delivery.ts` | Delivery area list (Jakarta-specific) | **Medium** (data replacement) |
| 8 | `/supabase/functions/server/menu_images.tsx` | Dish-to-image mapping | **Medium** (cuisine-specific) |
| 9 | `/supabase/functions/server/index.tsx` (seed data) | Default menu items & sample data | **Medium** (cuisine-specific) |
| - | Supabase Dashboard | 5 environment variables | **Easy** (paste values) |

---

## 2. File 1: Frontend Config

**File:** `/src/app/lib/config.ts`
**Purpose:** THE master configuration file. Every UI element reads from here.
**Impact:** Changes here automatically propagate to 40+ components.

### Section-by-section breakdown:

### 2.1 Restaurant Identity

```ts
// CURRENT (Tikka N Talk):
restaurant: {
  name: "Tikka N Talk",
  tagline: "AN INDIAN KITCHEN",
  defaultAddress: "Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940",
  userAgent: "TikkaNTalk-App/1.0",
  defaultCoordinates: { lat: -6.2088, lng: 106.8456 },
},

// EXAMPLE REBRAND (for "Sakura Sushi" in Tokyo):
restaurant: {
  name: "Sakura Sushi",
  tagline: "AUTHENTIC JAPANESE CUISINE",
  defaultAddress: "1-2-3 Shibuya, Shibuya-ku, Tokyo 150-0002, Japan",
  userAgent: "SakuraSushi-App/1.0",
  defaultCoordinates: { lat: 35.6762, lng: 139.6503 },
},
```

**Where these values appear:**
- `name` -- Header, login page, WhatsApp messages, fallback logo SVG, desktop sidebar branding, push notifications
- `tagline` -- Below the logo on the home page, fallback logo SVG, desktop sidebar
- `defaultAddress` -- Home page, checkout delivery address, admin settings placeholder
- `userAgent` -- Outgoing geocoding API requests (OSM Nominatim requires a descriptive User-Agent)
- `defaultCoordinates` -- Delivery distance calculation before admin configures GPS location

### 2.2 Brand Colors

```ts
// CURRENT (Tikka N Talk - pink/magenta theme):
brand: {
  primaryColor: "#D91A60",      // Buttons, icons, accents, active states
  primaryShadow: "rgba(217, 26, 96, 0.15)",  // Logo drop-shadow tint
  gradientStart: "#E91E63",     // Footer/hero gradient start
  gradientEnd: "#C2185B",       // Footer/hero gradient end
  backgroundTint: "#FFF5F7",    // Light pink home page background
  badgeBg: "#FFF0F5",           // Active order notification bar background
  desktopBg: "linear-gradient(135deg, #FFF5F7 0%, #FCE4EC 30%, #F8BBD0 60%, #F48FB1 100%)",
},

// EXAMPLE REBRAND (for a blue/teal theme):
brand: {
  primaryColor: "#0D9488",
  primaryShadow: "rgba(13, 148, 136, 0.15)",
  gradientStart: "#14B8A6",
  gradientEnd: "#0F766E",
  backgroundTint: "#F0FDFA",
  badgeBg: "#CCFBF1",
  desktopBg: "linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 30%, #99F6E4 60%, #5EEAD4 100%)",
},
```

**Where these values appear:**
- `primaryColor` -- Used via `APP_CONFIG.brand.primaryColor` in 40+ component files for buttons, active tab underlines, icon colors, spinner borders, progress bars, toggle backgrounds, etc.
- `primaryShadow` -- Logo container shadow on the Home page
- `gradientStart/gradientEnd` -- Footer gradient, hero sections, fallback logo SVG gradient
- `backgroundTint` -- Home page body background
- `badgeBg` -- Active order notification bar
- `desktopBg` -- Background gradient when viewing on desktop (phone frame preview)

**IMPORTANT:** You must ALSO update the CSS file (see Section 4) because CSS custom properties don't auto-read from this TypeScript config.

### 2.3 Currency

```ts
// CURRENT (Indonesian Rupiah):
currency: {
  code: "IDR",
  symbol: "Rp",
  locale: "id-ID",
  decimals: 0,           // IDR has no decimal places
  pointsPerUnit: 1000,   // 1 loyalty point per Rp 1.000 spent
  pointsLabel: "Rp 1.000",
},

// EXAMPLE REBRAND (US Dollar):
currency: {
  code: "USD",
  symbol: "$",
  locale: "en-US",
  decimals: 2,
  pointsPerUnit: 1,      // 1 loyalty point per $1 spent
  pointsLabel: "$1",
},

// EXAMPLE REBRAND (Indian Rupee):
currency: {
  code: "INR",
  symbol: "\u20B9",
  locale: "en-IN",
  decimals: 0,
  pointsPerUnit: 100,
  pointsLabel: "\u20B9100",
},
```

**Where these values appear:**
- The `formatCurrency()` function in `/src/app/lib/currency.ts` reads all of these
- Every price display across menu, cart, checkout, order history, rewards
- The `calculatePoints()` function uses `pointsPerUnit`
- `pointsLabel` is shown in the loyalty tier explanation text

### 2.4 Phone / Country Defaults

```ts
// CURRENT (Indonesia):
phone: {
  defaultCountryCode: "+62",
  defaultCountryDial: "62",
  defaultCountryFlag: "ID",
  defaultCountryName: "Indonesia",
},

// EXAMPLE REBRAND (India):
phone: {
  defaultCountryCode: "+91",
  defaultCountryDial: "91",
  defaultCountryFlag: "IN",
  defaultCountryName: "India",
},
```

**Where these values appear:**
- Login/signup pages: pre-selected country code in the phone input
- WhatsApp link builder: normalizes local phone numbers to international format
- Server-side phone normalization when creating user accounts

### 2.5 WhatsApp Defaults

```ts
// CURRENT:
whatsapp: {
  defaultNumber: "628192515550",
  defaultDisplay: "+62 819-2515-550",
},

// EXAMPLE REBRAND:
whatsapp: {
  defaultNumber: "919876543210",
  defaultDisplay: "+91 98765-43210",
},
```

**Where these values appear:**
- Home page "Contact on WhatsApp" button (before admin configures a number)
- Order confirmation "Contact restaurant" link
- `getWhatsAppLink()` function in `/src/app/lib/whatsapp.ts`
- NOTE: Admin can override this at runtime via Restaurant Settings, but these are the fallbacks

### 2.6 Order System Prefixes

```ts
// CURRENT:
orders: {
  prefix: "TNT",          // Order IDs: TNT00000001, TNT00000002, ...
  promoPrefix: "TNT",     // Promo codes: TNT-A3X9ZP
  defaultTaxRate: 11,     // 11% PPN (Indonesian VAT)
},

// EXAMPLE REBRAND:
orders: {
  prefix: "SSU",          // Order IDs: SSU00000001
  promoPrefix: "SSU",     // Promo codes: SSU-K7M2QW
  defaultTaxRate: 10,     // 10% GST
},
```

**Where these values appear:**
- Order creation on the server: generates sequential order numbers
- `getShortOrderId()` in `/src/app/lib/orderUtils.ts`: formats display IDs (TNT-102)
- Promo code auto-generation in admin panel
- Tax calculation at checkout

### 2.7 Sample / Seed Data

```ts
// CURRENT (Indian cuisine examples):
samples: {
  specialOffer: {
    title: "Chicken Tikka Masala",
    description: "Tender chicken in creamy tomato-based sauce with aromatic spices",
  },
  menuPlaceholder: "e.g., Paneer Tikka",
  kidsMenuPlaceholder: "e.g., Mini Chicken Tikka",
  defaultItems: "Chicken Tikka Masala, Butter Chicken, Samosa",
},

// EXAMPLE REBRAND (Japanese):
samples: {
  specialOffer: {
    title: "Dragon Roll",
    description: "Shrimp tempura roll topped with sliced avocado and eel sauce",
  },
  menuPlaceholder: "e.g., California Roll",
  kidsMenuPlaceholder: "e.g., Mini Teriyaki Bowl",
  defaultItems: "Dragon Roll, Salmon Sashimi, Miso Soup",
},
```

**Where these values appear:**
- `specialOffer` -- Default "Today's Special" before admin sets one
- `menuPlaceholder` -- Placeholder text in the admin "Add Menu Item" form (RegularMenuAdmin.tsx)
- `kidsMenuPlaceholder` -- Placeholder text in admin "Add Kids Menu Item" form (KidsMenuAdmin.tsx)
- `defaultItems` -- Used by the "Seed Default Items" button in TodaysSpecialAdmin.tsx

### 2.8 Internal Keys / Identifiers

```ts
// CURRENT:
keys: {
  authContextKey: "__TIKKA_AUTH_CTX__",
  cartContextKey: "__TIKKA_CART_CTX__",
  logoCacheKey: "tikka_restaurant_logo_url",
  emailDomain: "tikka.app",
  defaultJwtSecret: "tikka-n-talk-default-dev-key-CHANGE-ME",
},

// EXAMPLE REBRAND:
keys: {
  authContextKey: "__SAKURA_AUTH_CTX__",
  cartContextKey: "__SAKURA_CART_CTX__",
  logoCacheKey: "sakura_restaurant_logo_url",
  emailDomain: "sakurasushi.app",
  defaultJwtSecret: "sakura-sushi-default-dev-key-CHANGE-ME",
},
```

**Where these values appear:**
- `authContextKey` / `cartContextKey` -- Stored on `globalThis` to survive Vite HMR reloads. Change these to avoid collisions if running multiple restaurant apps in the same browser during development.
- `logoCacheKey` -- localStorage key for caching the restaurant logo URL. Must be unique per restaurant.
- `emailDomain` -- Server creates Supabase Auth users with `{phone}@{emailDomain}` format (e.g., `628xxx@tikka.app`). This is an internal mapping; users never see it.
- `defaultJwtSecret` -- Fallback JWT secret for development. In production, always set the `JWT_SECRET` environment variable instead.

---

## 3. File 2: Server Config

**File:** `/supabase/functions/server/config.ts`
**Purpose:** Mirror of server-relevant values from the frontend config. The Deno edge function cannot import frontend files, so these must be duplicated.

```ts
// CURRENT:
export const SERVER_CONFIG = {
  restaurantName: "Tikka N Talk",
  emailDomain: "tikka.app",
  orderPrefix: "TNT",
  promoPrefix: "TNT",
  defaultCountryCode: "+62",
  defaultCountryDial: "62",
  userAgent: "TikkaNTalk-App/1.0",
  defaultJwtSecret: "tikka-n-talk-default-dev-key-CHANGE-ME",
} as const;

// EXAMPLE REBRAND:
export const SERVER_CONFIG = {
  restaurantName: "Sakura Sushi",
  emailDomain: "sakurasushi.app",
  orderPrefix: "SSU",
  promoPrefix: "SSU",
  defaultCountryCode: "+91",
  defaultCountryDial: "91",
  userAgent: "SakuraSushi-App/1.0",
  defaultJwtSecret: "sakura-sushi-default-dev-key-CHANGE-ME",
} as const;
```

**CRITICAL:** Every value here MUST match the corresponding value in `/src/app/lib/config.ts`. If `emailDomain` differs between frontend and server, users will fail to authenticate.

---

## 4. File 3: CSS Theme

**File:** `/src/styles/theme.css`
**What to change:** Line 11 -- the `--primary` CSS custom property.

```css
/* CURRENT: */
--primary: #D91A60;

/* REBRAND: Change to match APP_CONFIG.brand.primaryColor */
--primary: #0D9488;
```

**Why this matters:** Tailwind's `bg-primary`, `text-primary`, `border-primary` classes all resolve through this CSS variable. If you only change `config.ts` but not this file, Tailwind utility classes will still use the old color.

**What NOT to change:** The rest of `theme.css` (secondary, accent, muted, destructive, etc.) works generically and does not need rebranding.

---

## 5. File 4: Carousel CSS

**File:** `/src/styles/carousel.css`
**What to change:** Line 14 -- the active dot color for the react-slick carousel.

```css
/* CURRENT: */
.slick-dots li.slick-active button:before {
  opacity: 1;
  color: #D91A60;
}

/* REBRAND: */
.slick-dots li.slick-active button:before {
  opacity: 1;
  color: #0D9488;  /* Match APP_CONFIG.brand.primaryColor */
}
```

**Why this is separate:** The carousel dots are styled via a global CSS override because react-slick uses pseudo-elements (`:before`) that can't be styled with inline React styles or Tailwind classes.

---

## 6. File 5: Font Import

**File:** `/src/styles/fonts.css`
**Purpose:** Imports the Google Font used for the logo / branding text.

```css
/* CURRENT: */
/* Pacifico font for logo */
@import url('https://fonts.googleapis.com/css2?family=Pacifico&display=swap');

/* REBRAND - replace with your brand font, or remove if not needed: */
/* Playfair Display for elegant Japanese restaurant branding */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
```

**Note:** If your restaurant doesn't use a custom Google Font, you can empty this file (keep it, just remove the `@import`). The app will fall back to the system font stack.

---

## 7. File 6: Server Geocoding

**File:** `/supabase/functions/server/index.tsx`
**What to change:** 3 specific lines related to geocoding (address search for delivery).

### Line ~7785: City/country appended to search queries

```ts
// CURRENT:
const query = encodeURIComponent(`${q.trim()}, Jakarta, Indonesia`);

// REBRAND:
const query = encodeURIComponent(`${q.trim()}, Tokyo, Japan`);
```

### Line ~7787: Country code filter for Nominatim

```ts
// CURRENT:
`...&countrycodes=id&addressdetails=1`

// REBRAND (Japan = "jp"):
`...&countrycodes=jp&addressdetails=1`
```

### Line ~7790: User-Agent header

```ts
// CURRENT:
'User-Agent': 'TikkaNTalk-Restaurant-App/1.0',

// REBRAND:
'User-Agent': 'SakuraSushi-Restaurant-App/1.0',
```

### Line ~7865: Second geocoding endpoint

```ts
// CURRENT:
`...&countrycodes=id`

// REBRAND:
`...&countrycodes=jp`
```

### Line ~7868: Second User-Agent

```ts
// CURRENT:
'User-Agent': 'TikkaNTalk-Restaurant-App/1.0',

// REBRAND:
'User-Agent': 'SakuraSushi-Restaurant-App/1.0',
```

**Why this matters:** Without changing these, the delivery address search will only return results in Jakarta, Indonesia, regardless of where the new restaurant is located.

**Future improvement:** These should ideally be moved to `SERVER_CONFIG` for easier rebranding (add `city`, `country`, and `countryCode` fields).

---

## 8. File 7: Delivery Areas

**File:** `/src/app/lib/delivery.ts`
**What to change:** The entire `JAKARTA_AREAS` array (~400 entries).

This file contains a comprehensive list of neighborhoods, apartments, malls, hotels, hospitals, universities, and transit stations in Jakarta, organized by zone (distance from restaurant). It powers the "Select Area" dropdown during checkout.

### For rebranding:

1. **Rename the export** from `JAKARTA_AREAS` to something generic or city-specific (e.g., `DELIVERY_AREAS` or `TOKYO_AREAS`)
2. **Replace all entries** with areas relevant to the new city
3. **Update the import** in `/src/app/pages/Order.tsx` (3 references to `JAKARTA_AREAS`)
4. **Update `DEFAULT_DELIVERY_CONFIG`** with the new restaurant's coordinates and delivery zone distances/fees

```ts
// CURRENT:
export const DEFAULT_DELIVERY_CONFIG: DeliveryZonesConfig = {
  restaurantLocation: { lat: -6.2088, lng: 106.8456 },
  maxDistance: 15,
  zones: [
    { id: "1", name: "Nearby", minKm: 0, maxKm: 3, fee: 8000 },
    { id: "2", name: "Medium", minKm: 3, maxKm: 7, fee: 15000 },
    { id: "3", name: "Far",    minKm: 7, maxKm: 12, fee: 25000 },
    { id: "4", name: "Very Far", minKm: 12, maxKm: 15, fee: 40000 },
  ],
};

// REBRAND (USD example):
export const DEFAULT_DELIVERY_CONFIG: DeliveryZonesConfig = {
  restaurantLocation: { lat: 35.6762, lng: 139.6503 },
  maxDistance: 10,
  zones: [
    { id: "1", name: "Nearby", minKm: 0, maxKm: 2, fee: 300 },
    { id: "2", name: "Medium", minKm: 2, maxKm: 5, fee: 500 },
    { id: "3", name: "Far",    minKm: 5, maxKm: 10, fee: 800 },
  ],
};
```

**Note:** The zone names ("Nearby", "Medium", "Far") are generic and can stay. The admin can override zones from the Admin Panel after go-live.

---

## 9. File 8: Menu Image Mapper

**File:** `/supabase/functions/server/menu_images.tsx`
**Purpose:** Maps dish names to Unsplash stock photos based on cuisine keywords.

The current file contains mappings for Indian food categories:
- Soup, Appetizer Veg, Appetizer Non-Veg, Main Course Veg, Main Course Non-Veg, Biryani/Rice, Breads, Dessert, Beverages, Combos, Kids Menu

### For rebranding:

Replace the keyword-to-image mappings with ones relevant to the new cuisine. For example, if rebranding for a sushi restaurant:

```ts
// Instead of:
if (dishName.includes("tikka")) return "https://images.unsplash.com/...";
if (dishName.includes("paneer")) return "https://images.unsplash.com/...";

// Use:
if (dishName.includes("sashimi")) return "https://images.unsplash.com/...";
if (dishName.includes("tempura")) return "https://images.unsplash.com/...";
```

**Tip:** Use the Unsplash API or website to find good food photos. URL format: `https://images.unsplash.com/photo-{ID}?w=400&h=300&fit=crop&q=80`

---

## 10. File 9: Seed Menu Data

**File:** `/supabase/functions/server/index.tsx`
**What to change:** Multiple sections with hardcoded Indian menu items.

### 10.1 Default Today's Special (around line 210)

```ts
// CURRENT:
{ id: 1, title: "Chicken Tikka Masala", description: "Tender chicken in creamy tomato-based sauce...", originalPrice: 285000 }

// REBRAND:
{ id: 1, title: "Dragon Roll", description: "Shrimp tempura roll topped with avocado...", originalPrice: 1800 }
```

### 10.2 Default Kids Menu Seed (around line 2339)

```ts
// CURRENT:
{ id: 1, name: "Chicken Tikka Masala", subtitle: "Tender chicken in creamy tomato sauce", ... }

// REBRAND with your cuisine's kid-friendly items
```

### 10.3 Full Menu Seed Data (around line 3020-3100+)

This is the complete "Tikka N Talk" menu used by the "Load Full Menu" admin button. It contains ~100 Indian dishes with categories and IDR prices. Replace entirely with your restaurant's menu.

### 10.4 Admin placeholder text (RestaurantSettingsAdmin.tsx, line 440)

```tsx
// CURRENT:
placeholder="e.g., Jl. Epicentrum Tengah No.3, Rasuna Garden Food Street, Karet Kuningan, Setiabudi, South Jakarta 12940"

// REBRAND:
placeholder="e.g., 1-2-3 Shibuya, Shibuya-ku, Tokyo 150-0002"
```

**Note:** This placeholder in RestaurantSettingsAdmin.tsx is currently hardcoded and should ideally read from `APP_CONFIG.restaurant.defaultAddress`. This is a minor cleanup item.

---

## 11. Environment Variables

Set these 5 variables in **Supabase Dashboard > Edge Functions > Secrets**:

| Variable | Description | Example (Tikka N Talk) |
|----------|-------------|----------------------|
| `ADMIN_PHONE` | Admin's full phone number (with country code) | `+629999999999` |
| `ADMIN_PIN` | Admin's 6-digit login PIN | `999999` |
| `JWT_SECRET` | Random string for signing auth tokens (32+ chars recommended) | `my-super-secret-jwt-key-2024-xyz` |
| `MIDTRANS_SERVER_KEY` | From Midtrans dashboard (payment gateway) | `SB-Mid-server-xxx` |
| `MIDTRANS_CLIENT_KEY` | From Midtrans dashboard (payment gateway) | `SB-Mid-client-xxx` |

**Note on payment gateway:** Midtrans is Indonesia's dominant payment gateway. If deploying outside Indonesia, you'll need to:
1. Replace Midtrans integration with a local payment gateway (Stripe, Razorpay, etc.)
2. Or disable online payments (set enabled=false in admin Payment Gateway settings) and use cash/transfer only

---

## 12. Post-Deployment: Admin Panel Configuration

After deploying, the restaurant admin can configure these from the Admin Panel (`/admin`) WITHOUT any code changes:

| Setting | Admin Panel Location | What It Controls |
|---------|---------------------|------------------|
| Restaurant Logo | Restaurant Settings | Logo image across the app |
| WhatsApp Number | Restaurant Settings | "Contact us" links |
| Restaurant Address | Restaurant Settings | Shown in footer/checkout |
| GPS Coordinates | Restaurant Settings | Delivery distance calculation |
| Tax Rate | Restaurant Settings | Tax % applied at checkout |
| Opening Hours | Restaurant Settings | Open/closed status |
| Full Menu | Regular Menu tab | All menu items, prices, images |
| Today's Special | Today's Special tab | Featured item on home page |
| Kids Menu | Kids Menu tab | Kids menu section |
| Flash Sales | Flash Sale tab | Time-limited discounts |
| Delivery Zones | Delivery Zones tab | Zone distances and fees |
| Vouchers | Vouchers tab | Loyalty reward vouchers |
| Tier Benefits | Tier Benefits tab | Loyalty tier thresholds |
| Payment Gateway | Payment Gateway tab | Midtrans sandbox/production mode |

---

## 13. Checklist: Complete White-Label Rebranding

Use this checklist when rebranding for a new restaurant:

### Code Changes (one-time)

- [ ] **`/src/app/lib/config.ts`** -- Update ALL sections (restaurant, brand, currency, phone, whatsapp, orders, samples, keys)
- [ ] **`/supabase/functions/server/config.ts`** -- Mirror server-relevant values from above
- [ ] **`/src/styles/theme.css`** -- Change `--primary: #D91A60` to new brand color
- [ ] **`/src/styles/carousel.css`** -- Change `color: #D91A60` to new brand color
- [ ] **`/src/styles/fonts.css`** -- Replace Pacifico font import (or remove)
- [ ] **`/supabase/functions/server/index.tsx`** -- Update geocoding city/country/countrycode (3 places)
- [ ] **`/supabase/functions/server/index.tsx`** -- Update User-Agent strings (2 places)
- [ ] **`/src/app/lib/delivery.ts`** -- Replace JAKARTA_AREAS with local areas
- [ ] **`/src/app/lib/delivery.ts`** -- Update DEFAULT_DELIVERY_CONFIG coordinates and fees
- [ ] **`/src/app/pages/Order.tsx`** -- Update JAKARTA_AREAS import name if renamed (3 references)
- [ ] **`/supabase/functions/server/menu_images.tsx`** -- Replace dish-to-image mappings for new cuisine
- [ ] **`/supabase/functions/server/index.tsx`** -- Replace seed menu data (Today's Special, Kids Menu, Full Menu)
- [ ] **`/src/app/components/RestaurantSettingsAdmin.tsx`** -- Update address placeholder text

### Infrastructure

- [ ] Create new Supabase project (or reuse existing)
- [ ] Set 5 environment variables in Supabase Dashboard
- [ ] Deploy frontend to Vercel (or similar)
- [ ] Deploy edge functions to Supabase
- [ ] Verify CORS settings work with new domain

### Post-Deployment Admin Setup

- [ ] Login to Admin Panel (`/admin`)
- [ ] Upload restaurant logo
- [ ] Set WhatsApp contact number
- [ ] Confirm restaurant address and GPS coordinates
- [ ] Configure delivery zones
- [ ] Add full menu with prices and images
- [ ] Set up Today's Special
- [ ] Configure loyalty tiers and vouchers
- [ ] Test complete order flow (browse > cart > checkout > payment > tracking)
- [ ] Test WhatsApp contact links

---

## Summary of Files NOT Needing Changes

These files are already fully white-labeled through config imports:

| File | Reads From |
|------|-----------|
| `/src/app/lib/currency.ts` | `APP_CONFIG.currency.*` |
| `/src/app/lib/whatsapp.ts` | `APP_CONFIG.whatsapp.*`, `APP_CONFIG.phone.*` |
| `/src/app/lib/logo.ts` | `APP_CONFIG.restaurant.*`, `APP_CONFIG.brand.*` |
| `/src/app/lib/orderUtils.ts` | `APP_CONFIG.orders.prefix` |
| `/src/app/lib/auth.tsx` | `APP_CONFIG.keys.authContextKey` |
| `/src/app/lib/cart.tsx` | `APP_CONFIG.keys.cartContextKey` |
| `/src/app/lib/useRestaurantLogo.ts` | `APP_CONFIG.keys.logoCacheKey` |
| `/src/app/lib/midtrans.ts` | Runtime config from server |
| `/src/app/layouts/RootLayout.tsx` | `APP_CONFIG.brand.*`, `APP_CONFIG.restaurant.*` |
| `/src/app/routes.tsx` | `APP_CONFIG.brand.primaryColor` |
| `/src/app/pages/Home.tsx` | `APP_CONFIG.*` (multiple) |
| `/src/app/pages/Login.tsx` | `APP_CONFIG.phone.*` |
| `/src/app/pages/Signup.tsx` | `APP_CONFIG.phone.*` |
| `/src/app/pages/Profile.tsx` | `APP_CONFIG.restaurant.name` |
| `/src/app/pages/Rewards.tsx` | `APP_CONFIG.currency.*` |
| `/src/app/pages/Cart.tsx` | `APP_CONFIG.brand.*` |
| `/src/app/pages/Checkout.tsx` | `APP_CONFIG.*` |
| All Admin components | `APP_CONFIG.samples.*`, `APP_CONFIG.brand.*` |

**Total effort estimate:** ~2-4 hours for a developer familiar with the codebase, depending on how much delivery area and menu seed data needs to be prepared for the new restaurant.
