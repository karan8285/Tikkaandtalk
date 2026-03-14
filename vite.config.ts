import { defineConfig } from 'vite'
import path from 'path'
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

export default defineConfig({
  plugins: [
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