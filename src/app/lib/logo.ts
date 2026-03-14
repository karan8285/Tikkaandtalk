// Default fallback logo as an inline SVG data URI.
// The actual logo is admin-configurable via Restaurant Settings > Restaurant Logo.
// This fallback is used when no custom logo URL has been set.
// Text is pulled from config so rebranding updates the fallback automatically.
import { APP_CONFIG } from "./config";

const fallbackLogo = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${APP_CONFIG.brand.primaryColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${APP_CONFIG.brand.gradientEnd};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="320" height="120" rx="16" fill="url(#bg)"/>
  <text x="160" y="55" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="bold" fill="white">${APP_CONFIG.restaurant.name}</text>
  <text x="160" y="82" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" letter-spacing="3" fill="rgba(255,255,255,0.85)">${APP_CONFIG.restaurant.tagline}</text>
</svg>`)}`;

export default fallbackLogo;