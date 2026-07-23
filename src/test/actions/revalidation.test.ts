import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => undefined) }))
vi.mock('@/lib/actions/claim-upload', () => ({
  claimUpload: vi.fn(async () => undefined),
  deleteImageIfPresent: vi.fn(async () => undefined),
}))

const updateTagMock = vi.fn()
const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const artwork = {
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const collection = {
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const collectionArtwork = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findMany: vi.fn(),
}
const pendingUpload = { findUniqueOrThrow: vi.fn() }
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artwork,
    collection,
    collectionArtwork,
    pendingUpload,
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  updateTagMock.mockReset()
  revalidatePathMock.mockReset()
  Object.values(artwork).forEach((fn) => fn.mockReset())
  Object.values(collection).forEach((fn) => fn.mockReset())
  Object.values(collectionArtwork).forEach((fn) => fn.mockReset())
  pendingUpload.findUniqueOrThrow.mockReset()
  transactionMock.mockClear()
})

const artworkFields = {
  type: 'PAINTING',
  titleEs: 'A',
  titleEn: 'A',
  techniqueEs: 'x',
  techniqueEn: 'x',
  size: '1',
  year: '2026',
  price: '$1',
  status: 'AVAILABLE',
}

describe('artwork mutations invalidate the right tags/paths', () => {
  it('createArtwork invalidates artworks + / (no collections yet)', async () => {
    artwork.findFirst.mockResolvedValue(null)
    artwork.create.mockResolvedValue({ id: 'new-art' })
    pendingUpload.findUniqueOrThrow.mockResolvedValue({ path: 'pending/u1.jpg' })
    collectionArtwork.findMany.mockResolvedValue([])
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...artworkFields, uploadId: 'u1' }))
    expect(updateTagMock).toHaveBeenCalledWith('artworks')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(updateTagMock).not.toHaveBeenCalledWith('collections')
  })

  it('toggleArtworkPublished also invalidates every collection the artwork belongs to', async () => {
    artwork.findUniqueOrThrow.mockResolvedValue({})
    collectionArtwork.findMany.mockResolvedValue([{ collection: { slug: 'estudios' } }])
    const { toggleArtworkPublished } = await import('@/lib/actions/artworks')
    await toggleArtworkPublished('a1', false)
    expect(updateTagMock).toHaveBeenCalledWith('collections')
    expect(updateTagMock).toHaveBeenCalledWith('collection:estudios')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/estudios')
  })

  it('deleteArtwork invalidates collections captured BEFORE the delete (not re-queried after)', async () => {
    artwork.findUniqueOrThrow.mockResolvedValue({
      imagePath: 'artworks/a1/x.jpg',
      collections: [{ collection: { slug: 'figura-humana' } }],
    })
    const { deleteArtwork } = await import('@/lib/actions/artworks')
    await deleteArtwork('a1')
    expect(updateTagMock).toHaveBeenCalledWith('collection:figura-humana')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/figura-humana')
    // Never re-queries CollectionArtwork after the delete for this path.
    expect(collectionArtwork.findMany).not.toHaveBeenCalled()
  })
})

describe('collection mutations invalidate the right tags/paths', () => {
  it('createCollection invalidates the new slug', async () => {
    collection.findFirst.mockResolvedValue(null)
    const { createCollection } = await import('@/lib/actions/collections')
    await createCollection(formDataFor({ slug: 'nueva', nameEs: 'Nueva', nameEn: 'New' }))
    expect(updateTagMock).toHaveBeenCalledWith('collection:nueva')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/nueva')
  })

  it('updateCollection with an unchanged slug invalidates only that one slug', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'estudios' })
    const { updateCollection } = await import('@/lib/actions/collections')
    await updateCollection('col-1', formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' }))
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/estudios')
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/colecciones/old-slug')
  })

  it('updateCollection with a slug change invalidates BOTH the old and new identity', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'old-slug' })
    const { updateCollection } = await import('@/lib/actions/collections')
    await updateCollection('col-1', formDataFor({ slug: 'new-slug', nameEs: 'X', nameEn: 'X' }))
    expect(updateTagMock).toHaveBeenCalledWith('collection:old-slug')
    expect(updateTagMock).toHaveBeenCalledWith('collection:new-slug')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/old-slug')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/new-slug')
  })

  it('deleteCollection invalidates its slug, "collections", and the /colecciones grid', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'toros' })
    const { deleteCollection } = await import('@/lib/actions/collections')
    await deleteCollection('col-1')
    expect(updateTagMock).toHaveBeenCalledWith('collection:toros')
    expect(updateTagMock).toHaveBeenCalledWith('collections')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/toros')
  })

  it('addArtworkToCollection invalidates that specific collection', async () => {
    collectionArtwork.findFirst.mockResolvedValue(null)
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'bailarinas' })
    const { addArtworkToCollection } = await import('@/lib/actions/collections')
    await addArtworkToCollection('col-2', 'art-5')
    expect(updateTagMock).toHaveBeenCalledWith('collection:bailarinas')
  })
})
