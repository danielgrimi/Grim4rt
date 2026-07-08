import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionDetail } from '@/components/collections/CollectionDetail'

describe('CollectionDetail', () => {
  it('renders the collection name and work count', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText('Figura Humana')).toBeInTheDocument()
    expect(screen.getByText('2 obras en esta colección')).toBeInTheDocument()
  })

  it("renders each of the collection's artworks", () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.getByText('Volumen Esencial')).toBeInTheDocument()
  })

  it('renders a back link to /colecciones', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText(/Volver a Colecciones/).closest('a')).toHaveAttribute(
      'href',
      '/colecciones'
    )
  })

  it('renders an empty-state message for a collection with no works', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="toros" />
      </LanguageProvider>
    )
    expect(screen.getByText('Esta colección aún no tiene obras.')).toBeInTheDocument()
  })
})
