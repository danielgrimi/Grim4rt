'use client'
import Link from 'next/link'
import { collections } from '@/data/collections'
import { useLanguage } from '@/lib/language-context'

export function CollectionsGrid() {
  const { language } = useLanguage()

  return (
    <section className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-4">
        {language === 'es' ? 'Explorar' : 'Explore'}
      </div>
      <h1 className="font-display text-4xl mb-10">
        <em className="italic">{language === 'es' ? 'Colecciones' : 'Collections'}</em>
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {collections.map((collection) => (
          <Link
            key={collection.slug}
            href={`/colecciones/${collection.slug}`}
            className="group block border border-brand-border bg-brand-card h-full flex flex-col"
          >
            <div className="aspect-[4/3] overflow-hidden bg-brand-dark">
              {collection.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/${collection.cover}`}
                  alt={collection.name.es}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <h3 className="font-display text-xl">{collection.name[language]}</h3>
              <p className="text-xs text-brand-muted mt-auto pt-1">
                {collection.workIds.length} {language === 'es' ? 'obras' : 'works'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
