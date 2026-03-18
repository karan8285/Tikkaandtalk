import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Plugin to handle Figma Make's virtual `figma:asset/...` imports during production builds.
// In the Figma Make dev server these resolve automatically; on Vercel they would fail.
// We resolve them to a tiny transparent 1×1 PNG data-URL so the build succeeds and the
// app can fall back to its configured mascot image or emoji.
function figmaAssetPlugin() {
  const SCHEME = 'figma:asset/'
  const TRANSPARENT_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  return {
    name: 'figma-asset-resolver',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (source.startsWith(SCHEME)) {
        return `\0figma-asset:${source.slice(SCHEME.length)}`
      }
    },
    load(id: string) {
      if (id.startsWith('\0figma-asset:')) {
        return `export default "${TRANSPARENT_PNG}"`
      }
    },
  }
}

// Plugin to serve /sw.js and /manifest.json with correct MIME types.
// SPA hosts (Figma.site, Vercel) may rewrite all requests to index.html,
// causing these files to be served as text/html instead of their correct type.
function publicFileServePlugin() {
  const serveFiles: Record<string, string> = {
    '/sw.js': 'application/javascript',
    '/manifest.json': 'application/json',
    '/icon-192.svg': 'image/svg+xml',
    '/favicon.svg': 'image/svg+xml',
    '/apple-touch-icon.svg': 'image/svg+xml',
  }

  return {
    name: 'public-file-serve',
    enforce: 'pre' as const,
    configureServer(server: any) {
      // In dev mode, serve these files directly before SPA fallback kicks in
      server.middlewares.use((req: any, res: any, next: any) => {
        const mimeType = serveFiles[req.url]
        if (mimeType) {
          const filePath = path.resolve(__dirname, 'public', req.url.slice(1))
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            res.setHeader('Content-Type', mimeType)
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Service-Worker-Allowed', '/')
            res.end(content)
            return
          } catch {
            // File not found, fall through
          }
        }
        next()
      })
    },
  }
}

// Plugin to inject OG meta tags, PWA manifest link, and apple-touch-icon into the built HTML.
// WhatsApp / social media crawlers don't execute JavaScript, so these tags must be in the
// static HTML returned by the server.  This plugin uses Vite's transformIndexHtml hook which
// runs during both dev-serve and production build.
function ogMetaPlugin() {
  const SITE_URL = 'https://www.tikka-n-talk.com'
  // Public logo proxy — serves the admin-uploaded logo from Supabase Storage
  const LOGO_URL = 'https://ajsgmltgsaogrwcivsst.supabase.co/functions/v1/make-server-e5e192fb/public/logo'

  return {
    name: 'og-meta-inject',
    transformIndexHtml(html: string) {
      // Inject right before </head>
      const tags = `
    <!-- PWA -->
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="192x192" href="${LOGO_URL}" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="${LOGO_URL}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Tikka N Talk" />
    <meta name="theme-color" content="#D91A60" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- iOS Splash Screens (apple-touch-startup-image) -->
    <!-- iPhone SE / 8 (750x1334) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;750&quot; height=&quot;1334&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;750&quot; height=&quot;1334&quot; fill=&quot;url(#g)&quot;/><text x=&quot;375&quot; y=&quot;620&quot; font-family=&quot;Arial&quot; font-size=&quot;72&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;375&quot; y=&quot;690&quot; font-family=&quot;Arial&quot; font-size=&quot;40&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;375&quot; y=&quot;760&quot; font-family=&quot;Arial&quot; font-size=&quot;20&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;4&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone X / XS / 11 Pro / 12 mini / 13 mini (1125x2436) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1125&quot; height=&quot;2436&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1125&quot; height=&quot;2436&quot; fill=&quot;url(#g)&quot;/><text x=&quot;562&quot; y=&quot;1150&quot; font-family=&quot;Arial&quot; font-size=&quot;96&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;562&quot; y=&quot;1250&quot; font-family=&quot;Arial&quot; font-size=&quot;52&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;562&quot; y=&quot;1340&quot; font-family=&quot;Arial&quot; font-size=&quot;26&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone XR / 11 (828x1792) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;828&quot; height=&quot;1792&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;828&quot; height=&quot;1792&quot; fill=&quot;url(#g)&quot;/><text x=&quot;414&quot; y=&quot;840&quot; font-family=&quot;Arial&quot; font-size=&quot;80&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;414&quot; y=&quot;930&quot; font-family=&quot;Arial&quot; font-size=&quot;44&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;414&quot; y=&quot;1010&quot; font-family=&quot;Arial&quot; font-size=&quot;22&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;4&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone XS Max / 11 Pro Max (1242x2688) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1242&quot; height=&quot;2688&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1242&quot; height=&quot;2688&quot; fill=&quot;url(#g)&quot;/><text x=&quot;621&quot; y=&quot;1280&quot; font-family=&quot;Arial&quot; font-size=&quot;100&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;621&quot; y=&quot;1390&quot; font-family=&quot;Arial&quot; font-size=&quot;56&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;621&quot; y=&quot;1480&quot; font-family=&quot;Arial&quot; font-size=&quot;28&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone 12 / 13 / 14 (1170x2532) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1170&quot; height=&quot;2532&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1170&quot; height=&quot;2532&quot; fill=&quot;url(#g)&quot;/><text x=&quot;585&quot; y=&quot;1200&quot; font-family=&quot;Arial&quot; font-size=&quot;96&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;585&quot; y=&quot;1300&quot; font-family=&quot;Arial&quot; font-size=&quot;52&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;585&quot; y=&quot;1390&quot; font-family=&quot;Arial&quot; font-size=&quot;26&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone 12 Pro Max / 13 Pro Max / 14 Plus (1284x2778) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1284&quot; height=&quot;2778&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1284&quot; height=&quot;2778&quot; fill=&quot;url(#g)&quot;/><text x=&quot;642&quot; y=&quot;1320&quot; font-family=&quot;Arial&quot; font-size=&quot;104&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;642&quot; y=&quot;1430&quot; font-family=&quot;Arial&quot; font-size=&quot;56&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;642&quot; y=&quot;1520&quot; font-family=&quot;Arial&quot; font-size=&quot;28&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone 14 Pro (1179x2556) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1179&quot; height=&quot;2556&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1179&quot; height=&quot;2556&quot; fill=&quot;url(#g)&quot;/><text x=&quot;590&quot; y=&quot;1210&quot; font-family=&quot;Arial&quot; font-size=&quot;96&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;590&quot; y=&quot;1310&quot; font-family=&quot;Arial&quot; font-size=&quot;52&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;590&quot; y=&quot;1400&quot; font-family=&quot;Arial&quot; font-size=&quot;26&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />
    <!-- iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max (1290x2796) -->
    <link rel="apple-touch-startup-image"
      media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
      href="data:image/svg+xml,${encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;1290&quot; height=&quot;2796&quot;><defs><linearGradient id=&quot;g&quot; x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;1&quot; y2=&quot;1&quot;><stop offset=&quot;0%&quot; stop-color=&quot;#E91E63&quot;/><stop offset=&quot;100%&quot; stop-color=&quot;#C2185B&quot;/></linearGradient></defs><rect width=&quot;1290&quot; height=&quot;2796&quot; fill=&quot;url(#g)&quot;/><text x=&quot;645&quot; y=&quot;1330&quot; font-family=&quot;Arial&quot; font-size=&quot;104&quot; font-weight=&quot;bold&quot; fill=&quot;white&quot; text-anchor=&quot;middle&quot;>TIKKA</text><text x=&quot;645&quot; y=&quot;1440&quot; font-family=&quot;Arial&quot; font-size=&quot;56&quot; font-weight=&quot;bold&quot; fill=&quot;rgba(255,255,255,0.9)&quot; text-anchor=&quot;middle&quot;>N TALK</text><text x=&quot;645&quot; y=&quot;1530&quot; font-family=&quot;Arial&quot; font-size=&quot;28&quot; fill=&quot;rgba(255,255,255,0.7)&quot; text-anchor=&quot;middle&quot; letter-spacing=&quot;5&quot;>AN INDIAN KITCHEN</text></svg>')}" />

    <!-- Primary Meta -->
    <meta name="title" content="Tikka N Talk - AN INDIAN KITCHEN" />
    <meta name="description" content="Order delicious Indian food, track orders, and earn rewards with the Tikka N Talk loyalty app. Fresh tikka, curries, naan & more!" />

    <!-- Open Graph / Facebook / WhatsApp -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:title" content="Tikka N Talk - AN INDIAN KITCHEN" />
    <meta property="og:description" content="Order delicious Indian food, track orders, and earn rewards with the Tikka N Talk loyalty app. Fresh tikka, curries, naan & more!" />
    <meta property="og:image" content="${LOGO_URL}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:site_name" content="Tikka N Talk" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${SITE_URL}/" />
    <meta name="twitter:title" content="Tikka N Talk - AN INDIAN KITCHEN" />
    <meta name="twitter:description" content="Order delicious Indian food, track orders, and earn rewards with the Tikka N Talk loyalty app." />
    <meta name="twitter:image" content="${LOGO_URL}" />
`
      return html.replace('</head>', tags + '  </head>')
    },
  }
}

export default defineConfig({
  plugins: [
    publicFileServePlugin(),
    figmaAssetPlugin(),
    ogMetaPlugin(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Alias /utils for Vercel builds (Figma Make resolves this automatically)
      '/utils': path.resolve(__dirname, './utils'),
    },
    dedupe: ['react', 'react-dom'],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})