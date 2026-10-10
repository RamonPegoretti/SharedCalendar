import { addDays, format, isToday } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../i18n'
import { dayHref, monthHref } from '../lib/route'
import { setDone, shortTime, sortItems, useItems, type Item } from '../lib/items'
import type { People } from '../lib/people'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Props {
  day: Date
  people: People
  onOpenItem: (item: Item) => void
  onAdd: () => void
}

export default function DayView({ day, people, onOpenItem, onAdd }: Props) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const { items, reload } = useItems(day, day)

  const sorted = sortItems(items ?? [])
  const events = sorted.filter((i) => i.kind === 'event')
  const tasks = sorted.filter((i) => i.kind === 'task')
  const notes = sorted.filter((i) => i.kind === 'note')

  async function toggle(task: Item) {
    await setDone(task.id, !task.done)
    void reload()
  }

  const when = (i: Item) =>
    i.all_day || !i.start_time
      ? t('item.allDay')
      : i.end_time
        ? `${shortTime(i.start_time)}–${shortTime(i.end_time)}`
        : shortTime(i.start_time)

  return (
    <main className="day">
      <header className="topbar">
        <div className="day-title">
          <a className="back" href={monthHref(day)} aria-label={t('day.back')}>
            ‹ {capitalize(format(day, 'LLLL', { locale }))}
          </a>
          <h1 className={isToday(day) ? 'title today' : 'title'}>{format(day, 'EEEE d MMMM', { locale })}</h1>
        </div>
        <nav className="actions">
          <a className="icon" href={dayHref(addDays(day, -1))} aria-label={t('day.prev')}>
            ‹
          </a>
          <a className="icon" href={dayHref(addDays(day, 1))} aria-label={t('day.next')}>
            ›
          </a>
        </nav>
      </header>

      {items && sorted.length === 0 && (
        <section className="empty">
          <p>{t('day.empty')}</p>
          <p className="muted">{t('day.emptyHint')}</p>
        </section>
      )}

      {events.length > 0 && (
        <section className="group">
          <h2>{t('day.events')}</h2>
          {events.map((ev) => (
            <button key={ev.id} className="entry" onClick={() => onOpenItem(ev)}>
              <span className="bar" style={{ background: people.colorOf(ev.owner_id) }} />
              <span className="when">{when(ev)}</span>
              <span className="what">
                <span className="entry-title">{ev.title}</span>
                {ev.location && <span className="muted small">{ev.location}</span>}
              </span>
            </button>
          ))}
        </section>
      )}

      {tasks.length > 0 && (
        <section className="group">
          <h2>{t('day.tasks')}</h2>
          {tasks.map((task) => (
            <div key={task.id} className={task.done ? 'entry done' : 'entry'}>
              <span className="bar" style={{ background: people.colorOf(task.owner_id) }} />
              <input
                type="checkbox"
                className="tick"
                checked={task.done}
                onChange={() => void toggle(task)}
                aria-label={task.done ? t('day.markUndone') : t('day.markDone')}
              />
              <button className="what" onClick={() => onOpenItem(task)}>
                <span className="entry-title">{task.title}</span>
                <span className="muted small">
                  {task.start_time && `${shortTime(task.start_time)} · `}
                  {task.owner_id ? people.nameOf(task.owner_id) : t('tag.both')}
                </span>
              </button>
            </div>
          ))}
        </section>
      )}

      {notes.length > 0 && (
        <section className="group">
          <h2>{t('day.notes')}</h2>
          {notes.map((note) => (
            <button key={note.id} className="entry" onClick={() => onOpenItem(note)}>
              <span className="bar" style={{ background: people.colorOf(note.owner_id) }} />
              <span className="what">
                <span className="entry-title">{note.title}</span>
                {note.notes && <span className="muted small note-text">{note.notes}</span>}
              </span>
            </button>
          ))}
        </section>
      )}

      <button className="fab" onClick={onAdd} aria-label={t('item.add')}>
        +
      </button>
    </main>
  )
}
