import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The browsers of v1.11 (Vite 7's default target), down from Vite 8's Safari 16.4: tablets
// stuck on iPadOS 16.0 to 16.3 still serve as menu displays and for the admin. With Safari
// 16.4, the CSS keeps Tailwind's range media queries (`width>=40rem`), which these versions
// ignore: every sm:, md: and lg: style is lost. build.cssTarget follows this list.
// .github/scripts/css-media-ranges.mjs checks the built CSS in CI.
const BROWSER_TARGETS = ['chrome107', 'edge107', 'firefox104', 'safari16']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: BROWSER_TARGETS,
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
