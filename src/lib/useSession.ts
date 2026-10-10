import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'

/** Current login session; `undefined` while it is still being restored. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return session
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, username, display_name, language, theme')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data as Profile)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return profile
}
