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

export default defineConfig({
  plugins: [
    publicFileServePlugin(),
    figmaAssetPlugin(),
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