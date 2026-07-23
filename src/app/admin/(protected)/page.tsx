import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function AdminDashboardPage() {
  const [total, available, sold, collectionCount] = await Promise.all([
    prisma.artwork.count(),
    prisma.artwork.count({ where: { status: 'AVAILABLE' } }),
    prisma.artwork.count({ where: { status: 'SOLD' } }),
    prisma.collection.count(),
  ])

  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-10">
        <StatCard label="Total de obras" value={total} />
        <StatCard label="Disponibles" value={available} />
        <StatCard label="Vendidas" value={sold} />
        <StatCard label="Colecciones" value={collectionCount} />
      </div>
      <div className="flex gap-4 text-sm">
        <Link href="/admin/artworks/new" className="underline">+ Nueva obra</Link>
        <Link href="/admin/collections/new" className="underline">+ Nueva colección</Link>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-brand-border bg-brand-card p-6">
      <div className="text-3xl font-display">{value}</div>
      <div className="text-xs text-brand-muted uppercase tracking-widest mt-2">{label}</div>
    </div>
  )
}
