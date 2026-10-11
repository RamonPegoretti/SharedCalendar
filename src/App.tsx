import { useEffect, useState } from 'react'
import { setLanguage } from './i18n'
import { applyTheme } from './lib/theme'
import { useRoute } from './lib/route'
import { useProfile, useSession } from './lib/useSession'
import { usePeople } from './lib/people'
import { dayKey } from './lib/items'
import type { Occurrence } from './lib/recurrence'
import LoginView from './views/LoginView'
import MonthView from './views/MonthView'
import DayView from './views/DayView'
import SettingsSheet from './components/SettingsSheet'
import ItemSheet from './components/ItemSheet'

export default function App() {
  const session = useSession()
  if (session === undefined) return null
  if (!session) return <LoginView />
  return <SignedIn userId={session.user.id} email={session.user.email ?? ''} />
}

/** The open sheet: settings, a new item for a day, or an existing item. */
type Sheet = { kind: 'settings' } | { kind: 'new'; day: string } | { kind: 'item'; item: Occurrence }

function SignedIn({ userId, email }: { userId: string; email: string }) {
  const profile = useProfile(userId)
  const { people, setMyColor } = usePeople(userId)
  const route = useRoute()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Bumped after a save so the open view reloads without waiting for the live update.
  const [version, setVersion] = useState(0)

  // Once signed in, the language and theme saved on the account win, so they
  // follow the person from phone to computer.
  useEffect(() => {
    if (!profile) return
    setLanguage(profile.language)
    applyTheme(profile.theme)
  }, [profile])

  const close = () => setSheet(null)
  const saved = () => setVersion((v) => v + 1)

  return (
    <>
      {route.view === 'day' ? (
        <DayView
          key={`${dayKey(route.day)}-${version}`}
          day={route.day}
          people={people}
          onOpenItem={(item) => setSheet({ kind: 'item', item })}
          onAdd={() => setSheet({ kind: 'new', day: dayKey(route.day) })}
        />
      ) : (
        <MonthView
          key={version}
          month={route.month}
          people={people}
          onOpenSettings={() => setSheet({ kind: 'settings' })}
          onAdd={() => setSheet({ kind: 'new', day: dayKey(new Date()) })}
        />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet
          userId={userId}
          name={profile?.display_name ?? email}
          color={people.me?.color}
          onColorChange={(c) => void setMyColor(c)}
          onClose={close}
        />
      )}
      {sheet && sheet.kind !== 'settings' && (
        <ItemSheet
          item={sheet.kind === 'item' ? sheet.item : undefined}
          day={sheet.kind === 'new' ? sheet.day : sheet.item.day}
          people={people}
          onClose={close}
          onSaved={saved}
        />
      )}
    </>
  )
}
