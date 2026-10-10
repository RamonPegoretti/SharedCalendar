import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to be public: row-level security in the
// database decides what each signed-in user can read and write.
const SUPABASE_URL = 'https://eqwxzvgglodkefwutapi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y08AGq6CbFjP1fF6NItmyQ_0c4Pbq4n'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Language = 'it' | 'en'
export type Theme = 'dark' | 'light' | 'system'

export interface Profile {
  id: string
  username: string
  display_name: string
  language: Language
  theme: Theme
}
