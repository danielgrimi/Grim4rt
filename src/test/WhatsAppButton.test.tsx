import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'

describe('WhatsAppButton', () => {
  it('links to the correct wa.me URL', () => {
    render(<WhatsAppButton />)
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('href', 'https://wa.me/584244359019')
  })

  it('opens in a new tab', () => {
    render(<WhatsAppButton />)
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
