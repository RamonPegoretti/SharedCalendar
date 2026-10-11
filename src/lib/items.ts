import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from './supabase'

export type ItemKind = 'event' | 'task' | 'note'

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
}

/** The fields the app sends; the database fills in the rest. */
export type ItemInput = Pick<
  Item,
  'kind' | 'title' | 'notes' | 'location' | 'day' | 'all_day' | 'start_time' | 'end_time' | 'done' | 'owner_id'
>

export const MAX_TITLE = 200
export const MAX_NOTES = 2000
export const MAX_LOCATION = 200

export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

/** HH:mm from a database time. */
export const shortTime = (t: string | null) => (t ? t.slice(0, 5) : '')

/** Events by time (all-day first), then tasks, then notes. */
export function sortItems(items: Item[]) {
  const kindOrder: Record<ItemKind, number> = { event: 0, task: 1, note: 2 }
  return [...items].sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.title.localeCompare(b.title),
  )
}

/**
 * Items from `from` to `to` (inclusive), kept up to date live: whenever either
 * person changes something, the list reloads.
 */
export function useItems(from: Date, to: Date) {
  const start = dayKey(from)
  const end = dayKey(to)
  const [items, setItems] = useState<Item[] | undefined>(undefined)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('id, kind, title, notes, location, day, all_day, start_time, end_time, done, owner_id, created_by, updated_by, updated_at')
      .gte('day', start)
      .lte('day', end)
      .order('day')
    if (!error && data) setItems(data as Item[])
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

export async function saveItem(input: ItemInput, id?: string) {
  const { error } = id
    ? await supabase.from('items').update(input).eq('id', id)
    : await supabase.from('items').insert(input)
  return error
}

export async function setDone(id: string, done: boolean) {
  const { error } = await supabase.from('items').update({ done }).eq('id', id)
  return error
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from('items').delete().eq('id', id)
  return error
}
