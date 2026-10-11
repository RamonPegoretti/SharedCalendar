import { defineConfig } from 'vite'

// The iPhone widget (widget/main.ts) as one plain script, served at
// /SharedCalendar/widget/calendario.js for the Scriptable app to download.
// Runs after the app's own build, into the same dist folder.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/widget',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: 'widget/main.ts',
      formats: ['iife'],
      name: 'Calendario',
      fileName: () => 'calendario.js',
    },
  },
})
