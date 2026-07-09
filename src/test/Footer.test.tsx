import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Footer } from '@/components/layout/Footer'

describe('Footer', () => {
  it('renders the copyright line', () => {
    render(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi © 2026/)).toBeInTheDocument()
  })

  it('renders the Spanish rights line by default', () => {
    render(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    )
    expect(screen.getByText('Todos los derechos reservados')).toBeInTheDocument()
  })
})
