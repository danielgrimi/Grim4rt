import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { WorksGallery } from '@/components/sections/WorksGallery'

function renderGallery() {
  return render(
    <LanguageProvider>
      <WorksGallery />
    </LanguageProvider>
  )
}

describe('WorksGallery', () => {
  it('shows only paintings by default', () => {
    renderGallery()
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.queryByText('Estudio de Movimiento')).not.toBeInTheDocument()
  })

  it('shows drawings when the Dibujos filter is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Dibujos' }))
    expect(screen.getByText('Estudio de Movimiento')).toBeInTheDocument()
    expect(screen.queryByText('Anhelo')).not.toBeInTheDocument()
  })

  it('filters to only available works when Disponibles is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Disponibles' }))
    expect(screen.getByText('Volumen Esencial')).toBeInTheDocument()
    expect(screen.queryByText('Anhelo')).not.toBeInTheDocument()
  })

  it('filters to only sold works when Vendidas is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Vendidas' }))
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.queryByText('Volumen Esencial')).not.toBeInTheDocument()
  })

  it('opens the lightbox when a card is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByText('Anhelo'))
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument()
  })
})
