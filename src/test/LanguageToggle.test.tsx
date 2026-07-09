import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider, useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

function CurrentLanguage() {
  const { language } = useLanguage()
  return <span data-testid="current-language">{language}</span>
}

describe('LanguageToggle', () => {
  it('defaults to Spanish', () => {
    render(
      <LanguageProvider>
        <CurrentLanguage />
      </LanguageProvider>
    )
    expect(screen.getByTestId('current-language')).toHaveTextContent('es')
  })

  it('switches to English when EN is clicked', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <CurrentLanguage />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
  })

  it('switches back to Spanish when ES is clicked', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <CurrentLanguage />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    fireEvent.click(screen.getByRole('button', { name: 'ES' }))
    expect(screen.getByTestId('current-language')).toHaveTextContent('es')
  })

  it('syncs html lang attribute with language toggle', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
      </LanguageProvider>
    )
    expect(document.documentElement.lang).toBe('es')
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(document.documentElement.lang).toBe('en')
  })
})
