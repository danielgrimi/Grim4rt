'use client'
import { useLanguage } from '@/lib/language-context'

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="flex items-center gap-2 text-xs tracking-wide">
      <button
        onClick={() => setLanguage('es')}
        className={language === 'es' ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text transition-colors'}
      >
        ES
      </button>
      <span className="text-brand-muted">/</span>
      <button
        onClick={() => setLanguage('en')}
        className={language === 'en' ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text transition-colors'}
      >
        EN
      </button>
    </div>
  )
}
