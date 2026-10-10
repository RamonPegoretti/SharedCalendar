import type { Theme } from './supabase'

const media = window.matchMedia('(prefers-color-scheme: light)')

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'system' ? t : 'dark'
  } catch {
    return 'dark'
  }
}

function paint(theme: Theme) {
  const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
  document.documentElement.dataset.theme = resolved
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // storage unavailable: the choice still applies for this visit
  }
  paint(theme)
}

media.addEventListener('change', () => {
  if (savedTheme() === 'system') paint('system')
})
