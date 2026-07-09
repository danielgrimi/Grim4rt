import { describe, it, expect } from 'vitest'
import { isLandscape } from '@/lib/image-orientation'

describe('isLandscape', () => {
  it('returns true for a known landscape-oriented artwork image', () => {
    expect(isLandscape('Caballo.jpg')).toBe(true)
  })

  it('returns false for a known portrait-oriented artwork image', () => {
    expect(isLandscape('Anhelo.jpg')).toBe(false)
  })

  it('returns false for an image not in the landscape set', () => {
    expect(isLandscape('Unknown.jpg')).toBe(false)
  })
})
