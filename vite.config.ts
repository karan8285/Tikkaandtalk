import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    // Fallback for figma:asset imports in non-Figma environments (e.g., Vercel)
    // In Figma Make, the built-in resolver handles these first.
    {
      name: 'figma-asset-fallback',
      apply: 'build',
      resolveId(id) {
        if (id.startsWith('figma:asset/')) {
          return id;
        }
      },
      load(id) {
        if (id.startsWith('figma:asset/')) {
          // Return a fallback — user should place logo.png in /public for Vercel
          return `export default "/logo.png";`;
        }
      },
    },
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