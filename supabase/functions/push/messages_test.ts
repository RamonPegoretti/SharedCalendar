// Run with: deno test supabase/functions/push
import { assertEquals } from 'jsr:@std/assert@1'
import { activityMessage, describeChange, dueReminders, zonedTime, type ItemRow, type Person } from './messages.ts'

const ramon: Person = { id: 'r', display_name: 'Ramon', language: 'it', time_zone: 'Europe/Rome', notify_partner: true }
const eva: Person = { id: 'e', display_name: 'eva', language: 'en', time_zone: 'Europe/Rome', notify_partner: true }
const people = [ramon, eva]

const item = (fields: Partial<ItemRow>): ItemRow => ({
  id: 'i1',
  kind: 'event',
  title: 'Cena',
  notes: '',
  location: '',
  day: '2026-10-12',
  all_day: false,
  start_time: '20:00:00',
  end_time: null,
  done: false,
  owner_id: null,
  reminders: [],
  repeat: null,
  repeat_every: 1,
  repeat_until: null,
  skip_days: [],
  series_id: null,
  series_day: null,
  ...fields,
})

const at = (iso: string) => Date.parse(iso)

Deno.test('local times follow summer and winter time in Italy', () => {
  assertEquals(new Date(zonedTime('2026-10-12', '20:00', 'Europe/Rome')).toISOString(), '2026-10-12T18:00:00.000Z')
  assertEquals(new Date(zonedTime('2026-12-01', '09:00', 'Europe/Rome')).toISOString(), '2026-12-01T08:00:00.000Z')
  // Clocks go back on 25 Oct 2026 at 03:00.
  assertEquals(new Date(zonedTime('2026-10-25', '09:00', 'Europe/Rome')).toISOString(), '2026-10-25T08:00:00.000Z')
  assertEquals(new Date(zonedTime('2027-03-28', '09:00', 'Europe/Rome')).toISOString(), '2027-03-28T07:00:00.000Z')
})

Deno.test('a reminder is due right after its time and for 15 minutes', () => {
  const rows = [item({ reminders: [15], owner_id: 'r' })]
  // 20:00 Rome = 18:00 UTC, minus 15 minutes.
  assertEquals(dueReminders(rows, people, at('2026-10-12T17:44:59Z')).length, 0)
  const due = dueReminders(rows, people, at('2026-10-12T17:45:30Z'))
  assertEquals(due.length, 1)
  assertEquals(due[0].user_id, 'r')
  assertEquals(due[0].payload.body, 'Tra 15 minuti · 20:00')
  assertEquals(due[0].payload.url, '#/d/2026-10-12')
  assertEquals(dueReminders(rows, people, at('2026-10-12T18:00:01Z')).length, 0)
})

Deno.test('"ours" items remind both, each in their language', () => {
  const rows = [item({ reminders: [0], location: 'Da Mario' })]
  const due = dueReminders(rows, people, at('2026-10-12T18:00:00Z'))
  assertEquals(
    due.map((d) => d.payload.body),
    ['Inizia ora · 20:00 · Da Mario', 'Starting now · 20:00 · Da Mario'],
  )
})

Deno.test('untimed items remind at 9:00, done tasks not at all', () => {
  const task = item({ kind: 'task', start_time: null, all_day: true, reminders: [0, 1440], owner_id: 'e' })
  const dayBefore = dueReminders([task], people, at('2026-10-11T07:00:00Z'))
  assertEquals(dayBefore.map((d) => [d.user_id, d.minutes, d.payload.body]), [['e', 1440, 'Due tomorrow']])
  const sameDay = dueReminders([task], people, at('2026-10-12T07:05:00Z'))
  assertEquals(sameDay.map((d) => d.payload.body), ['Due today'])
  assertEquals(dueReminders([{ ...task, done: true }], people, at('2026-10-12T07:05:00Z')).length, 0)
})

Deno.test('repeating items remind on each occurrence, minus skipped and moved days', () => {
  const series = item({ id: 's', day: '2026-09-07', repeat: 'weekly', reminders: [60], owner_id: 'r', skip_days: ['2026-10-19'] })
  // Monday 12 Oct is the 6th week: 19:00 Rome = 17:00 UTC.
  const due = dueReminders([series], people, at('2026-10-12T17:00:00Z'))
  assertEquals(due.map((d) => [d.item_id, d.day]), [['s', '2026-10-12']])
  // Skipped week.
  assertEquals(dueReminders([series], people, at('2026-10-19T17:00:00Z')).length, 0)

  // This week's dinner was moved to 21:00 ("only this one").
  const moved = item({ id: 'o', series_id: 's', series_day: '2026-10-26', day: '2026-10-26', start_time: '21:00:00', reminders: [60], owner_id: 'r' })
  // 26 Oct is winter time: 20:00 Rome = 19:00 UTC; the series' 19:00 slot is gone.
  assertEquals(dueReminders([series, moved], people, at('2026-10-26T18:00:00Z')).length, 0)
  const dueMoved = dueReminders([series, moved], people, at('2026-10-26T19:00:00Z'))
  // Logged under the series and day, so editing a day later doesn't send it twice.
  assertEquals(dueMoved.map((d) => [d.item_id, d.day, d.payload.body]), [['s', '2026-10-26', 'Tra un’ora · 21:00']])
})

Deno.test('monthly on the 31st lands on the last day of shorter months', () => {
  const rent = item({ id: 'm', day: '2026-08-31', repeat: 'monthly', start_time: null, all_day: true, reminders: [0], owner_id: 'r' })
  const due = dueReminders([rent], people, at('2026-09-30T07:00:00Z'))
  assertEquals(due.map((d) => d.day), ['2026-09-30'])
})

Deno.test('changes are described the way a person would', () => {
  const before = item({})
  assertEquals(describeChange('insert', before, null), { change: 'added', day: '2026-10-12' })
  assertEquals(describeChange('update', { ...before, title: 'Cena fuori' }, before), { change: 'changed', day: '2026-10-12' })
  assertEquals(describeChange('update', { ...before }, before), null)
  const task = item({ kind: 'task' })
  assertEquals(describeChange('update', { ...task, done: true }, task), { change: 'done', day: '2026-10-12' })
  const series = item({ repeat: 'weekly' })
  assertEquals(describeChange('update', { ...series, skip_days: ['2026-10-19'] }, series), {
    change: 'deleted',
    day: '2026-10-19',
  })
  const override = item({ id: 'o', kind: 'task', series_id: 's', series_day: '2026-10-19', day: '2026-10-19', done: true })
  assertEquals(describeChange('insert', override, null), { change: 'done', day: '2026-10-19' })
  assertEquals(describeChange('delete', before, null), { change: 'deleted', day: '2026-10-12' })
})

Deno.test('activity messages', () => {
  const msg = activityMessage('added', '2026-10-12', item({}), 'eva', 'it')
  assertEquals(msg.title, 'eva ha aggiunto')
  assertEquals(msg.body, 'Cena · lun 12 ott, 20:00')
  const en = activityMessage('done', '2026-10-12', item({ kind: 'task', title: 'Buy milk', start_time: null }), 'Ramon', 'en')
  assertEquals([en.title, en.body], ['Ramon completed', 'Buy milk · Mon 12 Oct'])
})
