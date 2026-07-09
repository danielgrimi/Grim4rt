'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/lib/language-context'
import type { Artwork } from '@/types'

export function Lightbox({ artwork, onClose }: { artwork: Artwork | null; onClose: () => void }) {
  const { language } = useLanguage()

  return (
    <AnimatePresence>
      {artwork && (
        <motion.div
          data-testid="lightbox-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full">
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="mb-4 text-brand-text/70 hover:text-brand-text transition-colors"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/${artwork.img}`}
              alt={artwork.title[language]}
              className="w-full max-h-[75vh] object-contain"
            />
            <h3 className="font-display text-2xl mt-4">{artwork.title[language]}</h3>
            <p className="text-brand-muted text-sm mt-1">{artwork.technique[language]}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
