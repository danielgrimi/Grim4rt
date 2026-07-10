'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { navItems, siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

export function Navbar() {
  const { language } = useLanguage()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-brand-text/10 glass-nav ${
        scrolled ? 'glass-nav--scrolled' : ''
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 flex items-center justify-between h-16 md:h-20">
        <Link href="/" className="font-display text-lg tracking-wide text-brand-text">
          {siteConfig.name}
        </Link>

        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link text-brand-text/80 hover:text-brand-text transition-colors"
            >
              {item.label[language]}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <LanguageToggle />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? (language === 'es' ? 'Cerrar menú' : 'Close menu') : language === 'es' ? 'Abrir menú' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="md:hidden flex items-center justify-center w-10 h-10 -mr-2 text-brand-text"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden glass-panel border-t border-brand-text/10"
          >
            <nav
              aria-label="Navegación móvil"
              className="max-w-[1440px] mx-auto px-6 py-6 flex flex-col gap-1"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="py-3 text-lg font-display text-brand-text/90 hover:text-brand-text border-b border-brand-text/5 last:border-b-0"
                >
                  {item.label[language]}
                </Link>
              ))}
              <div className="pt-5">
                <LanguageToggle />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
