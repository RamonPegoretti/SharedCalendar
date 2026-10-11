import { supabase } from './supabase'

/**
 * Where this device stands with push notifications:
 * - unsupported: the browser can't do them at all
 * - install: iPhone/iPad Safari, which only allows them once the app is on the home screen
 * - denied: the person said no (only the phone's settings can undo that)
 * - off / on: whether this device is signed up for notifications
 */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** True when this browser already lets the app show notifications. */
export const notificationsAllowed = () => supported() && Notification.permission === 'granted'

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** Push service keys arrive base64url-encoded; the browser wants raw bytes. */
function fromBase64Url(text: string) {
  const base64 = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Tells the server where to send this device's notifications. */
async function remember(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys?.p256dh,
    p_auth: keys?.auth,
  })
  return !error
}

/**
 * Asks for permission and signs this device up. Must run straight from a tap:
 * iPhones only show the permission prompt in response to one.
 */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const { data: key } = await supabase.rpc('vapid_public_key')
  if (!key) throw new Error('push not set up on the server yet')
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) }))
  if (!(await remember(subscription))) throw new Error('could not save the subscription')
  return 'on'
}

/** Stops notifications on this device (e.g. before signing out). */
export async function disablePush() {
  if (!supported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}

/**
 * On every start, re-sends this device's details: phones sometimes renew
 * them, and the server drops ones the push service says are gone.
 */
export async function refreshPush() {
  if (!notificationsAllowed()) return
  const subscription = await currentSubscription()
  if (subscription) await remember(subscription)
}

/** Sends a test notification to all of my devices. */
export async function sendTestPush() {
  const { error } = await supabase.functions.invoke('push', { body: { type: 'test' } })
  return !error
}
