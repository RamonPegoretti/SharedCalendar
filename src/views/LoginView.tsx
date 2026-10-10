import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import LanguageToggle from '../components/LanguageToggle'

const USERNAME_RE = /^[a-z0-9_.-]{2,32}$/

// After this many wrong passwords in a row the form pauses for a while.
// The server has its own, stricter limits; this just avoids hammering it.
const MAX_FAILURES = 5
const COOLDOWN_MS = 30_000

/** The server said this device is sending too many requests. */
class TooManyRequests extends Error {}

/** Turns "Ramon" or "ramon@example.com" into the email Supabase logs in with. */
async function emailFor(identifier: string): Promise<string | null> {
  const value = identifier.trim()
  if (value.includes('@')) return value
  const { data, status } = await supabase.rpc('email_for_username', { p_username: value })
  if (status === 429) throw new TooManyRequests()
  return (data as string | null) ?? null
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
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
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
    const resolved = await emailFor(identifier)
    if (!resolved) return wrongCredentials()
    const { error } = await supabase.auth.signInWithPassword({ email: resolved, password })
    if (error?.status === 429) throw new TooManyRequests()
    if (error) return wrongCredentials()
    setFailures(0)
  }

  async function signUp() {
    const name = username.trim().toLowerCase()
    if (!USERNAME_RE.test(name)) return setMessage({ kind: 'error', text: t('auth.usernameRule') })
    if (await emailFor(name)) return setMessage({ kind: 'error', text: t('auth.usernameTaken') })

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: name, display_name: displayName.trim() || name },
        emailRedirectTo: location.origin + location.pathname,
      },
    })
    if (error?.status === 429) throw new TooManyRequests()
    if (error) {
      // The database refuses a third account with a generic "database error".
      const full = /database error/i.test(error.message)
      return setMessage({ kind: 'error', text: full ? t('auth.full') : error.message })
    }
    if (!data.session) setMessage({ kind: 'info', text: t('auth.checkEmail') })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await (mode === 'login' ? logIn() : signUp())
    } catch (err) {
      setMessage({ kind: 'error', text: t(err instanceof TooManyRequests ? 'auth.tooManyAttempts' : 'auth.genericError') })
    } finally {
      setBusy(false)
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'signup' : 'login')
    setMessage(null)
  }

  return (
    <main className="login">
      <div className="login-top">
        <LanguageToggle />
      </div>
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">{t('appName')}</h1>

        {mode === 'login' ? (
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
        ) : (
          <>
            <label className="field">
              <span>{t('auth.displayName')}</span>
              <input autoComplete="given-name" maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('auth.username')}</span>
              <input
                autoComplete="username"
                autoCapitalize="none"
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t('auth.email')}</span>
              <input type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </>
        )}

        <label className="field">
          <span>{t('auth.password')}</span>
          <div className="password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          {mode === 'login' ? t('auth.login') : t('auth.signup')}
        </button>

        <p className="switch">
          {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <button type="button" className="link" onClick={switchMode}>
            {mode === 'login' ? t('auth.signup') : t('auth.login')}
          </button>
        </p>
      </form>
    </main>
  )
}
