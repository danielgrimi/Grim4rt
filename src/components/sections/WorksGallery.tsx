'use client'
import { useState, useMemo } from 'react'
import { artworks } from '@/data/artworks'
import { useLanguage } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import { Lightbox } from '@/components/ui/Lightbox'
import type { Artwork } from '@/types'

type TypeFilter = 'painting' | 'drawing'
type StatusFilter = 'all' | 'available' | 'sold'

const typeFilters: { value: TypeFilter; label: { es: string; en: string } }[] = [
  { value: 'painting', label: { es: 'Pinturas', en: 'Paintings' } },
  { value: 'drawing', label: { es: 'Dibujos', en: 'Drawings' } },
]

const statusFilters: { value: StatusFilter; label: { es: string; en: string } }[] = [
  { value: 'all', label: { es: 'Todas', en: 'All' } },
  { value: 'available', label: { es: 'Disponibles', en: 'Available' } },
  { value: 'sold', label: { es: 'Vendidas', en: 'Sold' } },
]

export function WorksGallery() {
  const { language } = useLanguage()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('painting')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedWork, setSelectedWork] = useState<Artwork | null>(null)

  const filtered = useMemo(
    () =>
      artworks.filter(
        (work) =>
          work.type === typeFilter &&
          (statusFilter === 'all' || work.status === statusFilter)
      ),
    [typeFilter, statusFilter]
  )

  return (
    <section id="obras" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-6">
        {language === 'es' ? 'Portafolio' : 'Portfolio'}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex gap-2">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={
                typeFilter === filter.value
                  ? 'px-4 py-2 text-sm bg-brand-accent text-brand-text'
                  : 'px-4 py-2 text-sm text-brand-muted hover:text-brand-text transition-colors'
              }
            >
              {filter.label[language]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? 'px-4 py-2 text-sm bg-brand-accent text-brand-text'
                  : 'px-4 py-2 text-sm text-brand-muted hover:text-brand-text transition-colors'
              }
            >
              {filter.label[language]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((work) => (
          <ArtworkCard key={work.id} artwork={work} onClick={() => setSelectedWork(work)} />
        ))}
      </div>

      <Lightbox artwork={selectedWork} onClose={() => setSelectedWork(null)} />
    </section>
  )
}
