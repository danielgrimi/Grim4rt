'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { artworks } from '@/data/artworks'
import { heroContent, siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

const SLIDE_INTERVAL_MS = 5000

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function HeroSlideshow() {
  const { language } = useLanguage()
  // Deterministic initial order (matches server render) — shuffled client-side
  // after mount in the effect below, so hydration never mismatches.
  const [images, setImages] = useState(() => artworks.map((a) => a.img))
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setImages(shuffle(artworks.map((a) => a.img)))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden text-center">
      <div className="absolute inset-0">
        <motion.div
          key={images[activeIndex]}
          data-testid="hero-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/${images[activeIndex]})` }}
        />
        <div className="absolute inset-0 bg-brand-black/60" />
      </div>

      <div className="relative z-10 px-6">
        <p className="text-sm uppercase tracking-widest text-brand-accentLight mb-4">
          {heroContent.eyebrow[language]}
        </p>
        <h1 className="font-display text-6xl md:text-8xl">
          Daniel
          <br />
          <em className="italic">Grimaldi</em>
        </h1>
        <div className="w-16 h-px bg-brand-accent mx-auto my-6" />
        <p className="text-lg text-brand-text/80">{siteConfig.tagline[language]}</p>
      </div>
    </section>
  )
}
