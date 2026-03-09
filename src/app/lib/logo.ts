// Restaurant logo - used across the app
// In Figma Make, this was imported via figma:asset virtual module.
// For production builds, we use an SVG data URI of the restaurant branding.

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="24" fill="%23D91A60"/>
  <text x="100" y="85" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="28" fill="white">TIKKA</text>
  <text x="100" y="115" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="white">N TALK</text>
  <text x="100" y="145" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="%23FFD700" letter-spacing="2">AN INDIAN KITCHEN</text>
</svg>`;

const logoImage = `data:image/svg+xml,${LOGO_SVG}`;

export default logoImage;
