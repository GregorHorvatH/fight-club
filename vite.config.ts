import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // relative asset paths: the built `dist/` works from any URL - a domain root, a GitHub Pages sub-path, a plain folder
  base: './',
  build: {
    chunkSizeWarningLimit: 1000, // three.js itself is ~930 kB (247 kB gzipped); it lives in the lazy Arena3D chunk and is only downloaded when the 3D view is opened
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
})
