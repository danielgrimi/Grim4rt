import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn(async () => undefined)
vi.mock('@/lib/auth', () => ({ requireAdmin: () => requireAdminMock() }))

const updateTagMock = vi.fn()
const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const collectionFindFirst = vi.fn()
const collectionFindUniqueOrThrow = vi.fn()
const collectionCreate = vi.fn()
const collectionUpdate = vi.fn()
const collectionDelete = vi.fn()
const collectionArtworkFindUnique = vi.fn()
const collectionArtworkFindFirst = vi.fn()
const collectionArtworkFindUniqueOrThrow = vi.fn()
const collectionArtworkCreate = vi.fn()
const collectionArtworkUpdate = vi.fn()
const collectionArtworkDelete = vi.fn()
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    collection: {
      findFirst: (...a: unknown[]) => collectionFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => collectionFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => collectionCreate(...a),
      update: (...a: unknown[]) => collectionUpdate(...a),
      delete: (...a: unknown[]) => collectionDelete(...a),
    },
    collectionArtwork: {
      findUnique: (...a: unknown[]) => collectionArtworkFindUnique(...a),
      findFirst: (...a: unknown[]) => collectionArtworkFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => collectionArtworkFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => collectionArtworkCreate(...a),
      update: (...a: unknown[]) => collectionArtworkUpdate(...a),
      delete: (...a: unknown[]) => collectionArtworkDelete(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(undefined)
  updateTagMock.mockReset()
  revalidatePathMock.mockReset()
  collectionFindFirst.mockReset().mockResolvedValue({ displayOrder: 3 })
  collectionFindUniqueOrThrow.mockReset()
  collectionCreate.mockReset()
  collectionUpdate.mockReset()
  collectionDelete.mockReset()
  collectionArtworkFindUnique.mockReset()
  collectionArtworkFindFirst.mockReset()
  collectionArtworkFindUniqueOrThrow.mockReset()
  collectionArtworkCreate.mockReset()
  collectionArtworkUpdate.mockReset()
  collectionArtworkDelete.mockReset()
  transactionMock.mockClear()
})

describe('authorization', () => {
  it('every collection mutation calls requireAdmin', async () => {
    const actions = await import('@/lib/actions/collections')
    collectionFindUniqueOrThrow.mockResolvedValue({ id: 'col-1', slug: 'x', displayOrder: 0, coverArtworkId: null })
    collectionFindFirst.mockResolvedValue(null)
    collectionArtworkFindFirst.mockResolvedValue(null)
    collectionArtworkFindUniqueOrThrow.mockResolvedValue({ position: 0, artworkId: 'a1' })
    requireAdminMock.mockClear()

    await actions.createCollection(formDataFor({ slug: 'x', nameEs: 'X', nameEn: 'X' }))
    await actions.updateCollection('col-1', formDataFor({ slug: 'x', nameEs: 'X', nameEn: 'X' }))
    await actions.deleteCollection('col-1')
    await actions.moveCollection('col-1', 'up')
    await actions.addArtworkToCollection('col-1', 'a1')
    await actions.removeArtworkFromCollection('col-1', 'a1')
    await actions.moveArtworkInCollection('col-1', 'a1', 'up')

    expect(requireAdminMock).toHaveBeenCalledTimes(7)
  })
})

describe('updateCollection cover validation', () => {
  it('rejects a cover artwork that is not a member of the collection', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce(null)
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'outside-artwork')
    await expect(updateCollection('col-1', fd)).rejects.toThrow('already assigned to this collection')
  })

  it('rejects an unpublished artwork as cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce({ artwork: { isPublished: false } })
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'unpublished-artwork')
    await expect(updateCollection('col-1', fd)).rejects.toThrow('published artwork')
  })

  it('accepts a published, member artwork as cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce({ artwork: { isPublished: true } })
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'good-artwork')
    await updateCollection('col-1', fd)
    expect(collectionUpdate).toHaveBeenCalledWith({
      where: { id: 'col-1' },
      data: { slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies', coverArtworkId: 'good-artwork' },
    })
  })
})

describe('removeArtworkFromCollection', () => {
  it('clears coverArtworkId when the removed artwork was the cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', slug: 'x', coverArtworkId: 'art-1' })
    const { removeArtworkFromCollection } = await import('@/lib/actions/collections')
    await removeArtworkFromCollection('col-1', 'art-1')
    expect(collectionUpdate).toHaveBeenCalledWith({ where: { id: 'col-1' }, data: { coverArtworkId: null } })
  })

  it('leaves coverArtworkId untouched when a different artwork is removed', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', slug: 'x', coverArtworkId: 'art-1' })
    const { removeArtworkFromCollection } = await import('@/lib/actions/collections')
    await removeArtworkFromCollection('col-1', 'art-2')
    expect(collectionUpdate).not.toHaveBeenCalled()
  })
})

describe('moveCollection', () => {
  it('does nothing at the boundary', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', displayOrder: 0 })
    collectionFindFirst.mockResolvedValueOnce(null)
    const { moveCollection } = await import('@/lib/actions/collections')
    await moveCollection('col-1', 'up')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('swaps displayOrder with the neighbor inside a transaction', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', displayOrder: 2 })
    collectionFindFirst.mockResolvedValueOnce({ id: 'col-0', displayOrder: 1 })
    const { moveCollection } = await import('@/lib/actions/collections')
    await moveCollection('col-1', 'up')
    expect(transactionMock).toHaveBeenCalled()
    expect(transactionMock.mock.calls[0][0]).toHaveLength(2)
  })
})

describe('moveArtworkInCollection', () => {
  it('swaps position with the neighbor inside a transaction and invalidates the collection', async () => {
    collectionArtworkFindUniqueOrThrow.mockResolvedValueOnce({ artworkId: 'a2', position: 2 })
    collectionArtworkFindFirst.mockResolvedValueOnce({ artworkId: 'a1', position: 1 })
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'bailarinas' })
    const { moveArtworkInCollection } = await import('@/lib/actions/collections')
    await moveArtworkInCollection('col-2', 'a2', 'up')
    expect(transactionMock).toHaveBeenCalled()
    expect(updateTagMock).toHaveBeenCalledWith('collection:bailarinas')
  })
})
