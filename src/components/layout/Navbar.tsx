'use client'
import Link from 'next/link'
import { navItems, siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

export function Navbar() {
  const { language } = useLanguage()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-brand-black/90 backdrop-blur-sm border-b border-brand-border">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 flex items-center justify-between h-16 md:h-20">
        <Link href="/" className="font-display text-lg text-brand-text">
          {siteConfig.name}
        </Link>
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-brand-text/80 hover:text-brand-text transition-colors"
            >
              {item.label[language]}
            </Link>
          ))}
        </nav>
        <LanguageToggle />
      </div>
    </header>
  )
}
