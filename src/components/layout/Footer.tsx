'use client'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/InstagramIcon'
import { siteConfig, navItems, bio } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

export function Footer() {
  const { language } = useLanguage()
  const rights = language === 'es' ? 'Todos los derechos reservados' : 'All rights reserved'
  const navigationLabel = language === 'es' ? 'Navegación' : 'Navigation'
  const followLabel = language === 'es' ? 'Sígueme' : 'Follow'

  return (
    <footer className="border-t border-brand-border bg-brand-black">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
        <div className="grid md:grid-cols-3 gap-12 pb-12 border-b border-brand-border">
          <div>
            <span className="font-display text-xl">{siteConfig.name}</span>
            <p className="text-sm text-brand-muted mt-3 max-w-xs">{siteConfig.tagline[language]}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-brand-muted mb-5">
              {navigationLabel}
            </p>
            <ul className="flex flex-col gap-3">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                  >
                    {item.label[language]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-brand-muted mb-5">
              {followLabel}
            </p>
            <ul className="flex flex-col gap-3">
              <li>
                <a
                  href={siteConfig.instagramPersonal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                >
                  <InstagramIcon size={14} className="shrink-0" />
                  @daniel_grimaldi
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.instagramStudio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                >
                  <InstagramIcon size={14} className="shrink-0" />
                  @grim4rt_
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-brand-muted">
                <MapPin size={14} className="shrink-0" />
                {bio.location}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-8 text-xs text-brand-muted">
          <span>{siteConfig.name} © 2026</span>
          <span>{rights}</span>
        </div>
      </div>
    </footer>
  )
}
