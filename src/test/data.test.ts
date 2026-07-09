import { describe, it, expect } from 'vitest'
import { artworks } from '@/data/artworks'
import { collections } from '@/data/collections'

describe('artworks data', () => {
  it('has exactly 49 entries', () => {
    expect(artworks).toHaveLength(49)
  })

  it('has unique ids', () => {
    const ids = artworks.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has both a painting and a drawing type', () => {
    const types = new Set(artworks.map((a) => a.type))
    expect(types.has('painting')).toBe(true)
    expect(types.has('drawing')).toBe(true)
  })

  it('has both available and sold statuses', () => {
    const statuses = new Set(artworks.map((a) => a.status))
    expect(statuses.has('available')).toBe(true)
    expect(statuses.has('sold')).toBe(true)
  })
})

describe('collections data', () => {
  it('has exactly 4 collections', () => {
    expect(collections).toHaveLength(4)
  })

  it('references only existing artwork ids', () => {
    const artworkIds = new Set(artworks.map((a) => a.id))
    for (const collection of collections) {
      for (const workId of collection.workIds) {
        expect(artworkIds.has(workId)).toBe(true)
      }
    }
  })

  it('has unique slugs', () => {
    const slugs = collections.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
