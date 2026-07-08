'use client'
import { collections } from '@/data/collections'
import { artworks } from '@/data/artworks'
import { useLanguage } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import { BackButton } from '@/components/ui/BackButton'

export function CollectionDetail({ slug }: { slug: string }) {
  const { language } = useLanguage()
  const collection = collections.find((c) => c.slug === slug)

  if (!collection) return null

  const works = collection.workIds
    .map((id) => artworks.find((a) => a.id === id))
    .filter((work): work is NonNullable<typeof work> => Boolean(work))

  return (
    <section className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <BackButton href="/colecciones" label={language === 'es' ? 'Volver a Colecciones' : 'Back to Collections'} />

      <h1 className="font-display text-4xl mt-6">{collection.name[language]}</h1>
      <p className="text-sm text-brand-muted mt-2">
        {language === 'es'
          ? `${works.length} obras en esta colección`
          : `${works.length} works in this collection`}
      </p>

      {works.length === 0 ? (
        <p className="mt-10 text-brand-muted italic">
          {language === 'es' ? 'Esta colección aún no tiene obras.' : 'This collection has no works yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          {works.map((work) => (
            <ArtworkCard key={work.id} artwork={work} />
          ))}
        </div>
      )}
    </section>
  )
}
