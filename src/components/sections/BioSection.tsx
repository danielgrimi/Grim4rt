'use client'
import { bio } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

export function BioSection() {
  const { language } = useLanguage()

  return (
    <section id="bio" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16 grid md:grid-cols-[1fr_2fr_1fr] gap-10">
      <div className="aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foto bio.jpg" alt="Daniel Grimaldi en su taller" className="w-full h-full object-cover" />
      </div>

      <div className="space-y-4 text-brand-text/90">
        {bio.paragraphs.map((paragraph) => (
          <p key={paragraph.es}>{paragraph[language]}</p>
        ))}
      </div>

      <div>
        <h2 className="font-display text-3xl">
          Daniel
          <br />
          <em className="italic">Grimaldi</em>
        </h2>
        <div className="mt-4 text-sm text-brand-muted space-y-1">
          <div>{bio.role[language]}</div>
          <div>{bio.location}</div>
        </div>
        <div className="mt-4 text-xs text-brand-accentLight">{bio.since}</div>
      </div>
    </section>
  )
}
