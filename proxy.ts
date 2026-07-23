import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Authoritative admin gate for every /admin/* request. This has to do more
 * than a cookie-presence check (unlike a homegrown JWT session) because
 * Supabase access tokens expire and need silent refreshing — updateSession()
 * calls supabase.auth.getUser(), which both validates the session against
 * Supabase and refreshes an expired-but-still-valid token. requireAdmin()
 * (src/lib/auth.ts) re-checks independently in the admin layout and every
 * Server Action, since those are reachable regardless of what this proxy does.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  const { response, user } = await updateSession(request)

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
