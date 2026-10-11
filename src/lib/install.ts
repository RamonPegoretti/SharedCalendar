import { useEffect, useState } from 'react'

// Chrome on Android fires `beforeinstallprompt` once the page is installable.
// It can fire before React mounts, so we catch it as soon as this module loads.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export type InstallState = 'installed' | 'prompt' | 'ios' | 'inApp' | 'manual'

function currentState(): InstallState {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  if (deferred) return 'prompt'
  const ua = navigator.userAgent
  // Browsers built into other apps (Instagram, WhatsApp, Telegram, Gmail…) can't install web apps.
  if (/FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|GSA\/|; wv\)/i.test(ua)) return 'inApp'
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios'
  return 'manual'
}

export function useInstall() {
  const [state, setState] = useState<InstallState>(currentState)
  useEffect(() => {
    const update = () => setState(currentState())
    listeners.add(update)
    return () => void listeners.delete(update)
  }, [])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    notify()
  }

  return { state, install }
}
