import { registerSW } from 'virtual:pwa-register'

// Installed apps (especially on iPhone) can keep running an old version for a
// long time. Check for a new one whenever the app comes back to the screen,
// and every half hour while it's open; a new version reloads the app by itself.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) void registration.update()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 30 * 60 * 1000)
  },
})
