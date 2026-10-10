import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteItem,
  saveItem,
  shortTime,
  MAX_LOCATION,
  MAX_NOTES,
  MAX_TITLE,
  type Item,
  type ItemKind,
} from '../lib/items'
import type { People } from '../lib/people'

interface Props {
  /** The item being edited, or undefined to add a new one. */
  item?: Item
  /** yyyy-MM-dd prefilled for a new item. */
  day: string
  people: People
  onClose: () => void
  /** Called after a save or delete so the list can refresh right away. */
  onSaved: () => void
}

const kinds: ItemKind[] = ['event', 'task', 'note']

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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const timed = kind === 'event' ? !allDay : kind === 'task'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError(t('item.titleRequired'))
    if (kind === 'event' && !allDay && !start) return setError(t('item.startRequired'))
    if (timed && end && (!start || end < start)) return setError(t('item.endBeforeStart'))

    setBusy(true)
    setError('')
    const failed = await saveItem(
      {
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
      },
      item?.id,
    )
    setBusy(false)
    if (failed) return setError(t('item.saveError'))
    onSaved()
    onClose()
  }

  async function remove() {
    if (!item || !confirm(t('item.confirmDelete'))) return
    setBusy(true)
    const failed = await deleteItem(item.id)
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
