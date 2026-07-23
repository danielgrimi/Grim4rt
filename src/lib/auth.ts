import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * There is exactly one admin account. Being logged in via Supabase Auth is
 * not enough on its own — the logged-in user's id must also match
 * ADMIN_USER_ID, or anyone who ever signs up (if sign-ups were ever enabled)
 * would reach /admin.
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    return null
  }
  return user
}

/**
 * Authoritative admin gate. Redirects to /admin/login when there's no
 * session or the logged-in account isn't the admin account. Called from
 * src/app/admin/(protected)/layout.tsx AND as the first line of every
 * mutating Server Action under /admin — Server Actions are externally
 * reachable POST endpoints regardless of what proxy.ts or the layout do,
 * so each one re-checks independently.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser()
  if (!user) {
    redirect('/admin/login')
  }
  return user
}
