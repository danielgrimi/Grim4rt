import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Navbar } from '@/components/layout/Navbar'

function renderNavbar() {
  return render(
    <LanguageProvider>
      <Navbar />
    </LanguageProvider>
  )
}

describe('Navbar', () => {
  it('renders all nav items in Spanish by default', () => {
    renderNavbar()
    expect(screen.getByText('Obras')).toBeInTheDocument()
    expect(screen.getByText('Colecciones')).toBeInTheDocument()
    expect(screen.getByText('Sobre mí')).toBeInTheDocument()
    expect(screen.getByText('Contacto')).toBeInTheDocument()
  })

  it('renders nav items in English after toggling language', () => {
    renderNavbar()
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Works')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders the site name', () => {
    renderNavbar()
    expect(screen.getByText('Daniel Grimaldi')).toBeInTheDocument()
  })
})
