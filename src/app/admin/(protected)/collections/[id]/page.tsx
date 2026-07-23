import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  updateCollection,
  moveArtworkInCollection,
  addArtworkToCollection,
  removeArtworkFromCollection,
} from '@/lib/actions/collections'

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: { artworks: { include: { artwork: true }, orderBy: { position: 'asc' } } },
  })
  if (!collection) notFound()

  const availableArtworks = await prisma.artwork.findMany({
    where: { isPublished: true, NOT: { id: { in: collection.artworks.map((a) => a.artworkId) } } },
    orderBy: { titleEs: 'asc' },
  })

  // Only published members are eligible covers — see updateCollection's
  // business-rule validation in src/lib/actions/collections.ts.
  const publishedMembers = collection.artworks.filter((a) => a.artwork.isPublished)

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-3xl mb-8">Editar colección</h1>
        <form action={updateCollection.bind(null, id)} className="space-y-6 max-w-md">
          <label className="block text-sm">Slug
            <input name="slug" defaultValue={collection.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Nombre (ES)
            <input name="nameEs" defaultValue={collection.nameEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Nombre (EN)
            <input name="nameEn" defaultValue={collection.nameEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Portada
            <select name="coverArtworkId" defaultValue={collection.coverArtworkId ?? ''} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
              <option value="">Sin portada</option>
              {publishedMembers.map((m) => (
                <option key={m.artworkId} value={m.artworkId}>{m.artwork.titleEs}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="px-6 py-3 bg-brand-accent text-sm">Guardar</button>
        </form>
      </div>

      <div>
        <h2 className="font-display text-2xl mb-4">Obras en esta colección</h2>
        <table className="w-full text-sm border-collapse mb-6">
          <tbody>
            {collection.artworks.map((membership, index) => (
              <tr key={membership.artworkId} className="border-b border-brand-border/50">
                <td className="py-2 pr-4">
                  <form className="flex gap-1">
                    <button formAction={moveArtworkInCollection.bind(null, id, membership.artworkId, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                    <button formAction={moveArtworkInCollection.bind(null, id, membership.artworkId, 'down')} disabled={index === collection.artworks.length - 1} aria-label="Mover abajo">↓</button>
                  </form>
                </td>
                <td className="py-2">{membership.artwork.titleEs}</td>
                <td className="text-right">
                  <form action={removeArtworkFromCollection.bind(null, id, membership.artworkId)}>
                    <button type="submit" className="text-brand-accentLight">Quitar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {availableArtworks.length > 0 && (
          <>
            <h3 className="text-sm text-brand-muted mb-2">Añadir obra</h3>
            <form
              action={async (formData: FormData) => {
                'use server'
                const artworkId = formData.get('artworkId') as string
                await addArtworkToCollection(id, artworkId)
              }}
              className="flex gap-2"
            >
              <select name="artworkId" required className="bg-brand-card border border-brand-border px-3 py-2 text-sm">
                {availableArtworks.map((a) => (
                  <option key={a.id} value={a.id}>{a.titleEs}</option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 border border-brand-border text-sm">Añadir</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
