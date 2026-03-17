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
    <link rel="icon" type="image/svg+xml" href="/icon-192.svg" />
    <link rel="apple-touch-icon" href="${LOGO_URL}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Tikka N Talk" />
    <meta name="theme-color" content="#D91A60" />

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