// Logs someone in with their username and password.
//
// The username is turned into an email address here, on the server, so the
// browser never learns anyone's email. On success the app gets back only the
// session tokens, exactly what a normal email login would give it.
import { createClient } from '@supabase/supabase-js'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const db = createClient(url, serviceKey, options)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** The caller's IP, for the per-device limits; null when it can't be read. */
function callerIp(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply(405)

  let body: { username?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return reply(400)
  }
  const { username, password } = body
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 72) {
    return reply(400)
  }

  try {
    const lookup = await db.rpc('login_email', { p_username: username, p_ip: callerIp(req) })
    if (lookup.status === 429) return reply(429)
    if (lookup.error) throw lookup.error
    // Same answer for an unknown username and a wrong password.
    if (!lookup.data) return reply(401)

    // A fresh client per login, so the shared one keeps its service-role access.
    const auth = createClient(url, serviceKey, options).auth
    const { data, error } = await auth.signInWithPassword({ email: lookup.data as string, password })
    if (error?.status === 429) return reply(429)
    if (error || !data.session) return reply(401)
    return reply(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  } catch (e) {
    console.error(e)
    return reply(500)
  }
})
