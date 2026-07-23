import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { moveCollection, deleteCollection } from '@/lib/actions/collections'

export default async function AdminCollectionsPage() {
  const collections = await prisma.collection.findMany({
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { artworks: true } } },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl">Colecciones ({collections.length})</h1>
        <Link href="/admin/collections/new" className="px-4 py-2 bg-brand-accent text-sm">+ Nueva colección</Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-brand-muted border-b border-brand-border">
            <th className="py-2">Orden</th>
            <th>Nombre</th>
            <th>Slug</th>
            <th>Obras</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {collections.map((collection, index) => (
            <tr key={collection.id} className="border-b border-brand-border/50">
              <td className="py-2">
                <form className="flex gap-1">
                  <button formAction={moveCollection.bind(null, collection.id, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                  <button formAction={moveCollection.bind(null, collection.id, 'down')} disabled={index === collections.length - 1} aria-label="Mover abajo">↓</button>
                </form>
              </td>
              <td>{collection.nameEs}</td>
              <td>{collection.slug}</td>
              <td>{collection._count.artworks}</td>
              <td className="text-right">
                <Link href={`/admin/collections/${collection.id}`} className="underline mr-3">Editar</Link>
                <form className="inline" action={deleteCollection.bind(null, collection.id)}>
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
