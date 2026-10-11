import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from './supabase'
import { expand, type Occurrence } from './recurrence'

export type ItemKind = 'event' | 'task' | 'note'
export type Repeat = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Item {
  id: string
  kind: ItemKind
  title: string
  notes: string
  location: string
  /** yyyy-MM-dd */
  day: string
  all_day: boolean
  /** HH:mm:ss, or null */
  start_time: string | null
  end_time: string | null
  done: boolean
  /** One of the two people, or null for "ours". For tasks: who it's assigned to. */
  owner_id: string | null
  created_by: string | null
  updated_by: string | null
  updated_at: string
  /** How a series repeats, or null for a one-off item. `day` is the first occurrence. */
  repeat: Repeat | null
  /** Every how many days/weeks/months/years. */
  repeat_every: number
  /** Last day the series can occur on (yyyy-MM-dd); null = forever. */
  repeat_until: string | null
  /** Occurrences deleted one by one (yyyy-MM-dd). */
  skip_days: string[]
  /** Set when this row replaces one occurrence of a series. */
  series_id: string | null
  /** The occurrence of the series this row replaces (yyyy-MM-dd). */
  series_day: string | null
  /** Push reminders, in minutes before the start (untimed items: before 9:00 that day). */
  reminders: number[]
  /** The item's own color (#rrggbb), or null for the color of whose it is. */
  color: string | null
}

/** The fields the app sends; the database fills in the rest. */
export type ItemInput = Pick<
  Item,
  'kind' | 'title' | 'notes' | 'location' | 'day' | 'all_day' | 'start_time' | 'end_time' | 'done' | 'owner_id' | 'color'
>
export type RepeatInput = Pick<Item, 'repeat' | 'repeat_every' | 'repeat_until'>

/** Reminder choices, in minutes before. Untimed items only get "that day" and "the day before". */
export const REMINDERS_TIMED = [0, 15, 60, 1440]
export const REMINDERS_UNTIMED = [0, 1440]

export const MAX_TITLE = 200
export const MAX_NOTES = 2000
export const MAX_LOCATION = 200

export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

/** HH:mm from a database time. */
export const shortTime = (t: string | null) => (t ? t.slice(0, 5) : '')

/** Events by time (all-day first), then tasks, then notes. */
export function sortItems<T extends Item>(items: T[]) {
  const kindOrder: Record<ItemKind, number> = { event: 0, task: 1, note: 2 }
  return [...items].sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.title.localeCompare(b.title),
  )
}

const columns =
  'id, kind, title, notes, location, day, all_day, start_time, end_time, done, owner_id, created_by, updated_by, updated_at, ' +
  'repeat, repeat_every, repeat_until, skip_days, series_id, series_day, reminders, color'

/**
 * Everything happening from `from` to `to` (inclusive), with repeating items
 * spelled out day by day. Kept up to date live: whenever either person
 * changes something, the list reloads.
 */
export function useItems(from: Date, to: Date) {
  const start = dayKey(from)
  const end = dayKey(to)
  const [items, setItems] = useState<Occurrence[] | undefined>(undefined)

  const load = useCallback(async () => {
    // One-off items on these days, series that reach into them, and changed
    // occurrences of those series (even if they were moved to another day).
    const { data, error } = await supabase
      .from('items')
      .select(columns)
      .or(
        `and(repeat.is.null,day.gte.${start},day.lte.${end}),` +
          `and(repeat.not.is.null,day.lte.${end},or(repeat_until.is.null,repeat_until.gte.${start})),` +
          `and(series_day.gte.${start},series_day.lte.${end})`,
      )
      .order('day')
    if (!error && data) setItems(expand(data as unknown as Item[], start, end))
  }, [start, end])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel(`items-${start}-${end}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => void load())
      .subscribe()
    // Phones drop the live connection in the background; catch up on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [load, start, end])

  return { items, reload: load }
}

type Row = Partial<Omit<Item, 'id' | 'created_by' | 'updated_by' | 'updated_at'>>

export async function saveItem(input: Row, id?: string) {
  const { error } = id
    ? await supabase.from('items').update(input).eq('id', id)
    : await supabase.from('items').insert(input)
  return error
}

/** The fields of a series copied onto a row that replaces one of its occurrences. */
export function overrideOf(occ: Occurrence): Row {
  return {
    kind: occ.kind,
    title: occ.title,
    notes: occ.notes,
    location: occ.location,
    day: occ.day,
    all_day: occ.all_day,
    start_time: occ.start_time,
    end_time: occ.end_time,
    done: occ.done,
    owner_id: occ.owner_id,
    reminders: occ.reminders,
    color: occ.color,
    series_id: occ.series!.id,
    series_day: occ.seriesDay,
  }
}

/** Ticks a task off. For a repeating task only this occurrence is ticked. */
export async function setDone(occ: Occurrence, done: boolean) {
  if (occ.virtual) return saveItem({ ...overrideOf(occ), done })
  const { error } = await supabase.from('items').update({ done }).eq('id', occ.id)
  return error
}

/** Deletes one occurrence of a series, leaving the others. */
export async function deleteOccurrence(occ: Occurrence) {
  const series = occ.series!
  const failed = await saveItem({ skip_days: [...series.skip_days, occ.seriesDay!] }, series.id)
  if (failed || occ.virtual) return failed
  return deleteItem(occ.id)
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from('items').delete().eq('id', id)
  return error
}
