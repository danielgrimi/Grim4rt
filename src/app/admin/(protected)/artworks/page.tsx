import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { moveArtwork, toggleArtworkPublished, deleteArtwork } from '@/lib/actions/artworks'

export default async function AdminArtworksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>
}) {
  const { q, type, status } = await searchParams

  const artworks = await prisma.artwork.findMany({
    where: {
      ...(type === 'painting' || type === 'drawing' ? { type: type.toUpperCase() as 'PAINTING' | 'DRAWING' } : {}),
      ...(status === 'available' || status === 'sold' ? { status: status.toUpperCase() as 'AVAILABLE' | 'SOLD' } : {}),
      ...(q
        ? { OR: [{ titleEs: { contains: q, mode: 'insensitive' as const } }, { titleEn: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl">Obras ({artworks.length})</h1>
        <Link href="/admin/artworks/new" className="px-4 py-2 bg-brand-accent text-sm">+ Nueva obra</Link>
      </div>

      <form className="flex flex-wrap gap-3 mb-6 text-sm" method="get">
        <input type="text" name="q" defaultValue={q ?? ''} placeholder="Buscar por título…" className="bg-brand-card border border-brand-border px-3 py-2" />
        <select name="type" defaultValue={type ?? ''} className="bg-brand-card border border-brand-border px-3 py-2">
          <option value="">Todos los tipos</option>
          <option value="painting">Pinturas</option>
          <option value="drawing">Dibujos</option>
        </select>
        <select name="status" defaultValue={status ?? ''} className="bg-brand-card border border-brand-border px-3 py-2">
          <option value="">Todos los estados</option>
          <option value="available">Disponibles</option>
          <option value="sold">Vendidas</option>
        </select>
        <button type="submit" className="px-4 py-2 border border-brand-border">Filtrar</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-brand-muted border-b border-brand-border">
            <th className="py-2">Orden</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Publicada</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {artworks.map((artwork, index) => (
            <tr key={artwork.id} className="border-b border-brand-border/50">
              <td className="py-2">
                <form className="flex gap-1">
                  <button formAction={moveArtwork.bind(null, artwork.id, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                  <button formAction={moveArtwork.bind(null, artwork.id, 'down')} disabled={index === artworks.length - 1} aria-label="Mover abajo">↓</button>
                </form>
              </td>
              <td>{artwork.titleEs}</td>
              <td>{artwork.type === 'PAINTING' ? 'Pintura' : 'Dibujo'}</td>
              <td>{artwork.status === 'AVAILABLE' ? 'Disponible' : 'Vendida'}</td>
              <td>
                <form>
                  <button formAction={toggleArtworkPublished.bind(null, artwork.id, !artwork.isPublished)}>
                    {artwork.isPublished ? 'Sí' : 'No'}
                  </button>
                </form>
              </td>
              <td className="text-right">
                <Link href={`/admin/artworks/${artwork.id}`} className="underline mr-3">Editar</Link>
                <form className="inline" action={deleteArtwork.bind(null, artwork.id)}>
                  <button type="submit" className="text-brand-accentLight">Eliminar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
