import { addDays, format, isToday } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../i18n'
import { dayHref, monthHref } from '../lib/route'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function DayView({ day }: { day: Date }) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)

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

      <section className="empty">
        <p>{t('day.empty')}</p>
        <p className="muted">{t('day.emptyHint')}</p>
      </section>
    </main>
  )
}
