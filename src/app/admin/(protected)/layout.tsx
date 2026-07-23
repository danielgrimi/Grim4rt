import { Suspense } from 'react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { LogoutButton } from '@/components/admin/LogoutButton'

// The entire /admin subtree is dynamic — gated on a session cookie, always
// reading fresh data, never a candidate for a prerendered static shell. With
// cacheComponents on, Next requires an explicit Suspense boundary around any
// uncached dynamic read (requireAdmin()'s cookies() call here, plus every
// page below it) so it knows where the static shell ends. One boundary here
// covers every admin page, since they all render as `children`.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-black" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-brand-black text-brand-text">
      <header className="border-b border-brand-border">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-16">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/admin" className="font-display text-lg">Admin</Link>
            <Link href="/admin/artworks" className="text-brand-text/80 hover:text-brand-text">Obras</Link>
            <Link href="/admin/collections" className="text-brand-text/80 hover:text-brand-text">Colecciones</Link>
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
