import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, type Language, type Theme } from '../lib/supabase'
import { applyTheme, savedTheme } from '../lib/theme'
import LanguageToggle from './LanguageToggle'

interface Props {
  userId: string
  name: string
  onClose: () => void
}

export default function SettingsSheet({ userId, name, onClose }: Props) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(savedTheme)

  // Saved on the account too, so the choice follows the person to other devices.
  const save = (fields: { language?: Language; theme?: Theme }) =>
    supabase.from('profiles').update(fields).eq('id', userId).then(() => undefined)

  function chooseTheme(next: Theme) {
    setTheme(next)
    applyTheme(next)
    void save({ theme: next })
  }

  const themes: Theme[] = ['dark', 'light', 'system']

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label={t('settings.title')} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2>{t('settings.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            ✕
          </button>
        </header>

        <div className="setting">
          <span>{t('settings.language')}</span>
          <LanguageToggle onChange={(language) => void save({ language })} />
        </div>

        <div className="setting">
          <span>{t('settings.theme')}</span>
          <div className="segmented" role="group" aria-label={t('settings.theme')}>
            {themes.map((option) => (
              <button key={option} type="button" aria-pressed={theme === option} onClick={() => chooseTheme(option)}>
                {t(`settings.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <footer className="sheet-footer">
          <span className="muted">{t('settings.signedInAs', { name })}</span>
          <button className="danger" onClick={() => void supabase.auth.signOut()}>
            {t('settings.logout')}
          </button>
        </footer>
      </section>
    </div>
  )
}
