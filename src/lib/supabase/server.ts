import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase client for Server Components/Actions — reads the session from
 * request cookies and (when called somewhere that can still write to the
 * response, e.g. a Server Action or proxy.ts) persists refreshed tokens back
 * via setAll. Server Components can't set cookies, so setAll silently no-ops
 * there; that's fine because proxy.ts refreshes the session on every request.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies are read-only there.
            // Ignored: proxy.ts already refreshes the session on every request.
          }
        },
      },
    }
  )
}
