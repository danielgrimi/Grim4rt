import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'

describe('HeroSlideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the artist name and tagline', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    expect(screen.getByText('Daniel')).toBeInTheDocument()
    expect(screen.getByText('Grimaldi')).toBeInTheDocument()
    expect(screen.getByText('Pintura que habita el territorio del anhelo.')).toBeInTheDocument()
  })

  it('renders exactly one active background slide', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    const slides = screen.getAllByTestId('hero-slide')
    expect(slides).toHaveLength(1)
    expect(slides[0].style.backgroundImage).toMatch(/^url\(.*\.jpg.*\)$/)
  })

  it('advances to a different background image after 5 seconds', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    const before = screen.getByTestId('hero-slide').style.backgroundImage

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    const after = screen.getByTestId('hero-slide').style.backgroundImage
    expect(after).not.toBe(before)
  })
})
