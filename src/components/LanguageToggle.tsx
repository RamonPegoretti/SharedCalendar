import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'
import type { Language } from '../lib/supabase'

/** Two-option IT / EN switch. `onChange` lets callers also save the choice. */
export default function LanguageToggle({ onChange }: { onChange?: (lang: Language) => void }) {
  const { i18n } = useTranslation()
  const options: Language[] = ['it', 'en']
  return (
    <div className="segmented" role="group" aria-label="Lingua / Language">
      {options.map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={i18n.language === lang}
          onClick={() => {
            setLanguage(lang)
            onChange?.(lang)
          }}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
