import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  deleteItem,
  deleteOccurrence,
  overrideOf,
  saveItem,
  shortTime,
  MAX_LOCATION,
  MAX_NOTES,
  MAX_TITLE,
  REMINDERS_TIMED,
  REMINDERS_UNTIMED,
  type ItemKind,
  type Repeat,
} from '../lib/items'
import type { Occurrence } from '../lib/recurrence'
import type { People } from '../lib/people'
import { notificationsAllowed } from '../lib/push'

interface Props {
  /** The item being edited (as it shows on its day), or undefined to add a new one. */
  item?: Occurrence
  /** yyyy-MM-dd prefilled for a new item. */
  day: string
  people: People
  onClose: () => void
  /** Called after a save or delete so the list can refresh right away. */
  onSaved: () => void
}

const kinds: ItemKind[] = ['event', 'task', 'note']
const repeats: Repeat[] = ['daily', 'weekly', 'monthly', 'yearly']

/** Moves a yyyy-MM-dd date by a number of days. */
const shiftDay = (day: string, days: number) => format(addDays(parseISO(day), days), 'yyyy-MM-dd')

/** Add or edit an event, task or note. */
export default function ItemSheet({ item, day, people, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'event')
  const [title, setTitle] = useState(item?.title ?? '')
  const [date, setDate] = useState(item?.day ?? day)
  const [allDay, setAllDay] = useState(item?.all_day ?? false)
  const [start, setStart] = useState(shortTime(item?.start_time ?? null))
  const [end, setEnd] = useState(shortTime(item?.end_time ?? null))
  const [location, setLocation] = useState(item?.location ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [owner, setOwner] = useState<string | null>(item ? item.owner_id : (people.me?.id ?? null))
  const [reminders, setReminders] = useState<number[]>(item?.reminders ?? [])
  // A repeating item asks whether a change is for this day only or for the whole series.
  const series = item?.series
  const [scope, setScope] = useState<'one' | 'all'>('one')

  // "All repeats" shows the series as a whole, without this day's own changes;
  // "only this one" shows this day as it is.
  function changeScope(next: 'one' | 'all') {
    const from = next === 'all' ? series! : item!
    setScope(next)
    setTitle(from.title)
    setDate(next === 'all' ? item!.seriesDay! : item!.day)
    setAllDay(from.all_day)
    setStart(shortTime(from.start_time))
    setEnd(shortTime(from.end_time))
    setLocation(from.location)
    setNotes(from.notes)
    setOwner(from.owner_id)
    setReminders(from.reminders)
  }
  const rule = series ?? item
  const [repeat, setRepeat] = useState<Repeat | ''>(rule?.repeat ?? '')
  const [every, setEvery] = useState(String(rule?.repeat_every ?? 1))
  const [until, setUntil] = useState(rule?.repeat_until ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const timed = kind === 'event' ? !allDay : kind === 'task'
  // Without a start time a reminder goes off at 9:00, so only whole days make sense.
  const reminderChoices = timed && start ? REMINDERS_TIMED : REMINDERS_UNTIMED
  const toggleReminder = (m: number) =>
    setReminders((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)))

  // Only a whole series (or a one-off item) can change how it repeats.
  const canRepeat = series ? scope === 'all' : !item?.series_id

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError(t('item.titleRequired'))
    if (kind === 'event' && !allDay && !start) return setError(t('item.startRequired'))
    if (timed && end && (!start || end < start)) return setError(t('item.endBeforeStart'))

    // Moving one occurrence of a series moves the whole series by as many days.
    const firstDay =
      series && scope === 'all' ? shiftDay(series.day, differenceInCalendarDays(parseISO(date), parseISO(item!.seriesDay!))) : date
    const everyN = Math.min(99, Math.max(1, Math.round(Number(every)) || 1))
    if (canRepeat && repeat && until && until < firstDay) return setError(t('item.untilBeforeStart'))

    setBusy(true)
    setError('')
    const fields = {
      kind,
      title: title.trim(),
      day: date,
      all_day: kind === 'event' ? allDay : !start,
      start_time: timed && start ? start : null,
      end_time: kind === 'event' && timed && end ? end : null,
      location: kind === 'event' ? location.trim() : '',
      notes: notes.trim(),
      done: kind === 'task' ? (item?.done ?? false) : false,
      owner_id: owner,
      reminders: reminders.filter((m) => reminderChoices.includes(m)),
    }
    const rules = repeat
      ? { repeat, repeat_every: everyN, repeat_until: until || null, done: false }
      : { repeat: null, repeat_every: 1, repeat_until: null }

    let failed
    if (!series) {
      failed = await saveItem(canRepeat ? { ...fields, ...rules } : fields, item?.id)
    } else if (scope === 'one') {
      failed = item!.virtual
        ? await saveItem({ ...overrideOf(item!), ...fields })
        : await saveItem(fields, item!.id)
    } else {
      // Days changed one by one keep their own changes.
      failed = await saveItem({ ...fields, done: false, day: firstDay, ...rules }, series.id)
    }
    setBusy(false)
    if (failed) return setError(t('item.saveError'))
    onSaved()
    onClose()
  }

  async function remove() {
    if (!item) return
    const question = !series ? 'item.confirmDelete' : scope === 'one' ? 'item.confirmDeleteOne' : 'item.confirmDeleteAll'
    if (!confirm(t(question))) return
    setBusy(true)
    const failed = !series
      ? await deleteItem(item.id)
      : scope === 'one'
        ? await deleteOccurrence(item)
        : await deleteItem(series.id)
    setBusy(false)
    if (failed) return setError(t('item.saveError'))
    onSaved()
    onClose()
  }

  // For tasks the tag doubles as "assigned to".
  const owners: { id: string | null; label: string }[] = [
    { id: people.me?.id ?? '', label: t(kind === 'task' ? 'tag.me' : 'tag.mine') },
    { id: people.partner?.id ?? '', label: people.partner?.display_name ?? t('tag.partner') },
    { id: null, label: t(kind === 'task' ? 'tag.both' : 'tag.ours') },
  ]

  const creator = item && people.nameOf(item.created_by)
  const editor = item && people.nameOf(item.updated_by)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet item-sheet"
        role="dialog"
        aria-label={item ? t('item.edit') : t('item.add')}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="sheet-header">
          <h2>{item ? t(`kind.${item.kind}`) : t('item.add')}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label={t('settings.close')}>
            ✕
          </button>
        </header>

        {series && (
          <div className="segmented wide" role="group" aria-label={t('item.scope')}>
            <button type="button" aria-pressed={scope === 'one'} onClick={() => changeScope('one')}>
              {t('item.scopeOne')}
            </button>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => changeScope('all')}>
              {t('item.scopeAll')}
            </button>
          </div>
        )}

        {!item && (
          <div className="segmented wide" role="group" aria-label={t('item.kind')}>
            {kinds.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
        )}

        <label className="field">
          {kind === 'note' ? t('item.noteTitle') : t('item.title')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} autoFocus={!item} required />
        </label>

        <div className="row">
          <label className="field grow">
            {kind === 'task' ? t('item.due') : t('item.date')}
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
          </label>
          {kind === 'event' && (
            <label className="check">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              {t('item.allDay')}
            </label>
          )}
        </div>

        {timed && (
          <div className="row">
            <label className="field grow">
              {kind === 'task' ? t('item.dueTime') : t('item.start')}
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            {kind === 'event' && (
              <label className="field grow">
                {t('item.end')}
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            )}
          </div>
        )}

        {canRepeat && (
          <div className="row">
            <label className="field grow">
              {t('item.repeat')}
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat | '')}>
                <option value="">{t('repeat.never')}</option>
                {repeats.map((r) => (
                  <option key={r} value={r}>
                    {t(`repeat.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            {repeat && (
              <label className="field every">
                {t('item.every')}
                <span className="every-input">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={every}
                    onChange={(e) => setEvery(e.target.value)}
                  />
                  <span>{t(`repeatUnit.${repeat}`, { count: Number(every) || 1 })}</span>
                </span>
              </label>
            )}
          </div>
        )}

        {canRepeat && repeat && (
          <label className="field">
            {t('item.until')}
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            <span className="small">{t('item.untilHint')}</span>
          </label>
        )}

        <div className="field">
          {t('item.reminders')}
          <div className="chips" role="group" aria-label={t('item.reminders')}>
            {reminderChoices.map((m) => (
              <button
                key={m}
                type="button"
                className="pill"
                aria-pressed={reminders.includes(m)}
                onClick={() => toggleReminder(m)}
              >
                {t(`reminder.${reminderChoices === REMINDERS_TIMED ? 'timed' : 'untimed'}${m}`)}
              </button>
            ))}
          </div>
          {reminders.length > 0 && !notificationsAllowed() && (
            <span className="small">{t('item.remindersOff')}</span>
          )}
        </div>

        {kind === 'event' && (
          <label className="field">
            {t('item.location')}
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={MAX_LOCATION} />
          </label>
        )}

        <div className="field">
          {kind === 'task' ? t('item.assignee') : t('item.tag')}
          <div className="segmented wide" role="group">
            {owners.map((o) => (
              <button
                key={o.id ?? 'ours'}
                type="button"
                aria-pressed={owner === o.id}
                onClick={() => setOwner(o.id || null)}
              >
                <span className="dot" style={{ background: people.colorOf(o.id || null) }} />
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          {kind === 'note' ? t('item.noteText') : t('item.notes')}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES} rows={3} />
        </label>

        {error && <p className="message error">{error}</p>}

        <button className="primary" disabled={busy}>
          {t('item.save')}
        </button>

        {item && (
          <footer className="sheet-footer">
            <span className="muted">
              {creator && t('item.addedBy', { name: creator })}
              {editor && editor !== creator && ` · ${t('item.editedBy', { name: editor })}`}
            </span>
            <button type="button" className="danger" onClick={remove} disabled={busy}>
              {t('item.delete')}
            </button>
          </footer>
        )}
      </form>
    </div>
  )
}
