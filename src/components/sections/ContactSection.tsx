'use client'
import { siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

export function ContactSection() {
  const { language } = useLanguage()

  return (
    <section id="contacto" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16 text-center">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-4">
        {language === 'es' ? 'Contacto' : 'Contact'}
      </div>
      <h2 className="font-display text-4xl mb-10">
        {language === 'es' ? (
          <>¿Interesado en una <em className="italic">obra?</em></>
        ) : (
          <>Interested in a <em className="italic">piece?</em></>
        )}
      </h2>
      <div className="flex flex-wrap justify-center gap-6 text-sm">
        <a href={`mailto:${siteConfig.email}`} className="hover:text-brand-accentLight transition-colors">
          📧 {siteConfig.email}
        </a>
        <a href={`tel:${siteConfig.phone.replace(/\D/g, '')}`} className="hover:text-brand-accentLight transition-colors">
          📞 Tel: {siteConfig.phone}
        </a>
        <a href={siteConfig.instagramPersonal} target="_blank" rel="noopener noreferrer" className="hover:text-brand-accentLight transition-colors">
          🎨 @daniel_grimaldi
        </a>
        <a href={siteConfig.instagramStudio} target="_blank" rel="noopener noreferrer" className="hover:text-brand-accentLight transition-colors">
          💼 @grim4rt_
        </a>
      </div>
    </section>
  )
}
