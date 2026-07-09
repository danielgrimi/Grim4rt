import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Lightbox } from '@/components/ui/Lightbox'
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

describe('Lightbox', () => {
  it('renders nothing when artwork is null', () => {
    const { container } = render(
      <LanguageProvider>
        <Lightbox artwork={null} onClose={vi.fn()} />
      </LanguageProvider>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the artwork title and image when artwork is provided', () => {
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={vi.fn()} />
      </LanguageProvider>
    )
    expect(screen.getByText('Título de Prueba')).toBeInTheDocument()
    expect(screen.getByAltText('Título de Prueba')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={onClose} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay background is clicked', () => {
    const onClose = vi.fn()
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={onClose} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByTestId('lightbox-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
