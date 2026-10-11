// Sends the calendar's push notifications.
//
// Called three ways:
// - every minute by pg_cron, {"type":"reminders"}: sends reminders that are due
// - by a trigger on items, {"type":"activity", ...}: tells the other person
// - by the app's "Send a test notification" button, {"type":"test"}
// The first two carry the database's shared secret; the test call carries the
// signed-in person's login token instead.
import { createClient } from '@supabase/supabase-js'
import * as webpush from '@negrel/webpush'
import { activityMessage, describeChange, dueReminders, testMessage, type ItemRow, type Payload, type Person } from './messages.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// ---------- keys ----------

interface Setup {
  server: webpush.ApplicationServer
  hookSecret: string
}
let setup: Promise<Setup> | undefined

/** Loads the keys, creating the VAPID pair the very first time. */
async function loadSetup(): Promise<Setup> {
  const { data, error } = await db.from('push_keys').select('hook_secret, vapid').single()
  if (error) throw error
  let vapid = data.vapid as webpush.ExportedVapidKeys | null
  if (!vapid) {
    const keys = await webpush.generateVapidKeys({ extractable: true })
    await db
      .from('push_keys')
      .update({ vapid: await webpush.exportVapidKeys(keys), vapid_public: await webpush.exportApplicationServerKey(keys) })
      .is('vapid', null)
    // Another run may have won the race; use whatever got saved.
    const again = await db.from('push_keys').select('vapid').single()
    if (again.error) throw again.error
    vapid = again.data.vapid
  }
  const server = await webpush.ApplicationServer.new({
    contactInformation: 'https://ramonpegoretti.github.io/SharedCalendar/',
    vapidKeys: await webpush.importVapidKeys(vapid!, { extractable: false }),
  })
  return { server, hookSecret: data.hook_secret }
}

function getSetup() {
  setup ??= loadSetup().catch((e) => {
    setup = undefined
    throw e
  })
  return setup
}

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------- sending ----------

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
}

async function subscriptionsOf(userIds: string[]) {
  if (userIds.length === 0) return []
  const { data, error } = await db.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', userIds)
  if (error) throw error
  return data as Subscription[]
}

/** Sends to every device of one person. Devices the push service has forgotten are removed. */
async function send(server: webpush.ApplicationServer, subs: Subscription[], payload: Payload, ttl: number) {
  let sent = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await server
          .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
          .pushTextMessage(JSON.stringify(payload), { ttl, urgency: webpush.Urgency.High })
        sent++
      } catch (e) {
        if (e instanceof webpush.PushMessageError && e.isGone()) {
          await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('push failed', sub.endpoint.slice(0, 40), String(e))
        }
      }
    }),
  )
  return sent
}

async function loadPeople() {
  const { data, error } = await db.from('profiles').select('id, display_name, language, time_zone, notify_partner')
  if (error) throw error
  return data as Person[]
}

// ---------- reminders ----------

const itemColumns =
  'id, kind, title, notes, location, day, all_day, start_time, end_time, done, owner_id, ' +
  'repeat, repeat_every, repeat_until, skip_days, series_id, series_day, reminders'

async function sendReminders(server: webpush.ApplicationServer) {
  const now = Date.now()
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const start = day(now - 2 * 86_400_000)
  const end = day(now + 2 * 86_400_000)

  // Same selection the calendar makes for the days on screen.
  const { data, error } = await db
    .from('items')
    .select(itemColumns)
    .or(
      `and(repeat.is.null,day.gte.${start},day.lte.${end}),` +
        `and(repeat.not.is.null,day.lte.${end},or(repeat_until.is.null,repeat_until.gte.${start})),` +
        `and(series_day.gte.${start},series_day.lte.${end})`,
    )
  if (error) throw error

  const people = await loadPeople()
  const due = dueReminders(data as unknown as ItemRow[], people, now)
  if (due.length === 0) return 0

  const subs = await subscriptionsOf([...new Set(due.map((d) => d.user_id))])
  const reachable = due.filter((d) => subs.some((s) => s.user_id === d.user_id))
  if (reachable.length === 0) return 0

  // Record first; only the ones not already recorded get sent.
  const { data: fresh, error: logError } = await db
    .from('push_sent')
    .upsert(
      reachable.map(({ item_id, day, minutes, user_id }) => ({ item_id, day, minutes, user_id })),
      { onConflict: 'item_id,day,minutes,user_id', ignoreDuplicates: true },
    )
    .select('item_id, day, minutes, user_id')
  if (logError) throw logError
  const isFresh = new Set((fresh ?? []).map((r) => `${r.item_id}|${r.day}|${r.minutes}|${r.user_id}`))

  let sent = 0
  for (const d of reachable) {
    if (!isFresh.has(`${d.item_id}|${d.day}|${d.minutes}|${d.user_id}`)) continue
    sent += await send(server, subs.filter((s) => s.user_id === d.user_id), d.payload, 3600)
  }

  // The log only needs to cover the look-back window; trim it now and then.
  if (Math.random() < 0.02) {
    await db.from('push_sent').delete().lt('sent_at', new Date(now - 7 * 86_400_000).toISOString())
  }
  return sent
}

// ---------- partner activity ----------

interface ActivityCall {
  op: 'insert' | 'update' | 'delete'
  actor: string
  item: ItemRow
  old: ItemRow | null
}

async function sendActivity(server: webpush.ApplicationServer, call: ActivityCall) {
  const what = describeChange(call.op, call.item, call.old)
  if (!what) return 0

  // Deleting one changed day of a series first marks the day as skipped on
  // the series (already announced), then removes the day's own row.
  if (call.op === 'delete' && call.item.series_id) {
    const { data } = await db.from('items').select('skip_days').eq('id', call.item.series_id).maybeSingle()
    if (data?.skip_days?.includes(call.item.series_day)) return 0
  }

  const people = await loadPeople()
  const actor = people.find((p) => p.id === call.actor)?.display_name ?? '?'
  const recipients = people.filter((p) => p.id !== call.actor && p.notify_partner)
  const subs = await subscriptionsOf(recipients.map((p) => p.id))
  let sent = 0
  for (const person of recipients) {
    const payload = activityMessage(what.change, what.day, call.item, actor, person.language)
    sent += await send(server, subs.filter((s) => s.user_id === person.id), payload, 86_400)
  }
  return sent
}

// ---------- test ----------

async function sendTest(server: webpush.ApplicationServer, token: string) {
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return null
  const people = await loadPeople()
  const me = people.find((p) => p.id === data.user.id)
  return send(server, await subscriptionsOf([data.user.id]), testMessage(me?.language ?? 'it'), 600)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply(405)

  let body: { type?: string } & Partial<ActivityCall>
  try {
    body = await req.json()
  } catch {
    return reply(400)
  }

  try {
    const { server, hookSecret } = await getSetup()

    if (body.type === 'test') {
      const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
      const sent = await sendTest(server, token)
      return sent === null ? reply(401) : reply(200, { sent })
    }

    if (!sameSecret(req.headers.get('x-push-secret') ?? '', hookSecret)) return reply(401)
    if (body.type === 'reminders') return reply(200, { sent: await sendReminders(server) })
    if (body.type === 'activity') return reply(200, { sent: await sendActivity(server, body as ActivityCall) })
    return reply(400)
  } catch (e) {
    console.error(e)
    return reply(500)
  }
})
