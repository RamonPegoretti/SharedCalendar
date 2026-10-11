import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import LanguageToggle from '../components/LanguageToggle'

// After this many wrong passwords in a row the form pauses for a while.
// The server has its own, stricter limits; this just avoids hammering it.
const MAX_FAILURES = 5
const COOLDOWN_MS = 30_000

/** The server said this device is sending too many requests. */
class TooManyRequests extends Error {}

/**
 * Logs in with a username through the `login` server function, which looks
 * the email up itself so the browser never sees it. Returns false for a
 * wrong username or password.
 */
async function logInWithUsername(username: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('login', { body: { username, password } })
  if (error) {
    const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0
    if (status === 429) throw new TooManyRequests()
    if (status === 401) return false
    throw error
  }
  const { error: sessionError } = await supabase.auth.setSession(data)
  if (sessionError) throw sessionError
  return true
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  )
}

export default function LoginView() {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [failures, setFailures] = useState(0)
  const [paused, setPaused] = useState(false)

  function wrongCredentials() {
    const next = failures + 1
    if (next >= MAX_FAILURES) {
      setFailures(0)
      setPaused(true)
      setTimeout(() => setPaused(false), COOLDOWN_MS)
      return setMessage({ kind: 'error', text: t('auth.tooManyAttempts') })
    }
    setFailures(next)
    setMessage({ kind: 'error', text: t('auth.wrongCredentials') })
  }

  async function logIn() {
    const value = identifier.trim()
    if (value.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: value, password })
      if (error?.status === 429) throw new TooManyRequests()
      if (error) return wrongCredentials()
    } else if (!(await logInWithUsername(value, password))) {
      return wrongCredentials()
    }
    setFailures(0)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await logIn()
    } catch (err) {
      setMessage({ kind: 'error', text: t(err instanceof TooManyRequests ? 'auth.tooManyAttempts' : 'auth.genericError') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-top">
        <LanguageToggle />
      </div>
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">{t('appName')}</h1>

        <label className="field">
          <span>{t('auth.identifier')}</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            maxLength={254}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>{t('auth.password')}</span>
          <div className="password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={6}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="reveal"
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showPassword}
              // Keep focus (and the phone keyboard) on the field while toggling.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword(!showPassword)}
            >
              <EyeIcon crossed={showPassword} />
            </button>
          </div>
        </label>

        {message && <p className={`message ${message.kind}`}>{message.text}</p>}

        <button className="primary" type="submit" disabled={busy || paused}>
          {t('auth.login')}
        </button>

      </form>
      <a className="privacy-link small muted" href={`${import.meta.env.BASE_URL}privacy.html`}>
        {t('privacy')}
      </a>
    </main>
  )
}
