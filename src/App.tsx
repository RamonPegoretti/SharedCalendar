import { useEffect, useState } from 'react'
import { setLanguage } from './i18n'
import { applyTheme } from './lib/theme'
import { useRoute } from './lib/route'
import { useProfile, useSession } from './lib/useSession'
import LoginView from './views/LoginView'
import MonthView from './views/MonthView'
import DayView from './views/DayView'
import SettingsSheet from './components/SettingsSheet'

export default function App() {
  const session = useSession()
  const profile = useProfile(session?.user.id)
  const route = useRoute()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Once signed in, the language and theme saved on the account win, so they
  // follow the person from phone to computer.
  useEffect(() => {
    if (!profile) return
    setLanguage(profile.language)
    applyTheme(profile.theme)
  }, [profile])

  if (session === undefined) return null
  if (!session) return <LoginView />

  const openSettings = () => setSettingsOpen(true)

  return (
    <>
      {route.view === 'day' ? (
        <DayView day={route.day} />
      ) : (
        <MonthView month={route.month} onOpenSettings={openSettings} />
      )}
      {settingsOpen && (
        <SettingsSheet
          userId={session.user.id}
          name={profile?.display_name ?? session.user.email ?? ''}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  )
}
