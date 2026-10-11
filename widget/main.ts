// The iPhone home screen and lock screen widget.
//
// Web apps can't have widgets of their own on iPhone, so this runs inside the
// free Scriptable app. Setup is on widget.html: Scriptable gets a short loader
// script that downloads this file from the website each time it runs, so the
// widget updates together with the app.
//
// Run in the Scriptable app, it asks for the username and password once and
// keeps only the session (never the password) in the iPhone's Keychain. Run as
// a widget, it reads the next two weeks with that session and draws them.
import { addDays, addMinutes, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { enUS, it as itLocale } from 'date-fns/locale'
import { expand, type Repeating } from '../supabase/functions/_shared/recurrence.ts'

// Same project and public key as src/lib/supabase.ts.
const SUPABASE_URL = 'https://eqwxzvgglodkefwutapi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y08AGq6CbFjP1fF6NItmyQ_0c4Pbq4n'
const APP_URL = 'https://ramonpegoretti.github.io/SharedCalendar/'

const DAYS_AHEAD = 13
const REFRESH_MINUTES = 15
const SESSION_KEY = 'calendario.session'

// ---------- Text ----------

const strings = {
  it: {
    title: 'Calendario',
    today: 'Oggi',
    tomorrow: 'Domani',
    nothingToday: 'Niente oggi',
    nothing: 'Niente in programma',
    next: 'Prossimo',
    signIn: 'Apri Scriptable per accedere',
    loginTitle: 'Accedi al calendario',
    loginMessage: 'Username (o email) e password, come nell’app. La password non viene salvata.',
    username: 'Username o email',
    password: 'Password',
    login: 'Accedi',
    cancel: 'Annulla',
    wrong: 'Username o password sbagliati.',
    tooMany: 'Troppi tentativi, riprova tra qualche minuto.',
    failed: 'Non riesco a collegarmi. Controlla la connessione.',
    signedIn: 'Fatto! Ora aggiungi il widget Scriptable alla schermata Home e scegli questo script.',
    preview: 'Anteprima',
    small: 'Piccolo',
    medium: 'Medio',
    large: 'Grande',
    logout: 'Esci',
  },
  en: {
    title: 'Calendar',
    today: 'Today',
    tomorrow: 'Tomorrow',
    nothingToday: 'Nothing today',
    nothing: 'Nothing planned',
    next: 'Next',
    signIn: 'Open Scriptable to log in',
    loginTitle: 'Log in to the calendar',
    loginMessage: 'Username (or email) and password, as in the app. The password is not saved.',
    username: 'Username or email',
    password: 'Password',
    login: 'Log in',
    cancel: 'Cancel',
    wrong: 'Wrong username or password.',
    tooMany: 'Too many tries, try again in a few minutes.',
    failed: 'Can’t connect. Check the connection.',
    signedIn: 'Done! Now add the Scriptable widget to the Home Screen and pick this script.',
    preview: 'Preview',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    logout: 'Log out',
  },
}
type Language = keyof typeof strings

// ---------- Session ----------

interface Session {
  access_token: string
  refresh_token: string
  /** Seconds since 1970 when the access token stops working. */
  expires_at: number
  user_id: string
}

function savedSession(): Session | null {
  try {
    return Keychain.contains(SESSION_KEY) ? (JSON.parse(Keychain.get(SESSION_KEY)) as Session) : null
  } catch {
    return null
  }
}

function keep(session: Session) {
  Keychain.set(SESSION_KEY, JSON.stringify(session))
}

function request(path: string, method = 'GET', body?: unknown, token?: string) {
  const req = new Request(SUPABASE_URL + path)
  req.method = method
  req.timeoutInterval = 15
  req.headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
  if (body !== undefined) req.body = JSON.stringify(body)
  return req
}

/**
 * Sends a request and returns its status and parsed JSON (null when it has
 * none). Throws when there's no connection.
 */
async function send(req: Request): Promise<{ status: number; json: unknown }> {
  const text = await req.loadString()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    // empty or non-JSON body
  }
  return { status: req.response.statusCode, json }
}

type Tokens = { access_token: string; refresh_token: string; expires_at?: number }

async function finishLogin(tokens: Tokens): Promise<Session> {
  const user = await send(request('/auth/v1/user', 'GET', undefined, tokens.access_token))
  if (user.status !== 200) throw new Error(`user ${user.status}`)
  const session: Session = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at ?? Date.now() / 1000 + 3000,
    user_id: (user.json as { id: string }).id,
  }
  keep(session)
  return session
}

/** Logs in the same way the app does; returns why it failed, or null. */
async function logIn(identifier: string, password: string): Promise<'wrong' | 'tooMany' | 'failed' | null> {
  try {
    const res = identifier.includes('@')
      ? await send(request('/auth/v1/token?grant_type=password', 'POST', { email: identifier, password }))
      : await send(request('/functions/v1/login', 'POST', { username: identifier, password }))
    if (res.status === 429) return 'tooMany'
    if (res.status === 400 || res.status === 401) return 'wrong'
    if (res.status !== 200) return 'failed'
    await finishLogin(res.json as Tokens)
    return null
  } catch {
    return 'failed'
  }
}

/** A working session, refreshing it when the access token is about to run out. */
async function currentSession(): Promise<Session | null> {
  const session = savedSession()
  if (!session) return null
  if (session.expires_at - 120 > Date.now() / 1000) return session
  const res = await send(request('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token }))
  if (res.status === 400 || res.status === 401) {
    // Logged out elsewhere or the session expired: log in again from the app.
    Keychain.remove(SESSION_KEY)
    return null
  }
  if (res.status !== 200) throw new Error(`refresh ${res.status}`)
  const tokens = res.json as Tokens
  const fresh = { ...session, ...tokens, user_id: session.user_id }
  if (!tokens.expires_at) fresh.expires_at = Date.now() / 1000 + 3000
  keep(fresh)
  return fresh
}

// ---------- Data ----------

interface Person {
  id: string
  color: string | null
  language: Language
  theme: 'dark' | 'light' | 'system'
}

interface Row extends Repeating {
  kind: 'event' | 'task' | 'note'
  title: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  done: boolean
  owner_id: string | null
}

interface Snapshot {
  people: Person[]
  rows: Row[]
  /** The user's background photo, if they set one. */
  hasPhoto: boolean
}

// Same defaults as src/lib/people.ts.
const PERSON_COLORS = ['#5b9cf6', '#f472b6']
const OURS_COLOR = '#a78bfa'

const files = FileManager.local()
const cachePath = (name: string) => files.joinPath(files.cacheDirectory(), `calendario-${name}`)

async function loadData(session: Session, from: string, to: string, withPhoto: boolean): Promise<Snapshot> {
  const token = session.access_token
  const columns =
    'id,kind,title,day,all_day,start_time,end_time,done,owner_id,repeat,repeat_every,repeat_until,skip_days,series_id,series_day'
  // The same three groups the app loads (see useItems in src/lib/items.ts).
  const filter =
    `(and(repeat.is.null,day.gte.${from},day.lte.${to}),` +
    `and(repeat.not.is.null,day.lte.${to},or(repeat_until.is.null,repeat_until.gte.${from})),` +
    `and(series_day.gte.${from},series_day.lte.${to}))`
  const [people, rows] = await Promise.all([
    send(request('/rest/v1/profiles?select=id,color,language,theme&order=created_at', 'GET', undefined, token)),
    send(request(`/rest/v1/items?select=${columns}&or=${encodeURIComponent(filter)}&order=day`, 'GET', undefined, token)),
  ])
  if (people.status !== 200 || rows.status !== 200) throw new Error(`load ${people.status} ${rows.status}`)
  // Lock screen widgets don't show the photo, so they don't fetch it either.
  const hasPhoto = withPhoto ? await loadPhoto(session) : files.fileExists(cachePath('photo.jpg'))
  const data = { people: people.json as Person[], rows: rows.json as Row[], hasPhoto }
  files.writeString(cachePath('data.json'), JSON.stringify(data))
  return data
}

/** Keeps a copy of the background photo, checking for a new one every few hours. */
async function loadPhoto(session: Session): Promise<boolean> {
  const path = cachePath('photo.jpg')
  const saved = files.fileExists(path)
  const age = saved ? Date.now() - (files.modificationDate(path)?.getTime() ?? 0) : Infinity
  if (age < 6 * 3600_000) return true
  try {
    const req = request(`/storage/v1/object/authenticated/backgrounds/${session.user_id}/background.jpg`, 'GET', undefined, session.access_token)
    const image = await req.loadImage()
    if (req.response.statusCode === 200) {
      files.writeImage(path, image)
      return true
    }
    if (saved) files.remove(path)
    return false
  } catch {
    // Offline or no photo: keep whatever we had.
    return saved
  }
}

function cachedData(): Snapshot | null {
  try {
    const path = cachePath('data.json')
    return files.fileExists(path) ? (JSON.parse(files.readString(path)) as Snapshot) : null
  } catch {
    return null
  }
}

/** One thing to show: an occurrence on its day, with its color. */
interface Entry {
  day: Date
  dayKey: string
  kind: Row['kind']
  title: string
  time: string
  start: string
  color: string
}

const KIND_ORDER = { event: 0, task: 1, note: 2 }

/** What's coming up from now on: ended events and ticked-off tasks are left out. */
function entries(data: Snapshot, from: string, to: string, now: Date): Entry[] {
  const colorOf = (owner: string | null) => {
    const i = data.people.findIndex((p) => p.id === owner)
    return i < 0 ? OURS_COLOR : (data.people[i].color ?? PERSON_COLORS[i % 2])
  }
  const nowTime = format(now, 'HH:mm:ss')
  const today = format(now, 'yyyy-MM-dd')
  return expand(data.rows, from, to)
    .filter((o) => !(o.kind === 'task' && o.done))
    .filter((o) => !(o.day === today && !o.all_day && (o.end_time ?? o.start_time ?? '99') < nowTime))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
        a.title.localeCompare(b.title),
    )
    .map((o) => ({
      day: parseISO(o.day),
      dayKey: o.day,
      kind: o.kind,
      title: o.title,
      time: !o.all_day && o.start_time ? o.start_time.slice(0, 5) : '',
      start: o.start_time ?? '',
      color: colorOf(o.owner_id),
    }))
}

// ---------- Drawing ----------

interface Palette {
  bg: Color
  text: Color
  muted: Color
  accent: Color
}

const pair = (dark: string, light: string, mode: Person['theme']) =>
  mode === 'dark' ? new Color(dark) : mode === 'light' ? new Color(light) : Color.dynamic(new Color(light), new Color(dark))

// The app's own colors (src/index.css).
function palette(mode: Person['theme']): Palette {
  return {
    bg: pair('#121214', '#fafafa', mode),
    text: pair('#ececf1', '#18181b', mode),
    muted: pair('#8b8b96', '#6b6b76', mode),
    accent: pair('#8ab4ff', '#2f6fe4', mode),
  }
}

/** The background photo cut to the widget's shape and darkened so text stays readable. */
function photoBackground(family: string): Image | null {
  const path = cachePath('photo.jpg')
  if (!files.fileExists(path)) return null
  const photo = files.readImage(path)
  const ratio = family === 'medium' ? 2.1 : family === 'large' ? 0.94 : 1
  const w = photo.size.width
  const h = photo.size.height
  const cropW = Math.min(w, h * ratio)
  const cropH = cropW / ratio
  const ctx = new DrawContext()
  ctx.size = new Size(cropW, cropH)
  ctx.opaque = true
  ctx.respectScreenScale = false
  ctx.drawImageInRect(photo, new Rect(-(w - cropW) / 2, -(h - cropH) / 2, w, h))
  ctx.setFillColor(new Color('#000000', 0.5))
  ctx.fillRect(new Rect(0, 0, cropW, cropH))
  return ctx.getImage()
}

interface View {
  t: (typeof strings)[Language]
  locale: typeof itLocale
  colors: Palette
  now: Date
}

const dayUrl = (key: string) => `${APP_URL}#/d/${key}`

function dayLabel(v: View, day: Date) {
  if (isSameDay(day, v.now)) return v.t.today
  if (isSameDay(day, addDays(v.now, 1))) return v.t.tomorrow
  return format(day, 'EEEE d', { locale: v.locale })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A colored bar, the time and the title on one line. */
function addEntry(stack: WidgetStack, v: View, e: Entry, size: number) {
  const row = stack.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  row.spacing = 6
  row.url = dayUrl(e.dayKey)
  const bar = row.addStack()
  bar.size = new Size(3, size + 3)
  bar.cornerRadius = 1.5
  bar.backgroundColor = new Color(e.color)
  if (e.time) {
    const time = row.addText(e.time)
    time.font = Font.mediumSystemFont(size - 1)
    time.textColor = v.colors.muted
  }
  const title = row.addText(e.kind === 'task' ? `○ ${e.title}` : e.title)
  title.font = e.kind === 'note' ? Font.lightSystemFont(size) : Font.systemFont(size)
  title.textColor = e.kind === 'note' ? v.colors.muted : v.colors.text
  title.lineLimit = 1
}

function addMuted(stack: WidgetStack | ListWidget, v: View, text: string, size: number) {
  const line = stack.addText(text)
  line.font = Font.systemFont(size)
  line.textColor = v.colors.muted
  line.lineLimit = 1
}

/**
 * Up to `lines` lines of entries, with a small heading whenever the day
 * changes. Today's heading is left out when `skipToday` (the date is shown big).
 */
function addAgenda(stack: WidgetStack, v: View, list: Entry[], lines: number, size: number, skipToday: boolean) {
  const todays = list.filter((e) => isSameDay(e.day, v.now))
  if (todays.length === 0) {
    addMuted(stack, v, list.length ? v.t.nothingToday : v.t.nothing, size)
    lines--
  }
  let lastDay = ''
  for (const e of list) {
    const needsHeading = e.dayKey !== lastDay && !(skipToday && isSameDay(e.day, v.now))
    if (lines < (needsHeading ? 2 : 1)) break
    if (needsHeading) {
      const heading = stack.addText(capitalize(dayLabel(v, e.day)))
      heading.font = Font.semiboldSystemFont(size - 2)
      heading.textColor = v.colors.accent
      lines--
    }
    lastDay = e.dayKey
    addEntry(stack, v, e, size)
    lines--
  }
}

function addBigDate(stack: WidgetStack, v: View, numberSize: number) {
  const weekday = stack.addText(format(v.now, 'EEEE', { locale: v.locale }).toUpperCase())
  weekday.font = Font.semiboldSystemFont(11)
  weekday.textColor = v.colors.accent
  const number = stack.addText(format(v.now, 'd'))
  number.font = Font.boldSystemFont(numberSize)
  number.textColor = v.colors.text
}

function smallWidget(w: ListWidget, v: View, list: Entry[]) {
  const top = w.addStack()
  top.layoutVertically()
  addBigDate(top, v, 30)
  w.addSpacer(4)
  const body = w.addStack()
  body.layoutVertically()
  body.spacing = 3
  addAgenda(body, v, list, 3, 12, true)
  w.addSpacer()
}

function mediumWidget(w: ListWidget, v: View, list: Entry[]) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.topAlignContent()
  const left = row.addStack()
  left.layoutVertically()
  left.size = new Size(72, 0)
  addBigDate(left, v, 36)
  addMuted(left, v, capitalize(format(v.now, 'MMMM', { locale: v.locale })), 12)
  left.addSpacer()
  row.addSpacer(8)
  const right = row.addStack()
  right.layoutVertically()
  right.spacing = 4
  addAgenda(right, v, list, 6, 13, true)
  right.addSpacer()
  row.addSpacer()
}

function largeWidget(w: ListWidget, v: View, list: Entry[]) {
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()
  const number = header.addText(format(v.now, 'd'))
  number.font = Font.boldSystemFont(34)
  number.textColor = v.colors.text
  header.addSpacer(8)
  const names = header.addStack()
  names.layoutVertically()
  const weekday = names.addText(format(v.now, 'EEEE', { locale: v.locale }).toUpperCase())
  weekday.font = Font.semiboldSystemFont(12)
  weekday.textColor = v.colors.accent
  addMuted(names, v, capitalize(format(v.now, 'MMMM yyyy', { locale: v.locale })), 13)
  header.addSpacer()
  w.addSpacer(10)
  const body = w.addStack()
  body.layoutVertically()
  body.spacing = 5
  addAgenda(body, v, list, 14, 14, true)
  w.addSpacer()
}

/** Lock screen: the next thing coming up, in the lock screen's own style. */
function accessoryWidget(w: ListWidget, v: View, list: Entry[], family: string) {
  const next = list[0]
  const todayCount = list.filter((e) => isSameDay(e.day, v.now)).length
  const label = (e: Entry) => [isSameDay(e.day, v.now) ? '' : dayLabel(v, e.day), e.time, e.title].filter(Boolean).join(' ')
  if (family === 'accessoryCircular') {
    const stack = w.addStack()
    stack.layoutVertically()
    stack.centerAlignContent()
    const count = stack.addText(String(todayCount))
    count.font = Font.boldSystemFont(22)
    const today = stack.addText(v.t.today)
    today.font = Font.systemFont(10)
    return
  }
  if (family === 'accessoryInline') {
    w.addText(next ? label(next) : v.t.nothing)
    return
  }
  const heading = w.addText(next && !isSameDay(next.day, v.now) ? capitalize(dayLabel(v, next.day)) : v.t.today)
  heading.font = Font.semiboldSystemFont(13)
  if (!next) {
    w.addText(v.t.nothing).font = Font.systemFont(13)
    return
  }
  for (const e of list.filter((e) => e.dayKey === next.dayKey).slice(0, 2)) {
    const line = w.addText([e.time, e.title].filter(Boolean).join(' '))
    line.font = Font.systemFont(13)
    line.lineLimit = 1
  }
}

function messageWidget(text: string, colors: Palette) {
  const w = new ListWidget()
  w.backgroundColor = colors.bg
  const title = w.addText(strings.it.title)
  title.font = Font.semiboldSystemFont(14)
  title.textColor = colors.accent
  w.addSpacer(6)
  const line = w.addText(text)
  line.font = Font.systemFont(12)
  line.textColor = colors.muted
  w.url = APP_URL
  return w
}

function buildWidget(data: Snapshot, family: string, now: Date, userId: string): ListWidget {
  const me = data.people.find((p) => p.id === userId)
  const language: Language = me?.language === 'en' ? 'en' : 'it'
  const photo = family.startsWith('accessory') || !data.hasPhoto ? null : photoBackground(family)
  // On a darkened photo the light-on-dark colors always read best.
  const colors = palette(photo ? 'dark' : (me?.theme ?? 'dark'))
  const v: View = { t: strings[language], locale: language === 'en' ? enUS : itLocale, colors, now }
  const from = format(now, 'yyyy-MM-dd')
  const to = format(addDays(now, DAYS_AHEAD), 'yyyy-MM-dd')
  const list = entries(data, from, to, now)

  const w = new ListWidget()
  w.url = dayUrl(from)
  // Lock screen widgets take the lock screen's own look.
  if (photo) w.backgroundImage = photo
  else if (!family.startsWith('accessory')) w.backgroundColor = colors.bg
  if (family.startsWith('accessory')) accessoryWidget(w, v, list, family)
  else {
    w.setPadding(14, 14, 14, 14)
    if (family === 'small') smallWidget(w, v, list)
    else if (family === 'medium') mediumWidget(w, v, list)
    else largeWidget(w, v, list)
  }
  // Come back regularly, and right after midnight so "today" moves on.
  const soon = addMinutes(now, REFRESH_MINUTES)
  const midnight = addMinutes(startOfDay(addDays(now, 1)), 1)
  w.refreshAfterDate = soon < midnight ? soon : midnight
  return w
}

// ---------- Running ----------

async function widgetFor(family: string): Promise<ListWidget> {
  const now = new Date()
  const colors = palette('dark')
  let session: Session | null
  try {
    session = await currentSession()
  } catch {
    session = savedSession()
  }
  if (!session) return messageWidget(strings.it.signIn, colors)
  const from = format(now, 'yyyy-MM-dd')
  const to = format(addDays(now, DAYS_AHEAD), 'yyyy-MM-dd')
  let data: Snapshot | null
  try {
    data = await loadData(session, from, to, !family.startsWith('accessory'))
  } catch {
    // Offline: show the last copy rather than an empty widget.
    data = cachedData()
  }
  if (!data) return messageWidget(strings.it.failed, colors)
  return buildWidget(data, family, now, session.user_id)
}

async function askToLogIn(t: (typeof strings)[Language]) {
  for (;;) {
    const form = new Alert()
    form.title = t.loginTitle
    form.message = t.loginMessage
    form.addTextField(t.username)
    form.addSecureTextField(t.password)
    form.addAction(t.login)
    form.addCancelAction(t.cancel)
    if ((await form.present()) === -1) return false
    const problem = await logIn(form.textFieldValue(0).trim(), form.textFieldValue(1))
    if (!problem) return true
    const oops = new Alert()
    oops.message = t[problem]
    oops.addAction('OK')
    await oops.present()
    if (problem === 'tooMany') return false
  }
}

/** In the app: log in, preview the widget sizes, or log out. */
async function runInApp() {
  const t = Device.locale().startsWith('it') ? strings.it : strings.en
  if (!savedSession()) {
    if (!(await askToLogIn(t))) return
    const done = new Alert()
    done.message = t.signedIn
    done.addAction('OK')
    await done.present()
  }
  const menu = new Alert()
  menu.title = t.title
  menu.addAction(`${t.preview}: ${t.small}`)
  menu.addAction(`${t.preview}: ${t.medium}`)
  menu.addAction(`${t.preview}: ${t.large}`)
  menu.addDestructiveAction(t.logout)
  menu.addCancelAction(t.cancel)
  const choice = await menu.present()
  if (choice === 0) await (await widgetFor('small')).presentSmall()
  if (choice === 1) await (await widgetFor('medium')).presentMedium()
  if (choice === 2) await (await widgetFor('large')).presentLarge()
  if (choice === 3) {
    const session = savedSession()
    if (session) await send(request('/auth/v1/logout', 'POST', {}, session.access_token)).catch(() => null)
    Keychain.remove(SESSION_KEY)
    for (const name of ['data.json', 'photo.jpg']) if (files.fileExists(cachePath(name))) files.remove(cachePath(name))
  }
}

async function run() {
  if (config.runsInWidget || config.runsInAccessoryWidget) {
    Script.setWidget(await widgetFor(config.widgetFamily ?? 'medium'))
  } else {
    await runInApp()
  }
  Script.complete()
}

// Built as `var Calendario = {...}`; the loader script on the phone runs the
// downloaded file and then calls Calendario.run().
export { run }
