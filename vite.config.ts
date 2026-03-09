import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // Fallback for figma:asset imports in non-Figma environments (e.g., Vercel builds).
    // Must be FIRST and enforce:'pre' so it intercepts before vite:asset tries to read the file.
    // In Figma Make's dev server, the built-in resolver handles these natively.
    {
      name: 'figma-asset-fallback',
      enforce: 'pre',
      apply: 'build',
      resolveId(id) {
        if (id.startsWith('figma:asset/')) {
          return '\0figma-asset-fallback';
        }
      },
      load(id) {
        if (id === '\0figma-asset-fallback') {
          return `export default "/logo.png";`;
        }
      },
    },
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