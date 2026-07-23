import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const listMock = vi.fn()
const moveMock = vi.fn()
const removeMock = vi.fn()
const getPublicUrlMock = vi.fn()
const createSignedUploadUrlMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        list: listMock,
        move: moveMock,
        remove: removeMock,
        getPublicUrl: getPublicUrlMock,
        createSignedUploadUrl: createSignedUploadUrlMock,
      }),
    },
  }),
}))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key')
  listMock.mockReset()
  moveMock.mockReset()
  removeMock.mockReset()
  getPublicUrlMock.mockReset()
  createSignedUploadUrlMock.mockReset()
})

describe('storage helpers', () => {
  it('publicUrlFor derives a public URL from a path', async () => {
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.example/artwork-images/foo.jpg' } })
    const { publicUrlFor } = await import('@/lib/storage')
    expect(publicUrlFor('foo.jpg')).toBe('https://cdn.example/artwork-images/foo.jpg')
  })

  it('objectExists returns true when the file is listed in its directory', async () => {
    listMock.mockResolvedValue({ data: [{ name: 'abc.jpg' }], error: null })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/abc.jpg')).toBe(true)
    expect(listMock).toHaveBeenCalledWith('pending', { search: 'abc.jpg' })
  })

  it('objectExists returns false when the file is absent', async () => {
    listMock.mockResolvedValue({ data: [], error: null })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/missing.jpg')).toBe(false)
  })

  it('objectExists returns false on a list error rather than throwing', async () => {
    listMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/abc.jpg')).toBe(false)
  })

  it('moveObject throws a descriptive error when the move fails', async () => {
    moveMock.mockResolvedValue({ error: { message: 'not found' } })
    const { moveObject } = await import('@/lib/storage')
    await expect(moveObject('pending/a.jpg', 'artworks/1/a.jpg')).rejects.toThrow(
      /Failed to move storage object/
    )
  })

  it('deleteObject swallows errors instead of throwing', async () => {
    removeMock.mockResolvedValue({ error: { message: 'gone already' } })
    const { deleteObject } = await import('@/lib/storage')
    await expect(deleteObject('artworks/1/a.jpg')).resolves.toBeUndefined()
  })

  it('createSignedUploadUrl throws a descriptive error when signing fails', async () => {
    createSignedUploadUrlMock.mockResolvedValue({ data: null, error: { message: 'bucket missing' } })
    const { createSignedUploadUrl } = await import('@/lib/storage')
    await expect(createSignedUploadUrl('pending/a.jpg')).rejects.toThrow(/Failed to create signed upload URL/)
  })

  it('getClient throws when env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    const { publicUrlFor } = await import('@/lib/storage')
    expect(() => publicUrlFor('foo.jpg')).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})
