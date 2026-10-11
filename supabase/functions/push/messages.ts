// What the push function decides to send, kept free of network calls so it
// can be tested on its own (see messages_test.ts).
import { expand, type Repeating } from '../_shared/recurrence.ts'

export type Language = 'it' | 'en'

export interface ItemRow extends Repeating {
  kind: 'event' | 'task' | 'note'
  title: string
  notes: string
  location: string
  all_day: boolean
  /** HH:mm:ss or null */
  start_time: string | null
  end_time: string | null
  done: boolean
  owner_id: string | null
  reminders: number[]
}

export interface Person {
  id: string
  display_name: string
  language: Language
  time_zone: string
  notify_partner: boolean
}

export interface Payload {
  title: string
  body: string
  /** Opened when the notification is tapped, relative to the app. */
  url: string
  /** Notifications with the same tag replace each other. */
  tag: string
}

/** Untimed items remind at this local time. */
const UNTIMED_AT = '09:00'
const DAY = 24 * 60 * 60 * 1000

const strings = {
  it: {
    startsNow: 'Inizia ora',
    dueNow: 'Scade ora',
    in15: 'Tra 15 minuti',
    in60: 'Tra un’ora',
    today: 'Oggi',
    dueToday: 'Scade oggi',
    tomorrow: 'Domani',
    dueTomorrow: 'Scade domani',
    added: '{name} ha aggiunto',
    changed: '{name} ha modificato',
    deleted: '{name} ha eliminato',
    done: '{name} ha completato',
    reopened: '{name} ha riaperto',
    testTitle: 'Calendario',
    testBody: 'Le notifiche funzionano.',
  },
  en: {
    startsNow: 'Starting now',
    dueNow: 'Due now',
    in15: 'In 15 minutes',
    in60: 'In an hour',
    today: 'Today',
    dueToday: 'Due today',
    tomorrow: 'Tomorrow',
    dueTomorrow: 'Due tomorrow',
    added: '{name} added',
    changed: '{name} changed',
    deleted: '{name} deleted',
    done: '{name} completed',
    reopened: '{name} reopened',
    testTitle: 'Calendar',
    testBody: 'Notifications are working.',
  },
} satisfies Record<Language, Record<string, string>>

const lang = (l: string | null | undefined): Language => (l === 'en' ? 'en' : 'it')

export const testMessage = (language: Language): Payload => ({
  title: strings[lang(language)].testTitle,
  body: strings[lang(language)].testBody,
  url: './',
  tag: 'test',
})

// ---------- time zones ----------

/** How far a time zone is ahead of UTC at a given moment, in ms. */
function offsetAt(utc: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utc))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wall - Math.floor(utc / 1000) * 1000
}

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return 'Europe/Rome'
  }
}

/** The moment a local date and time (yyyy-MM-dd, HH:mm) happens in a time zone. */
export function zonedTime(day: string, time: string, zone: string) {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const first = wall - offsetAt(wall, zone)
  // Around a clock change the offset can differ a few hours later.
  const second = wall - offsetAt(first, zone)
  return second
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// ---------- reminders ----------

export interface Due {
  /** The item, or for a repeating item the series. */
  item_id: string
  /** The occurrence (for a series: which day of it). */
  day: string
  minutes: number
  user_id: string
  payload: Payload
}

function reminderText(minutes: number, timed: boolean, isTask: boolean, l: Language) {
  const s = strings[l]
  if (timed) {
    if (minutes === 0) return isTask ? s.dueNow : s.startsNow
    if (minutes === 15) return s.in15
    if (minutes === 60) return s.in60
    return s.tomorrow
  }
  if (minutes === 0) return isTask ? s.dueToday : s.today
  return isTask ? s.dueTomorrow : s.tomorrow
}

/**
 * Reminders that should have gone off in the last `lookbackMinutes`. Repeating
 * items are spelled out the same way the calendar does it. A reminder goes to
 * the item's owner (for tasks: whoever it's assigned to), or to both people
 * for "ours" items, at their own local time.
 */
export function dueReminders(rows: ItemRow[], people: Person[], now: number, lookbackMinutes = 15): Due[] {
  // Two days either side covers "1 day before" plus any time zone.
  const occurrences = expand(rows, utcDay(now - 2 * DAY), utcDay(now + 2 * DAY))
  const out: Due[] = []
  for (const occ of occurrences) {
    if (!occ.reminders?.length || (occ.kind === 'task' && occ.done)) continue
    const timed = occ.start_time !== null && !(occ.kind === 'event' && occ.all_day)
    const time = timed ? occ.start_time!.slice(0, 5) : UNTIMED_AT
    const recipients = occ.owner_id ? people.filter((p) => p.id === occ.owner_id) : people
    const itemId = occ.series?.id ?? occ.id
    const day = occ.seriesDay ?? occ.day
    for (const person of recipients) {
      const startsAt = zonedTime(occ.day, time, validZone(person.time_zone))
      const l = lang(person.language)
      for (const minutes of occ.reminders) {
        const at = startsAt - minutes * 60_000
        if (at > now || at <= now - lookbackMinutes * 60_000) continue
        const body = [reminderText(minutes, timed, occ.kind === 'task', l), timed ? time : '', occ.location]
          .filter(Boolean)
          .join(' · ')
        out.push({
          item_id: itemId,
          day,
          minutes,
          user_id: person.id,
          payload: { title: occ.title, body, url: `#/d/${occ.day}`, tag: `r-${itemId}-${day}` },
        })
      }
    }
  }
  return out
}

// ---------- partner activity ----------

export type Change = 'added' | 'changed' | 'deleted' | 'done' | 'reopened'

/** Fields whose change is worth telling the other person about. */
const watched = [
  'kind',
  'title',
  'notes',
  'location',
  'day',
  'all_day',
  'start_time',
  'end_time',
  'done',
  'owner_id',
  'repeat',
  'repeat_every',
  'repeat_until',
  'skip_days',
  'reminders',
] as const

/**
 * What a database change means to a person: which word to use and which day
 * to point at. Null when nothing visible changed.
 */
export function describeChange(
  op: 'insert' | 'update' | 'delete',
  item: ItemRow,
  old: ItemRow | null,
): { change: Change; day: string } | null {
  if (op === 'insert') {
    // A row standing in for one day of a series: that day was changed or ticked off.
    if (item.series_id) return { change: item.done ? 'done' : 'changed', day: item.day }
    return { change: 'added', day: item.day }
  }
  if (op === 'delete' || !old) return { change: 'deleted', day: item.day }

  const changed = watched.filter((k) => JSON.stringify(item[k]) !== JSON.stringify(old[k]))
  if (changed.length === 0) return null
  if (changed.length === 1 && changed[0] === 'done') return { change: item.done ? 'done' : 'reopened', day: item.day }
  if (changed.length === 1 && changed[0] === 'skip_days') {
    // One day of a series was deleted.
    const removed = item.skip_days.find((d) => !old.skip_days.includes(d))
    return removed ? { change: 'deleted', day: removed } : null
  }
  return { change: 'changed', day: item.day }
}

export function activityMessage(change: Change, day: string, item: ItemRow, actor: string, language: Language): Payload {
  const l = lang(language)
  const [y, m, d] = day.split('-').map(Number)
  const date = new Intl.DateTimeFormat(l === 'en' ? 'en-GB' : 'it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
  const time = item.start_time && !(item.kind === 'event' && item.all_day) ? `, ${item.start_time.slice(0, 5)}` : ''
  return {
    title: strings[l][change].replace('{name}', actor),
    body: `${item.title} · ${date}${time}`,
    url: `#/d/${day}`,
    tag: `a-${item.series_id ?? item.id}`,
  }
}
