import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'

describe('CollectionsGrid', () => {
  it('renders all four collection names in Spanish by default', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    expect(screen.getByText('Toros')).toBeInTheDocument()
    expect(screen.getByText('Bailarinas')).toBeInTheDocument()
    expect(screen.getByText('Figura Humana')).toBeInTheDocument()
    expect(screen.getByText('Estudios')).toBeInTheDocument()
  })

  it('links each collection card to its detail route', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    expect(screen.getByText('Figura Humana').closest('a')).toHaveAttribute(
      'href',
      '/colecciones/figura-humana'
    )
  })

  it('shows the work count for each collection', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    // Both "Figura Humana" and "Estudios" have 2 works, so "2 obras" appears
    // twice — scope the assertion to one specific card rather than
    // getByText, which throws on multiple matches.
    const figuraCard = screen.getByText('Figura Humana').closest('a')
    expect(figuraCard).toHaveTextContent('2 obras')
  })
})
