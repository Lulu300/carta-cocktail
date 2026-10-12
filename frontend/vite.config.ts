import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor code in its own chunks keeps its long-term cache across app releases.
        // Each group also takes the dependencies of the packages it matches
        // (includeDependenciesRecursively defaults to true), like Rollup's manualChunks did.
        codeSplitting: {
          groups: [
            {
              // react-router is listed because react-router-dom only re-exports it: the
              // re-export module disappears, leaving no dependency for the group to follow.
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
            },
            {
              name: 'vendor-i18n',
              test: /[\\/]node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
