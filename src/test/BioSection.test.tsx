import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { BioSection } from '@/components/sections/BioSection'

describe('BioSection', () => {
  it('renders the Spanish bio paragraphs by default', () => {
    render(
      <LanguageProvider>
        <BioSection />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) es un artista visual/)).toBeInTheDocument()
  })

  it('renders the English bio paragraphs after toggling language', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <BioSection />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) is a visual artist/)).toBeInTheDocument()
  })

  it('renders the role and location', () => {
    render(
      <LanguageProvider>
        <BioSection />
      </LanguageProvider>
    )
    expect(screen.getByText('Artista Plástico')).toBeInTheDocument()
    expect(screen.getByText('Valencia, Venezuela')).toBeInTheDocument()
  })
})
