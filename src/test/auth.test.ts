import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const getUserMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

beforeEach(() => {
  getUserMock.mockReset()
  vi.stubEnv('ADMIN_USER_ID', 'admin-uuid-123')
})

describe('getAdminUser', () => {
  it('returns null when there is no logged-in user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { getAdminUser } = await import('@/lib/auth')
    expect(await getAdminUser()).toBeNull()
  })

  it('returns null when the logged-in user is not the admin account', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'someone-else' } } })
    const { getAdminUser } = await import('@/lib/auth')
    expect(await getAdminUser()).toBeNull()
  })

  it('returns the user when it matches ADMIN_USER_ID', async () => {
    const adminUser = { id: 'admin-uuid-123' }
    getUserMock.mockResolvedValue({ data: { user: adminUser } })
    const { getAdminUser } = await import('@/lib/auth')
    expect(await getAdminUser()).toEqual(adminUser)
  })
})

describe('requireAdmin', () => {
  it('redirects to /admin/login when there is no admin user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { requireAdmin } = await import('@/lib/auth')
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login')
  })

  it('does not redirect and returns the user for the admin account', async () => {
    const adminUser = { id: 'admin-uuid-123' }
    getUserMock.mockResolvedValue({ data: { user: adminUser } })
    const { requireAdmin } = await import('@/lib/auth')
    await expect(requireAdmin()).resolves.toEqual(adminUser)
  })
})
