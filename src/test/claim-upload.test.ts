import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const findUniqueMock = vi.fn()
const updateMock = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pendingUpload: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}))

const objectExistsMock = vi.fn()
const moveObjectMock = vi.fn()
const deleteObjectMock = vi.fn()
vi.mock('@/lib/storage', () => ({
  objectExists: (...args: unknown[]) => objectExistsMock(...args),
  moveObject: (...args: unknown[]) => moveObjectMock(...args),
  deleteObject: (...args: unknown[]) => deleteObjectMock(...args),
}))

beforeEach(() => {
  findUniqueMock.mockReset()
  updateMock.mockReset()
  objectExistsMock.mockReset().mockResolvedValue(true)
  moveObjectMock.mockReset()
  deleteObjectMock.mockReset()
})

describe('claimUpload', () => {
  it('rejects an unknown uploadId', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('nope', 'artworks/1/a.jpg')).rejects.toThrow('Upload not found')
  })

  it('rejects an already-claimed upload', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: new Date() })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('already been used')
  })

  it('rejects an upload older than 24 hours', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'u1',
      path: 'pending/u1.jpg',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      claimedAt: null,
    })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('expired')
  })

  it('rejects when the storage object does not actually exist', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: null })
    objectExistsMock.mockResolvedValueOnce(false)
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('not found in storage')
  })

  it('moves the object to its permanent path and marks the row claimed on success', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: null })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await claimUpload('u1', 'artworks/1/a.jpg')
    expect(moveObjectMock).toHaveBeenCalledWith('pending/u1.jpg', 'artworks/1/a.jpg')
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { claimedAt: expect.any(Date) } })
  })
})

describe('deleteImageIfPresent', () => {
  it('does nothing for a null or undefined path', async () => {
    const { deleteImageIfPresent } = await import('@/lib/actions/claim-upload')
    await deleteImageIfPresent(null)
    await deleteImageIfPresent(undefined)
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  it('deletes the object when a path is given', async () => {
    const { deleteImageIfPresent } = await import('@/lib/actions/claim-upload')
    await deleteImageIfPresent('artworks/1/a.jpg')
    expect(deleteObjectMock).toHaveBeenCalledWith('artworks/1/a.jpg')
  })
})
