import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The site is served from https://<user>.github.io/SharedCalendar/
export default defineConfig({
  base: '/SharedCalendar/',
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Calendario',
        short_name: 'Calendario',
        description: 'Il nostro calendario condiviso',
        lang: 'it',
        start_url: '/SharedCalendar/',
        scope: '/SharedCalendar/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121214',
        theme_color: '#121214',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/SharedCalendar/index.html',
      },
    }),
  ],
})
