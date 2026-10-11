import { useEffect, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, type Language, type Theme } from '../lib/supabase'
import { applyTheme, savedTheme } from '../lib/theme'
import { PERSON_COLORS } from '../lib/people'
import type { Background } from '../lib/background'
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push'
import LanguageToggle from './LanguageToggle'

interface Props {
  userId: string
  name: string
  color: string | undefined
  onColorChange: (color: string) => void
  partnerName: string | undefined
  notifyPartner: boolean
  onNotifyPartnerChange: (on: boolean) => void
  background: Background
  onClose: () => void
}

export default function SettingsSheet({
  userId,
  name,
  color,
  onColorChange,
  partnerName,
  notifyPartner,
  onNotifyPartnerChange,
  background,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [photoState, setPhotoState] = useState<'idle' | 'busy' | 'error'>('idle')

  async function changePhoto(task: () => Promise<void>) {
    setPhotoState('busy')
    try {
      await task()
      setPhotoState('idle')
    } catch {
      setPhotoState('error')
    }
  }

  function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void changePhoto(() => background.choose(file))
  }

  // Saved on the account too, so the choice follows the person to other devices.
  const save = (fields: { language?: Language; theme?: Theme; notify_partner?: boolean }) =>
    supabase.from('profiles').update(fields).eq('id', userId).then(() => undefined)

  function chooseTheme(next: Theme) {
    setTheme(next)
    applyTheme(next)
    void save({ theme: next })
  }

  const themes: Theme[] = ['dark', 'light', 'system']

  const [push, setPush] = useState<PushState | undefined>(undefined)
  const [pushNote, setPushNote] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => {
    void pushState().then(setPush)
  }, [])

  async function togglePush() {
    setPushBusy(true)
    setPushNote('')
    try {
      if (push === 'on') {
        await disablePush()
        setPush('off')
      } else {
        setPush(await enablePush())
      }
    } catch {
      setPushNote(t('notify.error'))
    }
    setPushBusy(false)
  }

  async function test() {
    setPushNote('')
    setPushNote((await sendTestPush()) ? t('notify.testSent') : t('notify.error'))
  }

  function chooseNotifyPartner(on: boolean) {
    onNotifyPartnerChange(on)
    void save({ notify_partner: on })
  }

  async function logout() {
    // This phone shouldn't keep getting notifications for an account that left it.
    await disablePush().catch(() => undefined)
    await supabase.auth.signOut()
  }

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

        <div className="setting">
          <span>{t('settings.myColor')}</span>
          <div className="swatches" role="group" aria-label={t('settings.myColor')}>
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                style={{ background: c }}
                aria-pressed={color === c}
                aria-label={c}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </div>

        <div className="setting">
          <span>
            {t('settings.background')}
            {photoState === 'error' && <span className="message error">{t('settings.backgroundError')}</span>}
          </span>
          <div className="photo-actions">
            {photoState === 'busy' ? (
              <span className="muted">{t('settings.backgroundSaving')}</span>
            ) : (
              <>
                {background.url && (
                  <button type="button" className="link danger-link" onClick={() => void changePhoto(background.remove)}>
                    {t('settings.backgroundRemove')}
                  </button>
                )}
                <label className="pill photo-pick">
                  {background.url ? t('settings.backgroundChange') : t('settings.backgroundChoose')}
                  <input type="file" accept="image/*" onChange={pickPhoto} />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="setting stacked">
          <div className="setting-line">
            <span>{t('notify.title')}</span>
            {(push === 'on' || push === 'off') && (
              <button type="button" className="pill" aria-pressed={push === 'on'} disabled={pushBusy} onClick={togglePush}>
                {push === 'on' ? t('notify.on') : t('notify.turnOn')}
              </button>
            )}
          </div>
          {push && push !== 'on' && push !== 'off' && <p className="small muted">{t(`notify.${push}`)}</p>}
          {push === 'off' && <p className="small muted">{t('notify.why')}</p>}
          {push === 'on' && (
            <>
              <label className="setting-line">
                <span>{t('notify.partner', { name: partnerName ?? t('tag.partner') })}</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={notifyPartner}
                  onChange={(e) => chooseNotifyPartner(e.target.checked)}
                />
              </label>
              <button type="button" className="link" onClick={test}>
                {t('notify.test')}
              </button>
            </>
          )}
          {pushNote && <p className="small muted">{pushNote}</p>}
        </div>

        <footer className="sheet-footer">
          <span className="muted">{t('settings.signedInAs', { name })}</span>
          <button className="danger" onClick={() => void logout()}>
            {t('settings.logout')}
          </button>
        </footer>
        <a className="privacy-link small muted" href={`${import.meta.env.BASE_URL}privacy.html`}>
          {t('privacy')}
        </a>
      </section>
    </div>
  )
}
