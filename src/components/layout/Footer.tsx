'use client'
import { useLanguage } from '@/lib/language-context'

export function Footer() {
  const { language } = useLanguage()
  const rights = language === 'es' ? 'Todos los derechos reservados' : 'All rights reserved'

  return (
    <footer className="flex items-center justify-center gap-4 py-8 text-xs text-brand-muted border-t border-brand-border">
      <span>Daniel Grimaldi © 2026</span>
      <span>{rights}</span>
    </footer>
  )
}
