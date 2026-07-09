import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ContactSection } from '@/components/sections/ContactSection'

describe('ContactSection', () => {
  it('renders a mailto link with the correct address', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    const emailLink = screen.getByRole('link', { name: /danieco.comics@gmail.com/ })
    expect(emailLink).toHaveAttribute('href', 'mailto:danieco.comics@gmail.com')
  })

  it('renders a tel link with the correct number', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    const phoneLink = screen.getByRole('link', { name: /04244-359019/ })
    expect(phoneLink).toHaveAttribute('href', 'tel:04244359019')
  })

  it('renders both Instagram links', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    expect(screen.getByRole('link', { name: /@daniel_grimaldi/ })).toHaveAttribute(
      'href',
      'https://instagram.com/daniel_grimaldi'
    )
    expect(screen.getByRole('link', { name: /@grim4rt_/ })).toHaveAttribute(
      'href',
      'https://instagram.com/grim4rt_'
    )
  })
})
