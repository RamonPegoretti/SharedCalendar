import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../i18n'
import { dayHref, monthHref } from '../lib/route'
import { dayKey, sortItems, useItems } from '../lib/items'
import { useSwipe } from '../lib/useSwipe'
import type { People } from '../lib/people'

interface Props {
  month: Date
  people: People
  onOpenSettings: () => void
  onAdd: () => void
}

const MAX_DOTS = 4

export default function MonthView({ month, people, onOpenSettings, onAdd }: Props) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  // Swipe left for the next month, right for the previous one.
  useSwipe(
    () => (location.hash = monthHref(addMonths(month, 1))),
    () => (location.hash = monthHref(addMonths(month, -1))),
  )

  const first = startOfWeek(startOfMonth(month), { locale })
  const last = endOfWeek(endOfMonth(month), { locale })
  const days = eachDayOfInterval({ start: first, end: last })
  const { items } = useItems(first, last)
  const byDay = new Map<string, NonNullable<typeof items>>()
  for (const item of sortItems(items ?? [])) {
    byDay.set(item.day, [...(byDay.get(item.day) ?? []), item])
  }
  const weekdays = Array.from({ length: 7 }, (_, i) => format(addDays(first, i), 'EEEEEE', { locale }))

  return (
    <main className="month">
      <header className="topbar">
        <h1 className="title month-title">{format(month, 'LLLL yyyy', { locale })}</h1>
        <nav className="actions">
          <a className="icon" href={monthHref(addMonths(month, -1))} aria-label={t('month.prev')}>
            ‹
          </a>
          <a className="pill" href="#/">
            {t('month.today')}
          </a>
          <a className="icon" href={monthHref(addMonths(month, 1))} aria-label={t('month.next')}>
            ›
          </a>
          <button className="icon" onClick={onOpenSettings} aria-label={t('settings.title')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.6 4.6-.1-2.2 2-1.6-2-3.4-2.4.9a8 8 0 0 0-1.9-1.1L15.8 3h-4l-.4 2.5a8 8 0 0 0-1.9 1.1L7.1 5.7l-2 3.4 2 1.6a8 8 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-.9c.6.5 1.2.8 1.9 1.1l.4 2.5h4l.4-2.5c.7-.3 1.3-.6 1.9-1.1l2.4.9 2-3.4-2-1.6Z"
              />
            </svg>
          </button>
        </nav>
      </header>

      <div className="weekdays" aria-hidden="true">
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid">
        {days.map((day) => {
          const dayItems = byDay.get(dayKey(day)) ?? []
          return (
          <a
            key={day.toISOString()}
            href={dayHref(day)}
            className={['cell', !isSameMonth(day, month) && 'outside', isToday(day) && 'today'].filter(Boolean).join(' ')}
            aria-label={[format(day, 'PPPP', { locale }), dayItems.length > 0 && t('month.itemCount', { count: dayItems.length })]
              .filter(Boolean)
              .join(', ')}
          >
            <span className="num">{format(day, 'd')}</span>
            {dayItems.length > 0 && (
              <span className="dots">
                {dayItems.slice(0, MAX_DOTS).map((item) => (
                  <span
                    key={item.key}
                    className={item.done ? 'dot faded' : 'dot'}
                    style={{ background: people.colorOfItem(item) }}
                  />
                ))}
                {dayItems.length > MAX_DOTS && <span className="more">+</span>}
              </span>
            )}
          </a>
          )
        })}
      </div>

      <button className="fab" onClick={onAdd} aria-label={t('item.add')}>
        +
      </button>
    </main>
  )
}
