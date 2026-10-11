import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface Person {
  id: string
  display_name: string
  color: string
}

/** Colors a person can pick for their items. "Ours" has its own fixed color. */
export const PERSON_COLORS = ['#5b9cf6', '#f472b6', '#2dd4bf', '#4ade80', '#fb923c', '#f87171']
export const OURS_COLOR = '#a78bfa'

export interface People {
  me: Person | undefined
  partner: Person | undefined
  /** Color for an item's owner (null = ours). */
  colorOf: (ownerId: string | null) => string
  nameOf: (id: string | null) => string | undefined
}

/** Both accounts, with their item colors. */
export function usePeople(myId: string) {
  const [list, setList] = useState<Person[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, color, created_at')
      .order('created_at')
    if (!data) return
    // Until someone picks a color, the first account is blue and the second pink.
    setList(data.map((p, i) => ({ id: p.id, display_name: p.display_name, color: p.color ?? PERSON_COLORS[i % 2] })))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setMyColor = useCallback(
    async (color: string) => {
      setList((prev) => prev.map((p) => (p.id === myId ? { ...p, color } : p)))
      await supabase.from('profiles').update({ color }).eq('id', myId)
    },
    [myId],
  )

  const people: People = {
    me: list.find((p) => p.id === myId),
    partner: list.find((p) => p.id !== myId),
    colorOf: (ownerId) => (ownerId ? (list.find((p) => p.id === ownerId)?.color ?? OURS_COLOR) : OURS_COLOR),
    nameOf: (id) => list.find((p) => p.id === id)?.display_name,
  }

  return { people, setMyColor }
}
