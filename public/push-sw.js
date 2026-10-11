// Loaded into the app's service worker (see vite.config.ts). Shows the
// notifications the server pushes and opens the right day when one is tapped.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Calendario', {
      body: data.body || '',
      tag: data.tag,
      icon: 'pwa-192.png',
      badge: 'badge-96.png',
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      return open.navigate(url).catch(() => undefined)
    }),
  )
})
