import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import type { Artwork } from '@/types'

const sampleArtwork: Artwork = {
  id: 'obra9999',
  type: 'painting',
  img: 'Sample.jpg',
  title: { es: 'Título de Prueba', en: 'Test Title' },
  technique: { es: 'Óleo sobre lienzo', en: 'Oil on canvas' },
  size: '50 × 50 cm',
  year: '2026',
  price: '$500',
  status: 'available',
}

describe('ArtworkCard', () => {
  it('renders the Spanish title, technique, size, and year by default', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('Título de Prueba')).toBeInTheDocument()
    expect(screen.getByText('Óleo sobre lienzo')).toBeInTheDocument()
    expect(screen.getByText('50 × 50 cm')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('renders a dollar-prefixed price as-is', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  it('renders "Colección Privada" for a sold work whose price says private', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={{ ...sampleArtwork, status: 'sold', price: 'Colección Privada' }} />
      </LanguageProvider>
    )
    expect(screen.getByText('Colección Privada')).toBeInTheDocument()
    expect(screen.getByText('Vendida')).toBeInTheDocument()
  })

  it('shows "Disponible" status label for an available work', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('calls onClick when the card is clicked', () => {
    const onClick = vi.fn()
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} onClick={onClick} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByText('Título de Prueba'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
