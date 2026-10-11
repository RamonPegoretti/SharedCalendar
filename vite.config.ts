import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Shown at the bottom of the screen as "v1.0.123": major.minor come from
// package.json, the last number is the commit count, so every deploy bumps it.
function appVersion() {
  const [major, minor] = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version.split('.')
  let commits = '0'
  try {
    commits = execSync('git rev-list --count HEAD').toString().trim()
  } catch {
    // Not a git checkout (e.g. a downloaded zip): fall back to 0.
  }
  return `${major}.${minor}.${commits}`
}

// The site is served from https://<user>.github.io/SharedCalendar/
export default defineConfig({
  base: '/SharedCalendar/',
  build: { chunkSizeWarningLimit: 800 },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'badge-96.png'],
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
        // Push notification handling lives in its own small file.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
})
