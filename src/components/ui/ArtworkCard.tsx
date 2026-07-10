'use client'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/language-context'
import { isLandscape } from '@/lib/image-orientation'
import type { Artwork } from '@/types'

function formatPrice(price: string): string {
  const lower = price.toLowerCase()
  if (lower.includes('privada') || lower.includes('private')) return price
  if (lower.includes('consultar') || lower.includes('inquire')) return price
  return price.startsWith('$') ? price : `$${price}`
}

export function ArtworkCard({ artwork, onClick }: { artwork: Artwork; onClick?: () => void }) {
  const { language } = useLanguage()

  const statusLabel =
    artwork.status === 'sold'
      ? { es: 'Vendida', en: 'Sold' }
      : { es: 'Disponible', en: 'Available' }

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group cursor-pointer border border-brand-border bg-brand-card h-full flex flex-col"
    >
      <div
        className={`relative overflow-hidden ${isLandscape(artwork.img) ? 'aspect-[4/3]' : 'aspect-[4/5]'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/${artwork.img}`}
          alt={artwork.title.es}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <span
          className={`text-xs uppercase tracking-wide ${
            artwork.status === 'sold' ? 'text-red-500' : 'text-green-500'
          }`}
        >
          {statusLabel[language]}
        </span>
        <h3 className="font-display text-xl mt-1 truncate">{artwork.title[language]}</h3>
        <div className="text-xs text-brand-muted mt-2 space-y-0.5">
          <div className="truncate">{artwork.technique[language]}</div>
          <div>{artwork.size}</div>
          <div>{artwork.year}</div>
        </div>
        <div className="mt-auto pt-2 text-sm text-brand-text">{formatPrice(artwork.price)}</div>
      </div>
    </motion.div>
  )
}
