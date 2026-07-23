import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn(async () => undefined)
vi.mock('@/lib/auth', () => ({ requireAdmin: () => requireAdminMock() }))

const createMock = vi.fn()
const updateMock = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pendingUpload: {
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}))

const createSignedUploadUrlMock = vi.fn()
vi.mock('@/lib/storage', () => ({
  createSignedUploadUrl: (...args: unknown[]) => createSignedUploadUrlMock(...args),
}))

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(undefined)
  createMock.mockReset().mockResolvedValue({ id: 'upload-1' })
  updateMock.mockReset()
  createSignedUploadUrlMock.mockReset().mockResolvedValue({ signedUrl: 'https://signed.example/put', token: 'tok' })
})

describe('createPendingUpload', () => {
  it('calls requireAdmin before anything else', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await createPendingUpload('photo.jpg', 'image/jpeg', 1024)
    expect(requireAdminMock).toHaveBeenCalled()
  })

  it('rejects a disallowed mime type', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await expect(createPendingUpload('doc.pdf', 'application/pdf', 1024)).rejects.toThrow()
  })

  it('rejects a file larger than 10MB', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await expect(createPendingUpload('big.jpg', 'image/jpeg', 11 * 1024 * 1024)).rejects.toThrow()
  })

  it('creates a PendingUpload row at a stable pending/{id}.{ext} path and returns its signed URL', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    const result = await createPendingUpload('photo.jpg', 'image/jpeg', 1024)
    expect(result).toEqual({
      uploadId: 'upload-1',
      signedUrl: 'https://signed.example/put',
      path: 'pending/upload-1.jpg',
    })
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'upload-1' }, data: { path: 'pending/upload-1.jpg' } })
  })
})
