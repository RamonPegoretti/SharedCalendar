import { useEffect, useState } from 'react'
import { format, isValid, parse } from 'date-fns'

// Hash-based routes work on GitHub Pages without any server setup:
//   #/                month view of the current month
//   #/m/2026-10       month view
//   #/d/2026-10-10    day view
export type Route = { view: 'month'; month: Date } | { view: 'day'; day: Date }

function parseHash(hash: string): Route {
  const [, kind, value] = hash.replace(/^#/, '').split('/')
  if (kind === 'd') {
    const day = parse(value ?? '', 'yyyy-MM-dd', new Date())
    if (isValid(day)) return { view: 'day', day }
  }
  if (kind === 'm') {
    const month = parse(value ?? '', 'yyyy-MM', new Date())
    if (isValid(month)) return { view: 'month', month }
  }
  return { view: 'month', month: new Date() }
}

export const monthHref = (d: Date) => `#/m/${format(d, 'yyyy-MM')}`
export const dayHref = (d: Date) => `#/d/${format(d, 'yyyy-MM-dd')}`

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
