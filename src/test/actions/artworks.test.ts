import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn(async () => undefined)
vi.mock('@/lib/auth', () => ({ requireAdmin: () => requireAdminMock() }))

const updateTagMock = vi.fn()
const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const artworkFindFirst = vi.fn()
const artworkFindUniqueOrThrow = vi.fn()
const artworkCreate = vi.fn()
const artworkUpdate = vi.fn()
const artworkDelete = vi.fn()
const collectionArtworkFindMany = vi.fn()
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))
const pendingUploadFindUniqueOrThrow = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artwork: {
      findFirst: (...a: unknown[]) => artworkFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => artworkFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => artworkCreate(...a),
      update: (...a: unknown[]) => artworkUpdate(...a),
      delete: (...a: unknown[]) => artworkDelete(...a),
    },
    collectionArtwork: { findMany: (...a: unknown[]) => collectionArtworkFindMany(...a) },
    pendingUpload: { findUniqueOrThrow: (...a: unknown[]) => pendingUploadFindUniqueOrThrow(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

const claimUploadMock = vi.fn()
const deleteImageIfPresentMock = vi.fn()
vi.mock('@/lib/actions/claim-upload', () => ({
  claimUpload: (...a: unknown[]) => claimUploadMock(...a),
  deleteImageIfPresent: (...a: unknown[]) => deleteImageIfPresentMock(...a),
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const baseFields = {
  type: 'PAINTING',
  titleEs: 'Anhelo',
  titleEn: 'Longing',
  techniqueEs: 'Óleo',
  techniqueEn: 'Oil',
  size: '80x60',
  year: '2026',
  price: '$600',
  status: 'AVAILABLE',
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(undefined)
  updateTagMock.mockReset()
  revalidatePathMock.mockReset()
  artworkFindFirst.mockReset().mockResolvedValue({ displayOrder: 4 })
  artworkFindUniqueOrThrow.mockReset()
  artworkCreate.mockReset().mockResolvedValue({ id: 'new-art' })
  artworkUpdate.mockReset()
  artworkDelete.mockReset()
  collectionArtworkFindMany.mockReset().mockResolvedValue([])
  transactionMock.mockClear()
  pendingUploadFindUniqueOrThrow.mockReset().mockResolvedValue({ path: 'pending/upload-1.jpg' })
  claimUploadMock.mockReset()
  deleteImageIfPresentMock.mockReset()
})

describe('authorization', () => {
  it('createArtwork calls requireAdmin before touching the database', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(requireAdminMock).toHaveBeenCalled()
  })

  it('every mutation calls requireAdmin, not just once at module load', async () => {
    const actions = await import('@/lib/actions/artworks')
    requireAdminMock.mockClear()
    artworkFindUniqueOrThrow.mockResolvedValue({ imagePath: 'x.jpg', collections: [] })
    artworkFindFirst.mockResolvedValue(null)

    await actions.updateArtwork('a1', formDataFor(baseFields))
    await actions.deleteArtwork('a1')
    await actions.toggleArtworkPublished('a1', true)
    await actions.moveArtwork('a1', 'up')

    expect(requireAdminMock).toHaveBeenCalledTimes(4)
  })
})

describe('createArtwork', () => {
  it('rejects a new artwork with no uploadId', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await expect(createArtwork(formDataFor(baseFields))).rejects.toThrow('An image is required')
  })

  it('assigns displayOrder as one past the current max', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(artworkCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayOrder: 5 }) })
    )
  })

  it('claims the pending upload at artworks/{id}/{uploadId}.{ext} and stores that path', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(claimUploadMock).toHaveBeenCalledWith('upload-1', 'artworks/new-art/upload-1.jpg')
    expect(artworkUpdate).toHaveBeenCalledWith({
      where: { id: 'new-art' },
      data: { imagePath: 'artworks/new-art/upload-1.jpg' },
    })
  })

  it('invalidates the artworks cache tag and the homepage on success', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(updateTagMock).toHaveBeenCalledWith('artworks')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('cleans up the orphaned storage file when the final DB update fails after the image was already claimed', async () => {
    artworkUpdate.mockRejectedValueOnce(new Error('db write failed'))
    const { createArtwork } = await import('@/lib/actions/artworks')
    await expect(createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))).rejects.toThrow(
      'db write failed'
    )
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/new-art/upload-1.jpg')
    // The failure must not be silently swallowed — no cache invalidation on a failed write.
    expect(updateTagMock).not.toHaveBeenCalled()
  })
})

describe('updateArtwork', () => {
  it('keeps the existing imagePath when no new upload is provided', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ imagePath: 'artworks/a1/old.jpg' })
    const { updateArtwork } = await import('@/lib/actions/artworks')
    await updateArtwork('a1', formDataFor(baseFields))
    expect(artworkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ imagePath: 'artworks/a1/old.jpg' }) })
    )
    expect(deleteImageIfPresentMock).not.toHaveBeenCalled()
  })

  it('claims a new upload and deletes the old image when one is replaced', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ imagePath: 'artworks/a1/old.jpg' })
    const { updateArtwork } = await import('@/lib/actions/artworks')
    await updateArtwork('a1', formDataFor({ ...baseFields, uploadId: 'upload-2' }))
    expect(claimUploadMock).toHaveBeenCalledWith('upload-2', 'artworks/a1/upload-2.jpg')
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/a1/old.jpg')
  })

  it('cleans up only the NEW image (not the old one) when the DB update fails after replacing the image', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ imagePath: 'artworks/a1/old.jpg' })
    artworkUpdate.mockRejectedValueOnce(new Error('db write failed'))
    const { updateArtwork } = await import('@/lib/actions/artworks')
    await expect(updateArtwork('a1', formDataFor({ ...baseFields, uploadId: 'upload-2' }))).rejects.toThrow(
      'db write failed'
    )
    expect(deleteImageIfPresentMock).toHaveBeenCalledTimes(1)
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/a1/upload-2.jpg')
    expect(deleteImageIfPresentMock).not.toHaveBeenCalledWith('artworks/a1/old.jpg')
  })
})

describe('deleteArtwork', () => {
  it('captures collection memberships before deleting, then deletes the image', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({
      imagePath: 'artworks/a1/x.jpg',
      collections: [{ collection: { slug: 'estudios' } }],
    })
    const { deleteArtwork } = await import('@/lib/actions/artworks')
    await deleteArtwork('a1')
    expect(artworkDelete).toHaveBeenCalledWith({ where: { id: 'a1' } })
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/a1/x.jpg')
    expect(updateTagMock).toHaveBeenCalledWith('collection:estudios')
    expect(collectionArtworkFindMany).not.toHaveBeenCalled()
  })
})

describe('moveArtwork', () => {
  it('does nothing when already at the top boundary', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ id: 'a1', displayOrder: 0 })
    artworkFindFirst.mockResolvedValueOnce(null)
    const { moveArtwork } = await import('@/lib/actions/artworks')
    await moveArtwork('a1', 'up')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('swaps displayOrder with the neighbor inside a transaction', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ id: 'a1', displayOrder: 2 })
    artworkFindFirst.mockResolvedValueOnce({ id: 'a0', displayOrder: 1 })
    const { moveArtwork } = await import('@/lib/actions/artworks')
    await moveArtwork('a1', 'up')
    expect(transactionMock).toHaveBeenCalled()
    expect(transactionMock.mock.calls[0][0]).toHaveLength(2)
  })
})
