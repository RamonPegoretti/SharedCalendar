// Shared by the app and the push function on the server, so reminders land
// on exactly the days the calendar shows.
import { addDays, addMonths, addYears, differenceInCalendarDays, format, parseISO } from 'date-fns'

/** The columns of an item that say when it happens and how it repeats. */
export interface Repeating {
  id: string
  /** yyyy-MM-dd; for a series, the first occurrence. */
  day: string
  repeat: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  repeat_every: number
  repeat_until: string | null
  skip_days: string[]
  series_id: string | null
  series_day: string | null
}

/** One item as it shows up on one day. */
export type Occurrence<T extends Repeating> = T & {
  /** Unique per shown entry (a series shows up many times with the same id). */
  key: string
  /** The repeating item this belongs to, if any. */
  series?: T
  /** Which occurrence of the series this is (yyyy-MM-dd). */
  seriesDay?: string
  /** True when worked out from the series rule, with no row of its own yet. */
  virtual: boolean
}

const toKey = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Days a series occurs on between `from` and `to` (inclusive, yyyy-MM-dd),
 * ignoring single deleted or changed occurrences. Monthly and yearly dates are
 * counted from the first one, so "every month on the 31st" lands on the last
 * day of shorter months and comes back to the 31st after.
 */
export function occurrenceDays(series: Repeating, from: string, to: string): string[] {
  if (!series.repeat) return series.day >= from && series.day <= to ? [series.day] : []
  const start = parseISO(series.day)
  const last = series.repeat_until && series.repeat_until < to ? series.repeat_until : to
  const every = Math.max(1, series.repeat_every)
  const step =
    series.repeat === 'daily'
      ? (n: number) => addDays(start, n * every)
      : series.repeat === 'weekly'
        ? (n: number) => addDays(start, n * every * 7)
        : series.repeat === 'monthly'
          ? (n: number) => addMonths(start, n * every)
          : (n: number) => addYears(start, n * every)

  // Jump straight to the visible days instead of walking from the first one.
  let n = 0
  if (from > series.day && (series.repeat === 'daily' || series.repeat === 'weekly')) {
    const days = every * (series.repeat === 'weekly' ? 7 : 1)
    n = Math.floor(differenceInCalendarDays(parseISO(from), start) / days)
  }

  const out: string[] = []
  for (; ; n++) {
    const day = toKey(step(n))
    if (day > last) break
    if (day >= from) out.push(day)
  }
  return out
}

/**
 * Turns rows from the database into what's on screen from `from` to `to`:
 * one-off items as they are, and each series spelled out per day, minus
 * deleted occurrences and with changed occurrences in their place.
 */
export function expand<T extends Repeating>(rows: T[], from: string, to: string): Occurrence<T>[] {
  const seriesById = new Map(rows.filter((r) => r.repeat).map((r) => [r.id, r]))
  const replaced = new Set(rows.filter((r) => r.series_id).map((r) => `${r.series_id}@${r.series_day}`))
  const out: Occurrence<T>[] = []

  for (const row of rows) {
    if (row.repeat) {
      const skipped = new Set(row.skip_days)
      for (const day of occurrenceDays(row, from, to)) {
        if (skipped.has(day) || replaced.has(`${row.id}@${day}`)) continue
        out.push({ ...row, day, key: `${row.id}@${day}`, series: row, seriesDay: day, virtual: true })
      }
    } else if (row.day >= from && row.day <= to) {
      const series = row.series_id ? seriesById.get(row.series_id) : undefined
      out.push({
        ...row,
        key: row.id,
        series,
        seriesDay: series ? row.series_day! : undefined,
        virtual: false,
      })
    }
  }
  return out
}
